import type { Server } from "socket.io";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Game, SocketId, UserId, GameDuration } from "../../state.js";
import { games, roomGame } from "../../state.js";
import type { GameRunner } from "../types.js";
import { liveRunners } from "../types.js";
import { settleGame } from "../transferPoints.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SNIPPETS = JSON.parse(readFileSync(path.join(here, "snippets.json"), "utf8")) as Snippet[];

type Snippet = {
  id: string;
  language: string;
  code: string[];
  buggy_line: number;
  explanation: string;
};

const ROUND_TIMEOUT_MS = 45_000;
const POST_ROUND_PAUSE_MS = 2500;
const DISCONNECT_GRACE_MS = 10_000;

const ROUNDS_BY_DURATION: Record<GameDuration, number> = {
  1: 3,
  5: 6,
  10: 10,
};

type Round = {
  index: number;
  total: number;
  snippetId: string;
  buggyLine: number;
  startedAt: number;
  endsAt: number;
  resolved: boolean;
  winnerSocketId: SocketId | null;
  clicks: Record<SocketId, number>;
};

type State = {
  scores: Record<SocketId, number>;
  totalRounds: number;
  roundIdx: number;
  currentRound: Round | null;
  usedSnippetIds: Set<string>;
  roundTimer: NodeJS.Timeout | null;
  postRoundTimer: NodeJS.Timeout | null;
  disconnectTimers: Record<SocketId, NodeJS.Timeout>;
  // Map of userId -> current socketId (kept current when a player reconnects).
  socketByUser: Record<UserId, SocketId>;
};

export class SpotTheBugGame implements GameRunner {
  private state: State;
  constructor(private game: Game, private io: Server) {
    const totalRounds = ROUNDS_BY_DURATION[game.durationMin] ?? 3;
    const scores: Record<SocketId, number> = {};
    const socketByUser: Record<UserId, SocketId> = {};
    for (const p of game.players) {
      scores[p.socketId] = 0;
      socketByUser[p.userId] = p.socketId;
    }
    this.state = {
      scores,
      totalRounds,
      roundIdx: 0,
      currentRound: null,
      usedSnippetIds: new Set(),
      roundTimer: null,
      postRoundTimer: null,
      disconnectTimers: {},
      socketByUser,
    };
  }

  start() {
    this.startRound();
  }

  private startRound() {
    if (this.game.resolved) return;
    this.state.roundIdx += 1;
    const snippet = this.pickSnippet();
    this.state.usedSnippetIds.add(snippet.id);

    const now = Date.now();
    const round: Round = {
      index: this.state.roundIdx,
      total: this.state.totalRounds,
      snippetId: snippet.id,
      buggyLine: snippet.buggy_line,
      startedAt: now,
      endsAt: now + ROUND_TIMEOUT_MS,
      resolved: false,
      winnerSocketId: null,
      clicks: {},
    };
    this.state.currentRound = round;

    this.io.to(this.game.roomId).emit("game_state_update", {
      gameId: this.game.id,
      type: "round_start",
      round: round.index,
      total: round.total,
      scores: this.publicScores(),
      snippet: { id: snippet.id, language: snippet.language, code: snippet.code },
      endsAt: round.endsAt,
    });

    if (this.state.roundTimer) clearTimeout(this.state.roundTimer);
    this.state.roundTimer = setTimeout(() => {
      this.resolveRound(null, "timeout");
    }, ROUND_TIMEOUT_MS);
  }

  private pickSnippet(): Snippet {
    const pool = SNIPPETS.filter((s) => !this.state.usedSnippetIds.has(s.id));
    const arr = pool.length > 0 ? pool : SNIPPETS;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  handleAction(socketId: SocketId, action: unknown) {
    const a = action as { type?: string; line?: number };
    if (a?.type !== "click_line") return;
    const line = Number(a.line);
    if (!Number.isInteger(line) || line < 1) return;

    const round = this.state.currentRound;
    if (!round || round.resolved) return;

    const player = this.game.players.find((p) => p.socketId === socketId);
    if (!player) return;
    if (round.clicks[socketId] != null) return; // already clicked this round

    round.clicks[socketId] = line;

    // Echo the click only to the clicker (so they see their lock).
    this.io.to(socketId).emit("game_state_update", {
      gameId: this.game.id,
      type: "click_recorded",
      round: round.index,
      line,
    });

    if (line === round.buggyLine) {
      this.resolveRound(socketId, "correct");
      return;
    }

    // Both clicked wrong -> draw round
    const allClicked = this.game.players.every((p) => round.clicks[p.socketId] != null);
    if (allClicked) {
      this.resolveRound(null, "both_wrong");
    }
  }

  private resolveRound(winnerSocketId: SocketId | null, _reason: string) {
    const round = this.state.currentRound;
    if (!round || round.resolved) return;
    round.resolved = true;
    round.winnerSocketId = winnerSocketId;

    if (this.state.roundTimer) clearTimeout(this.state.roundTimer);

    if (winnerSocketId) {
      this.state.scores[winnerSocketId] = (this.state.scores[winnerSocketId] || 0) + 1;
    }

    const snippet = SNIPPETS.find((s) => s.id === round.snippetId);
    this.io.to(this.game.roomId).emit("game_state_update", {
      gameId: this.game.id,
      type: "round_resolved",
      round: round.index,
      total: round.total,
      scores: this.publicScores(),
      buggyLine: round.buggyLine,
      explanation: snippet?.explanation ?? "",
      winnerSocketId,
      clicks: round.clicks,
    });

    if (this.state.postRoundTimer) clearTimeout(this.state.postRoundTimer);
    this.state.postRoundTimer = setTimeout(() => {
      if (this.state.roundIdx >= this.state.totalRounds) {
        this.endGame();
      } else {
        this.startRound();
      }
    }, POST_ROUND_PAUSE_MS);
  }

  handleDisconnect(socketId: SocketId) {
    if (this.game.resolved) return;
    const player = this.game.players.find((p) => p.socketId === socketId);
    if (!player) return;
    player.disconnectedAt = Date.now();

    this.io.to(this.game.roomId).emit("game_state_update", {
      gameId: this.game.id,
      type: "player_disconnected",
      socketId,
      graceMs: DISCONNECT_GRACE_MS,
    });

    if (this.state.disconnectTimers[socketId]) clearTimeout(this.state.disconnectTimers[socketId]);
    this.state.disconnectTimers[socketId] = setTimeout(() => {
      // Forfeit: opponent wins by default, unless both disconnected.
      const others = this.game.players.filter((p) => p.socketId !== socketId);
      const someoneStillHere = others.some((p) => p.disconnectedAt == null);
      if (someoneStillHere) {
        const opp = others.find((p) => p.disconnectedAt == null);
        this.endGame(opp?.socketId ?? null, "forfeit");
      } else {
        this.endGame(null, "double_forfeit");
      }
    }, DISCONNECT_GRACE_MS);
  }

  handleReconnect(socketId: SocketId, userId: UserId): boolean {
    if (this.game.resolved) return false;
    const player = this.game.players.find((p) => p.userId === userId);
    if (!player) return false;

    const oldSocketId = player.socketId;
    player.socketId = socketId;
    player.disconnectedAt = null;
    this.state.socketByUser[userId] = socketId;
    if (this.state.scores[oldSocketId] != null && oldSocketId !== socketId) {
      this.state.scores[socketId] = this.state.scores[oldSocketId];
      delete this.state.scores[oldSocketId];
    }

    if (this.state.disconnectTimers[oldSocketId]) {
      clearTimeout(this.state.disconnectTimers[oldSocketId]);
      delete this.state.disconnectTimers[oldSocketId];
    }

    this.io.to(this.game.roomId).emit("game_state_update", {
      gameId: this.game.id,
      type: "player_reconnected",
      userId,
      socketId,
    });
    return true;
  }

  private async endGame(forcedWinnerSocketId?: SocketId | null, reason: string = "rounds_complete") {
    if (this.game.resolved) return;
    this.game.resolved = true;

    if (this.state.roundTimer) clearTimeout(this.state.roundTimer);
    if (this.state.postRoundTimer) clearTimeout(this.state.postRoundTimer);
    for (const t of Object.values(this.state.disconnectTimers)) clearTimeout(t);

    let winnerSocketId: SocketId | null;
    if (forcedWinnerSocketId !== undefined) {
      winnerSocketId = forcedWinnerSocketId;
    } else {
      const [a, b] = this.game.players;
      const aScore = this.state.scores[a.socketId] || 0;
      const bScore = this.state.scores[b.socketId] || 0;
      if (aScore > bScore) winnerSocketId = a.socketId;
      else if (bScore > aScore) winnerSocketId = b.socketId;
      else winnerSocketId = null;
    }

    const winnerUserId =
      winnerSocketId === null
        ? null
        : this.game.players.find((p) => p.socketId === winnerSocketId)?.userId ?? null;

    let settle;
    try {
      const [a, b] = this.game.players;
      settle = await settleGame({
        gameRoundId: (this.game as Game & { gameRoundId?: string }).gameRoundId!,
        ante: this.game.ante,
        playerAId: a.userId,
        playerBId: b.userId,
        winnerId: winnerUserId,
        pendingRefundIds: this.game.pendingRefundIds,
      });
    } catch (err) {
      console.error("[spot_the_bug] settle failed", (err as Error).message);
      this.io.to(this.game.roomId).emit("game_aborted", {
        gameId: this.game.id,
        reason: "settle_failed",
      });
      games.delete(this.game.id);
      roomGame.delete(this.game.roomId);
      liveRunners.delete(this.game.id);
      return;
    }

    this.io.to(this.game.roomId).emit("game_resolved", {
      gameId: this.game.id,
      reason,
      scores: this.publicScores(),
      winnerSocketId,
      winnerUserId,
      outcome: settle.outcome,
      payout: settle.payout,
      newBalances: settle.newBalances,
    });

    games.delete(this.game.id);
    roomGame.delete(this.game.roomId);
    liveRunners.delete(this.game.id);
  }

  async abort(reason: string) {
    if (this.game.resolved) return;
    this.game.resolved = true;
    if (this.state.roundTimer) clearTimeout(this.state.roundTimer);
    if (this.state.postRoundTimer) clearTimeout(this.state.postRoundTimer);
    for (const t of Object.values(this.state.disconnectTimers)) clearTimeout(t);

    // Refund both antes (settle as a tie).
    try {
      const [a, b] = this.game.players;
      await settleGame({
        gameRoundId: (this.game as Game & { gameRoundId?: string }).gameRoundId!,
        ante: this.game.ante,
        playerAId: a.userId,
        playerBId: b.userId,
        winnerId: null,
        pendingRefundIds: this.game.pendingRefundIds,
      });
    } catch (err) {
      console.error("[spot_the_bug] abort refund failed", (err as Error).message);
      // Pending refunds row stays unprocessed and the cold-start refunder
      // will handle it later — money is not lost.
    }

    this.io.to(this.game.roomId).emit("game_aborted", {
      gameId: this.game.id,
      reason,
    });
    games.delete(this.game.id);
    roomGame.delete(this.game.roomId);
    liveRunners.delete(this.game.id);
  }

  private publicScores(): Record<string, number> {
    // Scores keyed by handle for display.
    const out: Record<string, number> = {};
    for (const p of this.game.players) {
      out[p.handle] = this.state.scores[p.socketId] || 0;
    }
    return out;
  }
}
