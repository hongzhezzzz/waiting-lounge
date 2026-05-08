// Brain Bet — mixed-bag head-to-head game. Each round is randomly drawn
// from a small bag of round types (Indian Poker, Estimation Battle,
// Chicken Numbers in v1). The game-level structure mirrors Spot the Bug:
// both players ante at start, play N rounds each scoring 0–1 points,
// higher-score-after-rounds wins the pot, ties refund both antes.

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
const QUESTIONS = JSON.parse(
  readFileSync(path.join(here, "estimationBank.json"), "utf8"),
) as EstimationQuestion[];
const BIG_O_BANK = JSON.parse(
  readFileSync(path.join(here, "bigOBank.json"), "utf8"),
) as BigOQuestion[];
const MONTY_BANK = JSON.parse(
  readFileSync(path.join(here, "montyMirageBank.json"), "utf8"),
) as MontyQuestion[];
const GEO_BANK = JSON.parse(
  readFileSync(path.join(here, "geoTriviaBank.json"), "utf8"),
) as GeoQuestion[];
const STOCK_BANK = JSON.parse(
  readFileSync(path.join(here, "stockDirectionBank.json"), "utf8"),
) as StockQuestion[];

type EstimationQuestion = {
  id: string;
  question: string;
  answer: number;
  explanation: string;
};
type BigOQuestion = {
  id: string;
  language: string;
  code: string[];
  answer: string;
  explanation: string;
};
const BIG_O_CHOICES = [
  "O(1)",
  "O(log log n)",
  "O(log n)",
  "O(n)",
  "O(n log n)",
  "O(n^2)",
  "O(n^3)",
  "O(2^n)",
  "O(m + n)",
  "O(m*n)",
  "O(V + E)",
] as const;
type MontyQuestion = {
  id: string;
  prompt: string;
  answer: number;
  explanation: string;
};
type GeoQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
};
type StockQuestion = {
  id: string;
  prices: number[]; // 60 points; first 30 visible, last 30 hidden
  answer: { direction: "up" | "down"; magnitude: number };
  explanation: string;
};

type RoundType = "indian_poker" | "estimation" | "chicken" | "big_o" | "monty_mirage" | "geo_trivia" | "stock_direction";
const ALL_ROUND_TYPES: ReadonlyArray<RoundType> = [
  "indian_poker", "estimation", "chicken", "big_o", "monty_mirage", "geo_trivia", "stock_direction",
];

const ROUND_TIMEOUT_MS: Record<RoundType, number> = {
  indian_poker: 18_000,
  estimation: 35_000,
  chicken: 18_000,
  big_o: 30_000,
  monty_mirage: 30_000,
  geo_trivia: 18_000,
  stock_direction: 30_000,
};
const POST_ROUND_PAUSE_MS = 3000;
// Delay between game_started and the very first round_start so the
// receiving clients have time to navigate to the game page and subscribe
// to game_state_update. See start() below.
const FIRST_ROUND_DELAY_MS = 800;
const DISCONNECT_GRACE_MS = 10_000;

const ROUNDS_BY_DURATION: Record<GameDuration, number> = {
  1: 3,
  5: 6,
  10: 10,
};

// ---------- per-round-type state shapes ----------

type IndianPokerState = {
  type: "indian_poker";
  // socketId -> hidden card value (1-13). Players see opponent's value, not their own.
  cards: Record<SocketId, number>;
  // socketId -> "bet" | "fold" | undefined (no decision yet)
  decisions: Record<SocketId, "bet" | "fold" | undefined>;
};

type EstimationState = {
  type: "estimation";
  questionId: string;
  answer: number;
  // socketId -> submitted integer | undefined
  submissions: Record<SocketId, number | undefined>;
};

type ChickenState = {
  type: "chicken";
  picks: Record<SocketId, number | undefined>;
};

type BigOState = {
  type: "big_o";
  questionId: string;
  answer: string;
  // socketId -> the choice they locked, or "wrong" / "correct" status
  locks: Record<SocketId, string | undefined>;
};

type MontyMirageState = {
  type: "monty_mirage";
  questionId: string;
  answer: number;
  submissions: Record<SocketId, number | undefined>;
};

type GeoTriviaState = {
  type: "geo_trivia";
  questionId: string;
  answer: string;
  locks: Record<SocketId, string | undefined>;
};

type StockDirectionState = {
  type: "stock_direction";
  questionId: string;
  visiblePrices: number[]; // first 30
  hiddenPrices: number[];  // last 30
  answerDirection: "up" | "down";
  answerMagnitude: number; // % change from prices[29] to prices[59]
  submissions: Record<SocketId, { direction: "up" | "down"; magnitude: number } | undefined>;
};

type RoundState = IndianPokerState | EstimationState | ChickenState | BigOState | MontyMirageState | GeoTriviaState | StockDirectionState;

type Round = {
  index: number;
  total: number;
  type: RoundType;
  startedAt: number;
  endsAt: number;
  resolved: boolean;
  winnerSocketId: SocketId | null;
  state: RoundState;
};

type State = {
  scores: Record<SocketId, number>;
  totalRounds: number;
  roundIdx: number;
  currentRound: Round | null;
  usedQuestionIds: Set<string>;
  usedBigOIds: Set<string>;
  usedMontyIds: Set<string>;
  usedGeoIds: Set<string>;
  usedStockIds: Set<string>;
  roundTimer: NodeJS.Timeout | null;
  postRoundTimer: NodeJS.Timeout | null;
  disconnectTimers: Record<SocketId, NodeJS.Timeout>;
};

// ---------- the main runner ----------

export class BrainBetGame implements GameRunner {
  private state: State;
  constructor(private game: Game, private io: Server) {
    const totalRounds = ROUNDS_BY_DURATION[game.durationMin] ?? 3;
    const scores: Record<SocketId, number> = {};
    for (const p of game.players) scores[p.socketId] = 0;
    this.state = {
      scores,
      totalRounds,
      roundIdx: 0,
      currentRound: null,
      usedQuestionIds: new Set(),
      usedBigOIds: new Set(),
      usedMontyIds: new Set(),
      usedGeoIds: new Set(),
      usedStockIds: new Set(),
      roundTimer: null,
      postRoundTimer: null,
      disconnectTimers: {},
    };
  }

  start() {
    // Defer the first round_start so freshly-arriving clients have time
    // to navigate to /games/[gameType]/[roomId] and subscribe to
    // game_state_update before the round opens. Without this, a client
    // mid-router-push when game_started fires can miss round_start and
    // sit idle until the round timer ticks (up to ~30 s for some round
    // types). 800 ms covers Next.js client-side navigation in the
    // common case while still feeling near-instant.
    setTimeout(() => this.startRound(), FIRST_ROUND_DELAY_MS);
  }

  private startRound() {
    if (this.game.resolved) return;
    this.state.roundIdx += 1;
    const type = this.pickRoundType();
    const roundState = this.initRoundState(type);
    const now = Date.now();
    const round: Round = {
      index: this.state.roundIdx,
      total: this.state.totalRounds,
      type,
      startedAt: now,
      endsAt: now + ROUND_TIMEOUT_MS[type],
      resolved: false,
      winnerSocketId: null,
      state: roundState,
    };
    this.state.currentRound = round;

    // Emit round_start with the public payload for this round type. For
    // Indian Poker, each player gets a tailored payload (they see the
    // OPPONENT's card but not their own).
    if (type === "indian_poker") {
      const ip = roundState as IndianPokerState;
      for (const p of this.game.players) {
        const opp = this.game.players.find((x) => x.socketId !== p.socketId);
        const opponentCard = opp ? ip.cards[opp.socketId] : null;
        this.io.to(p.socketId).emit("game_state_update", {
          gameId: this.game.id,
          type: "round_start",
          roundType: "indian_poker",
          round: round.index,
          total: round.total,
          scores: this.publicScores(),
          endsAt: round.endsAt,
          payload: {
            opponentCard,
            opponentHandle: opp?.handle ?? null,
          },
        });
      }
    } else if (type === "estimation") {
      const es = roundState as EstimationState;
      const q = QUESTIONS.find((x) => x.id === es.questionId);
      this.io.to(this.game.roomId).emit("game_state_update", {
        gameId: this.game.id,
        type: "round_start",
        roundType: "estimation",
        round: round.index,
        total: round.total,
        scores: this.publicScores(),
        endsAt: round.endsAt,
        payload: { question: q?.question ?? "" },
      });
    } else if (type === "chicken") {
      this.io.to(this.game.roomId).emit("game_state_update", {
        gameId: this.game.id,
        type: "round_start",
        roundType: "chicken",
        round: round.index,
        total: round.total,
        scores: this.publicScores(),
        endsAt: round.endsAt,
        payload: { range: [1, 10], bustThreshold: 8 },
      });
    } else if (type === "big_o") {
      const bs = roundState as BigOState;
      const q = BIG_O_BANK.find((x) => x.id === bs.questionId);
      this.io.to(this.game.roomId).emit("game_state_update", {
        gameId: this.game.id,
        type: "round_start",
        roundType: "big_o",
        round: round.index,
        total: round.total,
        scores: this.publicScores(),
        endsAt: round.endsAt,
        payload: {
          language: q?.language ?? "",
          code: q?.code ?? [],
          choices: BIG_O_CHOICES,
        },
      });
    } else if (type === "monty_mirage") {
      const ms = roundState as MontyMirageState;
      const q = MONTY_BANK.find((x) => x.id === ms.questionId);
      this.io.to(this.game.roomId).emit("game_state_update", {
        gameId: this.game.id,
        type: "round_start",
        roundType: "monty_mirage",
        round: round.index,
        total: round.total,
        scores: this.publicScores(),
        endsAt: round.endsAt,
        payload: { prompt: q?.prompt ?? "" },
      });
    } else if (type === "geo_trivia") {
      const gs = roundState as GeoTriviaState;
      const q = GEO_BANK.find((x) => x.id === gs.questionId);
      this.io.to(this.game.roomId).emit("game_state_update", {
        gameId: this.game.id,
        type: "round_start",
        roundType: "geo_trivia",
        round: round.index,
        total: round.total,
        scores: this.publicScores(),
        endsAt: round.endsAt,
        payload: { prompt: q?.prompt ?? "", choices: q?.choices ?? [] },
      });
    } else {
      // stock_direction — only the first 30 prices are sent to clients.
      const ss = roundState as StockDirectionState;
      this.io.to(this.game.roomId).emit("game_state_update", {
        gameId: this.game.id,
        type: "round_start",
        roundType: "stock_direction",
        round: round.index,
        total: round.total,
        scores: this.publicScores(),
        endsAt: round.endsAt,
        payload: { visiblePrices: ss.visiblePrices, magnitudeMax: 20 },
      });
    }

    if (this.state.roundTimer) clearTimeout(this.state.roundTimer);
    this.state.roundTimer = setTimeout(() => this.timeoutRound(), ROUND_TIMEOUT_MS[type]);
  }

  private pickRoundType(): RoundType {
    return ALL_ROUND_TYPES[Math.floor(Math.random() * ALL_ROUND_TYPES.length)];
  }

  private initRoundState(type: RoundType): RoundState {
    if (type === "indian_poker") {
      const cards: Record<SocketId, number> = {};
      // Two random cards 1-13. Allow duplicates (it's a small deck;
      // duplicates → tie, which is fine).
      for (const p of this.game.players) {
        cards[p.socketId] = Math.floor(Math.random() * 13) + 1;
      }
      return { type, cards, decisions: {} };
    }
    if (type === "estimation") {
      const pool = QUESTIONS.filter((q) => !this.state.usedQuestionIds.has(q.id));
      const arr = pool.length > 0 ? pool : QUESTIONS;
      const q = arr[Math.floor(Math.random() * arr.length)];
      this.state.usedQuestionIds.add(q.id);
      return { type, questionId: q.id, answer: q.answer, submissions: {} };
    }
    if (type === "big_o") {
      const pool = BIG_O_BANK.filter((q) => !this.state.usedBigOIds.has(q.id));
      const arr = pool.length > 0 ? pool : BIG_O_BANK;
      const q = arr[Math.floor(Math.random() * arr.length)];
      this.state.usedBigOIds.add(q.id);
      return { type, questionId: q.id, answer: q.answer, locks: {} };
    }
    if (type === "monty_mirage") {
      const pool = MONTY_BANK.filter((q) => !this.state.usedMontyIds.has(q.id));
      const arr = pool.length > 0 ? pool : MONTY_BANK;
      const q = arr[Math.floor(Math.random() * arr.length)];
      this.state.usedMontyIds.add(q.id);
      return { type, questionId: q.id, answer: q.answer, submissions: {} };
    }
    if (type === "geo_trivia") {
      const pool = GEO_BANK.filter((q) => !this.state.usedGeoIds.has(q.id));
      const arr = pool.length > 0 ? pool : GEO_BANK;
      const q = arr[Math.floor(Math.random() * arr.length)];
      this.state.usedGeoIds.add(q.id);
      return { type, questionId: q.id, answer: q.answer, locks: {} };
    }
    if (type === "stock_direction") {
      const pool = STOCK_BANK.filter((q) => !this.state.usedStockIds.has(q.id));
      const arr = pool.length > 0 ? pool : STOCK_BANK;
      const q = arr[Math.floor(Math.random() * arr.length)];
      this.state.usedStockIds.add(q.id);
      return {
        type,
        questionId: q.id,
        visiblePrices: q.prices.slice(0, 30),
        hiddenPrices: q.prices.slice(30, 60),
        answerDirection: q.answer.direction,
        answerMagnitude: q.answer.magnitude,
        submissions: {},
      };
    }
    return { type: "chicken", picks: {} };
  }

  handleAction(socketId: SocketId, action: unknown) {
    const round = this.state.currentRound;
    if (!round || round.resolved) return;
    const a = action as { type?: string; choice?: string; value?: number };
    if (!a) return;

    if (round.type === "indian_poker" && a.type === "indian_poker_decide") {
      const ip = round.state as IndianPokerState;
      if (ip.decisions[socketId] != null) return;
      if (a.choice !== "bet" && a.choice !== "fold") return;
      ip.decisions[socketId] = a.choice;
      this.io.to(socketId).emit("game_state_update", {
        gameId: this.game.id,
        type: "decision_recorded",
        round: round.index,
        choice: a.choice,
      });
      const allDecided = this.game.players.every((p) => ip.decisions[p.socketId] != null);
      if (allDecided) this.resolveIndianPoker(round);
      return;
    }

    if (round.type === "estimation" && a.type === "estimation_submit") {
      const es = round.state as EstimationState;
      if (es.submissions[socketId] != null) return;
      if (typeof a.value !== "number" || !Number.isFinite(a.value)) return;
      es.submissions[socketId] = Math.round(a.value);
      this.io.to(socketId).emit("game_state_update", {
        gameId: this.game.id,
        type: "submission_recorded",
        round: round.index,
        value: Math.round(a.value),
      });
      const allSubmitted = this.game.players.every((p) => es.submissions[p.socketId] != null);
      if (allSubmitted) this.resolveEstimation(round);
      return;
    }

    if (round.type === "chicken" && a.type === "chicken_pick") {
      const cs = round.state as ChickenState;
      if (cs.picks[socketId] != null) return;
      const v = Number(a.value);
      if (!Number.isInteger(v) || v < 1 || v > 10) return;
      cs.picks[socketId] = v;
      this.io.to(socketId).emit("game_state_update", {
        gameId: this.game.id,
        type: "pick_recorded",
        round: round.index,
        value: v,
      });
      const allPicked = this.game.players.every((p) => cs.picks[p.socketId] != null);
      if (allPicked) this.resolveChicken(round);
      return;
    }

    if (round.type === "big_o" && a.type === "big_o_lock") {
      this.handleLockAnswer(round, socketId, String(a.choice ?? ""), () => this.resolveBigO(round));
      return;
    }

    if (round.type === "monty_mirage" && a.type === "monty_mirage_submit") {
      const ms = round.state as MontyMirageState;
      if (ms.submissions[socketId] != null) return;
      if (typeof a.value !== "number" || !Number.isFinite(a.value)) return;
      const v = Math.max(0, Math.min(100, Math.round(a.value)));
      ms.submissions[socketId] = v;
      this.io.to(socketId).emit("game_state_update", {
        gameId: this.game.id,
        type: "submission_recorded",
        round: round.index,
        value: v,
      });
      const allSubmitted = this.game.players.every((p) => ms.submissions[p.socketId] != null);
      if (allSubmitted) this.resolveMontyMirage(round);
      return;
    }

    if (round.type === "geo_trivia" && a.type === "geo_trivia_lock") {
      this.handleLockAnswer(round, socketId, String(a.choice ?? ""), () => this.resolveGeoTrivia(round));
      return;
    }

    if (round.type === "stock_direction" && a.type === "stock_direction_submit") {
      const ss = round.state as StockDirectionState;
      if (ss.submissions[socketId] != null) return;
      const ax = a as { direction?: string; magnitude?: number };
      if (ax.direction !== "up" && ax.direction !== "down") return;
      if (typeof ax.magnitude !== "number" || !Number.isFinite(ax.magnitude)) return;
      const mag = Math.max(0, Math.min(20, ax.magnitude));
      ss.submissions[socketId] = { direction: ax.direction, magnitude: mag };
      this.io.to(socketId).emit("game_state_update", {
        gameId: this.game.id,
        type: "submission_recorded",
        round: round.index,
        value: { direction: ax.direction, magnitude: mag },
      });
      const allSubmitted = this.game.players.every((p) => ss.submissions[p.socketId] != null);
      if (allSubmitted) this.resolveStockDirection(round);
      return;
    }
  }

  // Shared helper for "first correct lock wins" round types (Big-O, Geo Trivia).
  // - Correct lock: the locker wins immediately, round resolves.
  // - Wrong lock: this player is locked out. If the other player has also
  //   locked wrong (or has no time left), resolve with no winner.
  private handleLockAnswer(round: Round, socketId: SocketId, choice: string, onComplete: () => void) {
    const state = round.state as BigOState | GeoTriviaState;
    if (state.locks[socketId] != null) return;
    if (!choice) return;

    const correct = choice === state.answer;
    state.locks[socketId] = correct ? "correct" : choice;

    this.io.to(socketId).emit("game_state_update", {
      gameId: this.game.id,
      type: "lock_recorded",
      round: round.index,
      correct,
    });

    if (correct) {
      // First correct lock wins immediately.
      this.finishRound(round, socketId, this.lockReveal(round));
      return;
    }
    // Wrong: see if both have locked → both wrong → no winner.
    const allLocked = this.game.players.every((p) => state.locks[p.socketId] != null);
    if (allLocked) onComplete();
  }

  private lockReveal(round: Round): Record<string, unknown> {
    const state = round.state as BigOState | GeoTriviaState;
    if (state.type === "big_o") {
      const q = BIG_O_BANK.find((x) => x.id === state.questionId);
      return {
        answer: state.answer,
        explanation: q?.explanation ?? "",
        locks: state.locks,
      };
    }
    const q = GEO_BANK.find((x) => x.id === state.questionId);
    return {
      answer: state.answer,
      explanation: q?.explanation ?? "",
      locks: state.locks,
    };
  }

  private resolveBigO(round: Round) {
    // Called when both have locked and neither was correct (or on timeout).
    this.finishRound(round, null, this.lockReveal(round));
  }

  private resolveGeoTrivia(round: Round) {
    this.finishRound(round, null, this.lockReveal(round));
  }

  private resolveStockDirection(round: Round) {
    const ss = round.state as StockDirectionState;
    const [a, b] = this.game.players;
    const aSub = ss.submissions[a.socketId];
    const bSub = ss.submissions[b.socketId];
    let winnerSocketId: SocketId | null = null;
    const aRight = aSub?.direction === ss.answerDirection;
    const bRight = bSub?.direction === ss.answerDirection;
    if (aRight && bRight) {
      // Both got direction — closer magnitude wins. Strict tie → no winner.
      const aDist = Math.abs((aSub?.magnitude ?? 0) - ss.answerMagnitude);
      const bDist = Math.abs((bSub?.magnitude ?? 0) - ss.answerMagnitude);
      if (aDist < bDist) winnerSocketId = a.socketId;
      else if (bDist < aDist) winnerSocketId = b.socketId;
    } else if (aRight) winnerSocketId = a.socketId;
    else if (bRight) winnerSocketId = b.socketId;
    // both wrong → no winner

    const q = STOCK_BANK.find((x) => x.id === ss.questionId);
    this.finishRound(round, winnerSocketId, {
      hiddenPrices: ss.hiddenPrices,
      answerDirection: ss.answerDirection,
      answerMagnitude: ss.answerMagnitude,
      explanation: q?.explanation ?? "",
      submissions: ss.submissions,
    });
  }

  private resolveMontyMirage(round: Round) {
    const ms = round.state as MontyMirageState;
    const [a, b] = this.game.players;
    const aSub = ms.submissions[a.socketId];
    const bSub = ms.submissions[b.socketId];
    let winnerSocketId: SocketId | null = null;
    if (aSub == null && bSub == null) winnerSocketId = null;
    else if (aSub == null) winnerSocketId = b.socketId;
    else if (bSub == null) winnerSocketId = a.socketId;
    else {
      const aDist = Math.abs(aSub - ms.answer);
      const bDist = Math.abs(bSub - ms.answer);
      if (aDist < bDist) winnerSocketId = a.socketId;
      else if (bDist < aDist) winnerSocketId = b.socketId;
    }
    const q = MONTY_BANK.find((x) => x.id === ms.questionId);
    this.finishRound(round, winnerSocketId, {
      answer: ms.answer,
      explanation: q?.explanation ?? "",
      submissions: ms.submissions,
    });
  }

  private resolveIndianPoker(round: Round) {
    const ip = round.state as IndianPokerState;
    const [a, b] = this.game.players;
    const aDecide = ip.decisions[a.socketId];
    const bDecide = ip.decisions[b.socketId];
    let winnerSocketId: SocketId | null = null;
    if (aDecide === "bet" && bDecide === "fold") winnerSocketId = a.socketId;
    else if (bDecide === "bet" && aDecide === "fold") winnerSocketId = b.socketId;
    else if (aDecide === "bet" && bDecide === "bet") {
      if (ip.cards[a.socketId] > ip.cards[b.socketId]) winnerSocketId = a.socketId;
      else if (ip.cards[b.socketId] > ip.cards[a.socketId]) winnerSocketId = b.socketId;
      // tie → null
    }
    // Both fold (or undefined→treat as fold) → null

    this.finishRound(round, winnerSocketId, {
      cards: ip.cards,
      decisions: ip.decisions,
    });
  }

  private resolveEstimation(round: Round) {
    const es = round.state as EstimationState;
    const [a, b] = this.game.players;
    const aSub = es.submissions[a.socketId];
    const bSub = es.submissions[b.socketId];
    let winnerSocketId: SocketId | null = null;
    if (aSub == null && bSub == null) {
      winnerSocketId = null;
    } else if (aSub == null) {
      winnerSocketId = b.socketId;
    } else if (bSub == null) {
      winnerSocketId = a.socketId;
    } else {
      const aDist = Math.abs(aSub - es.answer);
      const bDist = Math.abs(bSub - es.answer);
      if (aDist < bDist) winnerSocketId = a.socketId;
      else if (bDist < aDist) winnerSocketId = b.socketId;
      // exact tie → null
    }
    const q = QUESTIONS.find((x) => x.id === es.questionId);
    this.finishRound(round, winnerSocketId, {
      answer: es.answer,
      explanation: q?.explanation ?? "",
      submissions: es.submissions,
    });
  }

  private resolveChicken(round: Round) {
    const cs = round.state as ChickenState;
    const [a, b] = this.game.players;
    const aPick = cs.picks[a.socketId] ?? 0;
    const bPick = cs.picks[b.socketId] ?? 0;
    let winnerSocketId: SocketId | null = null;
    let bust = false;
    if (aPick >= 8 && bPick >= 8) {
      bust = true; // both lose
    } else if (aPick > bPick) winnerSocketId = a.socketId;
    else if (bPick > aPick) winnerSocketId = b.socketId;
    this.finishRound(round, winnerSocketId, {
      picks: cs.picks,
      bust,
      bustThreshold: 8,
    });
  }

  private finishRound(round: Round, winnerSocketId: SocketId | null, reveal: Record<string, unknown>) {
    if (round.resolved) return;
    round.resolved = true;
    round.winnerSocketId = winnerSocketId;
    if (this.state.roundTimer) clearTimeout(this.state.roundTimer);

    if (winnerSocketId) {
      this.state.scores[winnerSocketId] = (this.state.scores[winnerSocketId] || 0) + 1;
    }

    this.io.to(this.game.roomId).emit("game_state_update", {
      gameId: this.game.id,
      type: "round_resolved",
      roundType: round.type,
      round: round.index,
      total: round.total,
      scores: this.publicScores(),
      winnerSocketId,
      reveal,
    });

    if (this.state.postRoundTimer) clearTimeout(this.state.postRoundTimer);
    this.state.postRoundTimer = setTimeout(() => {
      if (this.state.roundIdx >= this.state.totalRounds) this.endGame();
      else this.startRound();
    }, POST_ROUND_PAUSE_MS);
  }

  private timeoutRound() {
    const round = this.state.currentRound;
    if (!round || round.resolved) return;
    if (round.type === "indian_poker") this.resolveIndianPoker(round);
    else if (round.type === "estimation") this.resolveEstimation(round);
    else if (round.type === "chicken") this.resolveChicken(round);
    else if (round.type === "big_o") this.resolveBigO(round);
    else if (round.type === "monty_mirage") this.resolveMontyMirage(round);
    else if (round.type === "geo_trivia") this.resolveGeoTrivia(round);
    else this.resolveStockDirection(round);
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
      const others = this.game.players.filter((p) => p.socketId !== socketId);
      const stillHere = others.find((p) => p.disconnectedAt == null);
      this.endGame(stillHere ? stillHere.socketId : null, "forfeit");
    }, DISCONNECT_GRACE_MS);
  }

  handleReconnect(socketId: SocketId, userId: UserId): boolean {
    if (this.game.resolved) return false;
    const player = this.game.players.find((p) => p.userId === userId);
    if (!player) return false;
    const oldSocketId = player.socketId;
    player.socketId = socketId;
    player.disconnectedAt = null;
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
      winnerSocketId == null
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
      console.error("[brain_bet] settle failed", (err as Error).message);
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
      console.error("[brain_bet] abort refund failed", (err as Error).message);
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
    const out: Record<string, number> = {};
    for (const p of this.game.players) {
      out[p.handle] = this.state.scores[p.socketId] || 0;
    }
    return out;
  }
}
