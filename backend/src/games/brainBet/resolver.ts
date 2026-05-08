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
const DISCONNECT_GRACE_MS = 10_000;

const ROUNDS_BY_DURATION: Record<GameDuration, number> = {
  1: 3,
  5: 6,
  10: 10,
};

// ---------- iterative-betting (Brain Bet 2.0) ----------
//
// Each match: 1000-chip running stack per player. Each round opens with
// a forced 50-chip ante from each player (so folders still bleed). The
// bet phase runs simultaneously for BET_PHASE_MS — both players pick
// one action; if either times out, treat as fold. Pot allocation:
//   - both fold: chips disappear (house keeps the antes)
//   - one folds: opponent takes the pot
//   - neither folds: play the answer phase; round winner takes the pot
// Match ends as soon as ANY of these is true:
//   - either chip stack hits 0 (bust → opponent wins),
//   - the wall-clock duration elapses,
//   - all rounds in ROUNDS_BY_DURATION are played.
// In all cases, the chip-stack leader at end-of-match is passed to the
// existing settleGame() — the platform 100-pt ante / 200-pt pot is
// unchanged. Chip stacks live only in this resolver's state.
const INITIAL_CHIP_STACK = 1000;
const FORCED_ANTE = 50;
const BET_PHASE_MS = 8_000;

type BetActionType = "check" | "raise_25" | "raise_50" | "raise_100" | "all_in" | "fold";
const BET_RAISE_AMOUNT: Record<Exclude<BetActionType, "all_in" | "fold">, number> = {
  check: 0,
  raise_25: 25,
  raise_50: 50,
  raise_100: 100,
};

type BetAction = {
  type: BetActionType;
  // Voluntary chips committed beyond the 50 forced ante. For all_in,
  // this is whatever the player had left after the forced ante.
  raise: number;
};
type RoundPhase = "reveal" | "bet" | "answer" | "showdown";

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
  // Iterative betting layer (Brain Bet 2.0)
  phase: RoundPhase;
  // Chips currently in the pot — antes + raises. Folders contribute
  // their forced ante; non-folders contribute their forced ante + raise.
  pot: number;
  // Voluntary bet actions per player, set during the bet phase.
  bets: Record<SocketId, BetAction | undefined>;
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
  // Running chip stack per player. Initialized to INITIAL_CHIP_STACK
  // and updated at end-of-round based on bet outcome.
  chipStacks: Record<SocketId, number>;
  // Phase timers. betPhaseTimer fires if both players haven't submitted
  // a bet action within BET_PHASE_MS — auto-folds the laggers.
  betPhaseTimer: NodeJS.Timeout | null;
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
    const chipStacks: Record<SocketId, number> = {};
    for (const p of game.players) {
      scores[p.socketId] = 0;
      chipStacks[p.socketId] = INITIAL_CHIP_STACK;
    }
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
      chipStacks,
      betPhaseTimer: null,
      roundTimer: null,
      postRoundTimer: null,
      disconnectTimers: {},
    };
  }

  start() {
    this.startRound();
  }

  // Replays the current round_start to one specific socket. Called from
  // the `request_round_state` socket handler when a fresh client mounts
  // the game page after round_start was already emitted to the room.
  replayCurrentState(socketId: SocketId): void {
    if (this.game.resolved) return;
    const round = this.state.currentRound;
    if (!round) return;
    this.emitRoundStartTo(round, socketId);
  }

  // Emits the round_start payload for `round` to one specific socket.
  // Indian Poker tailors per-player (each sees only the OPPONENT card);
  // every other round type has a uniform payload. Used by both
  // startRound (looping over players) and replayCurrentState.
  private emitRoundStartTo(round: Round, socketId: SocketId): void {
    const base = {
      gameId: this.game.id,
      // Brain Bet 2.0 fields — clients use these to render the chip
      // stack bar and the bet-phase UI. The phase tells the client
      // whether to show the answer UI (phase=answer), the bet UI
      // (phase=bet), or just the round preview (phase=reveal).
      phase: round.phase,
      pot: round.pot,
      chipStacks: this.publicChipStacks(),
      type: "round_start" as const,
      round: round.index,
      total: round.total,
      scores: this.publicScores(),
      endsAt: round.endsAt,
    };
    let payloadEvent: Record<string, unknown>;
    if (round.type === "indian_poker") {
      const ip = round.state as IndianPokerState;
      const opp = this.game.players.find((p) => p.socketId !== socketId);
      const opponentCard = opp ? ip.cards[opp.socketId] : null;
      payloadEvent = {
        ...base,
        roundType: "indian_poker",
        payload: { opponentCard, opponentHandle: opp?.handle ?? null },
      };
    } else if (round.type === "estimation") {
      const es = round.state as EstimationState;
      const q = QUESTIONS.find((x) => x.id === es.questionId);
      payloadEvent = {
        ...base,
        roundType: "estimation",
        payload: { question: q?.question ?? "" },
      };
    } else if (round.type === "chicken") {
      payloadEvent = {
        ...base,
        roundType: "chicken",
        payload: { range: [1, 10], bustThreshold: 8 },
      };
    } else if (round.type === "big_o") {
      const bs = round.state as BigOState;
      const q = BIG_O_BANK.find((x) => x.id === bs.questionId);
      payloadEvent = {
        ...base,
        roundType: "big_o",
        payload: {
          language: q?.language ?? "",
          code: q?.code ?? [],
          choices: BIG_O_CHOICES,
        },
      };
    } else if (round.type === "monty_mirage") {
      const ms = round.state as MontyMirageState;
      const q = MONTY_BANK.find((x) => x.id === ms.questionId);
      payloadEvent = {
        ...base,
        roundType: "monty_mirage",
        payload: { prompt: q?.prompt ?? "" },
      };
    } else if (round.type === "geo_trivia") {
      const gs = round.state as GeoTriviaState;
      const q = GEO_BANK.find((x) => x.id === gs.questionId);
      payloadEvent = {
        ...base,
        roundType: "geo_trivia",
        payload: { prompt: q?.prompt ?? "", choices: q?.choices ?? [] },
      };
    } else {
      const ss = round.state as StockDirectionState;
      payloadEvent = {
        ...base,
        roundType: "stock_direction",
        payload: { visiblePrices: ss.visiblePrices, magnitudeMax: 20 },
      };
    }
    this.io.to(socketId).emit("game_state_update", payloadEvent);
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
      // endsAt is set when the answer phase opens (depends on round type).
      // During reveal/bet, it's a placeholder so the type stays Round.
      endsAt: now + BET_PHASE_MS + ROUND_TIMEOUT_MS[type],
      resolved: false,
      winnerSocketId: null,
      state: roundState,
      phase: "reveal",
      pot: 0,
      bets: {},
    };
    this.state.currentRound = round;

    // Per-player emit (uniform payload for most round types; Indian
    // Poker tailors per-socket so each player sees only the opponent's
    // card). Looping always, even for uniform rounds, keeps the payload
    // shape identical between startRound and replayCurrentState.
    for (const p of this.game.players) {
      this.emitRoundStartTo(round, p.socketId);
    }

    // Brief reveal pause (clients render the round, see chip stacks),
    // then open the bet phase.
    if (this.state.betPhaseTimer) clearTimeout(this.state.betPhaseTimer);
    this.state.betPhaseTimer = setTimeout(() => this.openBetPhase(round), 1200);
  }

  private openBetPhase(round: Round) {
    if (this.game.resolved || round.resolved || round !== this.state.currentRound) return;
    // Deduct the forced ante from each player's chip stack (capped at
    // whatever they have — if the stack is below 50, take all of it).
    for (const p of this.game.players) {
      const taken = Math.min(this.state.chipStacks[p.socketId] ?? 0, FORCED_ANTE);
      this.state.chipStacks[p.socketId] = (this.state.chipStacks[p.socketId] ?? 0) - taken;
      round.pot += taken;
    }
    round.phase = "bet";
    this.io.to(this.game.roomId).emit("game_state_update", {
      gameId: this.game.id,
      type: "phase_change",
      phase: "bet",
      betWindowMs: BET_PHASE_MS,
      pot: round.pot,
      chipStacks: this.publicChipStacks(),
    });
    if (this.state.betPhaseTimer) clearTimeout(this.state.betPhaseTimer);
    this.state.betPhaseTimer = setTimeout(() => this.closeBetPhase(round), BET_PHASE_MS);
    this.scheduleBotBet(round);
  }

  // Records a player's bet and, if both players have submitted, advances
  // to the answer phase (or directly to showdown if anyone folded).
  private handleBetAction(round: Round, socketId: SocketId, bet: BetAction) {
    if (round.bets[socketId] != null) return; // duplicate
    const stackBefore = this.state.chipStacks[socketId] ?? 0;
    let raise = 0;
    if (bet.type === "all_in") {
      raise = stackBefore;
    } else if (bet.type === "raise_25" || bet.type === "raise_50" || bet.type === "raise_100") {
      const want = BET_RAISE_AMOUNT[bet.type];
      if (stackBefore < want) return; // not enough — UI should have hidden the option
      raise = want;
    } else if (bet.type === "check" || bet.type === "fold") {
      raise = 0;
    } else {
      return; // invalid bet type
    }
    this.state.chipStacks[socketId] = stackBefore - raise;
    round.pot += raise;
    round.bets[socketId] = { type: bet.type, raise };
    // Private confirmation to the better; the public phase_change will
    // come at close time so opponents don't see your bet during the bet
    // window itself.
    this.io.to(socketId).emit("game_state_update", {
      gameId: this.game.id,
      type: "bet_recorded",
      bet: round.bets[socketId],
      chipStack: this.state.chipStacks[socketId],
      pot: round.pot,
    });
    // Both players bet — close immediately.
    if (this.game.players.every((p) => round.bets[p.socketId] != null)) {
      this.closeBetPhase(round);
    }
  }

  private closeBetPhase(round: Round) {
    if (this.game.resolved || round.resolved || round !== this.state.currentRound) return;
    if (round.phase !== "bet") return;
    if (this.state.betPhaseTimer) {
      clearTimeout(this.state.betPhaseTimer);
      this.state.betPhaseTimer = null;
    }
    // Auto-fold any player who didn't submit before the window closed.
    for (const p of this.game.players) {
      if (round.bets[p.socketId] == null) {
        round.bets[p.socketId] = { type: "fold", raise: 0 };
      }
    }
    const folders = this.game.players.filter((p) => round.bets[p.socketId]?.type === "fold");
    // Reveal both bets to both players now that the window is closed.
    this.io.to(this.game.roomId).emit("game_state_update", {
      gameId: this.game.id,
      type: "bet_phase_closed",
      bets: this.game.players.reduce(
        (acc, p) => {
          acc[p.socketId] = round.bets[p.socketId]!;
          return acc;
        },
        {} as Record<SocketId, BetAction>,
      ),
      pot: round.pot,
      chipStacks: this.publicChipStacks(),
    });
    if (folders.length === 2) {
      // Both fold — chips disappear (house keeps the antes). No answer
      // phase, no winner. Pot is consumed.
      this.finishRound(round, null, { kind: "fold_resolved", reason: "both_folded" });
      return;
    }
    if (folders.length === 1) {
      const winner = this.game.players.find((p) => round.bets[p.socketId]?.type !== "fold")!;
      this.finishRound(round, winner.socketId, { kind: "fold_resolved", reason: "one_folded" });
      return;
    }
    this.openAnswerPhase(round);
  }

  private openAnswerPhase(round: Round) {
    if (this.game.resolved || round.resolved || round !== this.state.currentRound) return;
    round.phase = "answer";
    const now = Date.now();
    round.endsAt = now + ROUND_TIMEOUT_MS[round.type];
    this.io.to(this.game.roomId).emit("game_state_update", {
      gameId: this.game.id,
      type: "phase_change",
      phase: "answer",
      endsAt: round.endsAt,
    });
    if (this.state.roundTimer) clearTimeout(this.state.roundTimer);
    this.state.roundTimer = setTimeout(() => this.timeoutRound(), ROUND_TIMEOUT_MS[round.type]);
    this.scheduleBotAnswer(round);
  }

  // Bot driver — only fires when this game has isBotMatch=true. The
  // bot lives entirely in this resolver: synthetic socketId, no real
  // Socket.IO connection, never seen by the leaderboard.
  private scheduleBotBet(round: Round) {
    if (!this.game.isBotMatch || !this.game.botSocketId) return;
    const botId = this.game.botSocketId;
    const myStack = this.state.chipStacks[botId] ?? 0;
    // 70% check, 15% raise_25, 10% raise_50, 5% fold. Skip raises if
    // the bot can't afford them. Stagger 1.5–3 s so the human sees the
    // panel and feels the moment.
    const delay = 1500 + Math.random() * 1500;
    setTimeout(() => {
      if (round.resolved || round !== this.state.currentRound || round.phase !== "bet") return;
      const r = Math.random();
      let choice: BetActionType;
      if (r < 0.7) choice = "check";
      else if (r < 0.85 && myStack >= 25) choice = "raise_25";
      else if (r < 0.95 && myStack >= 50) choice = "raise_50";
      else choice = "fold";
      this.handleBetAction(round, botId, { type: choice, raise: 0 });
    }, delay);
  }

  private scheduleBotAnswer(round: Round) {
    if (!this.game.isBotMatch || !this.game.botSocketId) return;
    const botId = this.game.botSocketId;
    // Stagger 2–6 s so the answer doesn't snap in instantly. Bot
    // accuracy is calibrated to "honest amateur" — ~55% on objective
    // questions, deterministic-optimal on Monty Hall, info-aware on
    // Indian Poker.
    const delay = 2000 + Math.random() * 4000;
    setTimeout(() => {
      if (round.resolved || round !== this.state.currentRound || round.phase !== "answer") return;
      this.handleAction(botId, this.computeBotAnswer(round, botId));
    }, delay);
  }

  private computeBotAnswer(round: Round, botId: SocketId): unknown {
    if (round.type === "indian_poker") {
      const ip = round.state as IndianPokerState;
      // Bot can see the human's card (per Indian Poker rules — each
      // player sees the OPPONENT's card). High opponent → fold.
      const humanCard = Object.entries(ip.cards).find(([id]) => id !== botId)?.[1] ?? null;
      const choice =
        humanCard != null && humanCard >= 9
          ? "fold"
          : humanCard != null && humanCard <= 5
            ? "bet"
            : Math.random() < 0.5 ? "bet" : "fold";
      return { type: "indian_poker_decide", choice };
    }
    if (round.type === "estimation") {
      const es = round.state as EstimationState;
      const noise = (Math.random() - 0.5) * 0.6; // ±30%
      return { type: "estimation_submit", value: Math.max(1, Math.round(es.answer * (1 + noise))) };
    }
    if (round.type === "chicken") {
      // 3–6 most of the time, occasional 7 (riskier).
      const v = Math.random() < 0.85 ? 3 + Math.floor(Math.random() * 4) : 7;
      return { type: "chicken_pick", value: v };
    }
    if (round.type === "big_o") {
      const bs = round.state as BigOState;
      const correct = Math.random() < 0.55;
      const choice = correct ? bs.answer : BIG_O_CHOICES[Math.floor(Math.random() * BIG_O_CHOICES.length)];
      return { type: "big_o_lock", choice };
    }
    if (round.type === "monty_mirage") {
      const ms = round.state as MontyMirageState;
      // Always switch — the optimal Monty Hall move regardless of
      // problem framing. Bot wins this round at the door's optimal rate.
      return { type: "monty_mirage_submit", value: ms.answer };
    }
    if (round.type === "geo_trivia") {
      const gs = round.state as GeoTriviaState;
      const q = GEO_BANK.find((x) => x.id === gs.questionId);
      const choices = q?.choices ?? [gs.answer];
      const correct = Math.random() < 0.55;
      const choice = correct ? gs.answer : choices[Math.floor(Math.random() * choices.length)];
      return { type: "geo_trivia_lock", choice };
    }
    // stock_direction
    const ss = round.state as StockDirectionState;
    const correct = Math.random() < 0.55;
    return {
      type: "stock_direction_submit",
      direction: correct
        ? ss.answerDirection
        : ss.answerDirection === "up" ? "down" : "up",
      magnitude: Math.max(0, Math.min(20, Math.round(ss.answerMagnitude + (Math.random() - 0.5) * 8))),
    };
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

    // Bet-phase actions are routed separately from answer-phase actions.
    // This is the central guard that protects the iterative-betting
    // invariant: bets MUST be locked in before the answer is revealed.
    if (a.type === "bet") {
      if (round.phase !== "bet") return;
      const choice = (a.choice || "").toString() as BetActionType;
      if (
        choice !== "check" &&
        choice !== "raise_25" &&
        choice !== "raise_50" &&
        choice !== "raise_100" &&
        choice !== "all_in" &&
        choice !== "fold"
      ) return;
      if (!this.game.players.some((p) => p.socketId === socketId)) return;
      this.handleBetAction(round, socketId, { type: choice, raise: 0 });
      return;
    }

    // Every other action belongs to the answer phase. Reject if the
    // round hasn't transitioned out of reveal/bet yet.
    if (round.phase !== "answer") return;

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
    round.phase = "showdown";
    round.winnerSocketId = winnerSocketId;
    if (this.state.roundTimer) clearTimeout(this.state.roundTimer);
    if (this.state.betPhaseTimer) clearTimeout(this.state.betPhaseTimer);

    // Legacy round-win counter — kept so frontends that still display
    // "round score" continue to work. Final winner is chip leader.
    if (winnerSocketId) {
      this.state.scores[winnerSocketId] = (this.state.scores[winnerSocketId] || 0) + 1;
    }

    // Pot allocation. Chips were already debited from stacks when the
    // forced ante / raises hit the pot. Here we transfer the pot back
    // out to the winner (or split on tie, or zero-out on both-folded).
    const bothFolded = this.game.players.every((p) => round.bets[p.socketId]?.type === "fold");
    const chipDelta: Record<SocketId, number> = {};
    for (const p of this.game.players) chipDelta[p.socketId] = 0;
    if (bothFolded) {
      // House keeps the antes — chips disappear from the system. No
      // delta to record; the pot just evaporates.
    } else if (winnerSocketId) {
      this.state.chipStacks[winnerSocketId] = (this.state.chipStacks[winnerSocketId] || 0) + round.pot;
      chipDelta[winnerSocketId] = round.pot;
    } else {
      // Tie (no winner) — split pot evenly. Any odd chip goes to the
      // first player by socketId order; trivial fairness call.
      const half = Math.floor(round.pot / 2);
      const remainder = round.pot - half * 2;
      const [a, b] = this.game.players;
      this.state.chipStacks[a.socketId] = (this.state.chipStacks[a.socketId] || 0) + half + remainder;
      this.state.chipStacks[b.socketId] = (this.state.chipStacks[b.socketId] || 0) + half;
      chipDelta[a.socketId] = half + remainder;
      chipDelta[b.socketId] = half;
    }

    this.io.to(this.game.roomId).emit("game_state_update", {
      gameId: this.game.id,
      type: "round_resolved",
      roundType: round.type,
      round: round.index,
      total: round.total,
      scores: this.publicScores(),
      chipStacks: this.publicChipStacks(),
      chipDelta,
      pot: round.pot,
      winnerSocketId,
      reveal,
    });

    // Bust: if anyone is at zero chips, end the match immediately.
    const survivor = this.game.players.find((p) => (this.state.chipStacks[p.socketId] || 0) > 0);
    const allBust = this.game.players.every((p) => (this.state.chipStacks[p.socketId] || 0) <= 0);
    if (allBust) {
      // Edge case: both went to zero on the same round. Tie at the
      // table; settle the platform pot as a tie.
      if (this.state.postRoundTimer) clearTimeout(this.state.postRoundTimer);
      this.state.postRoundTimer = setTimeout(() => this.endGame(null, "bust_tie"), POST_ROUND_PAUSE_MS);
      return;
    }
    if (survivor && this.game.players.some((p) => (this.state.chipStacks[p.socketId] || 0) <= 0)) {
      if (this.state.postRoundTimer) clearTimeout(this.state.postRoundTimer);
      this.state.postRoundTimer = setTimeout(() => this.endGame(survivor.socketId, "bust"), POST_ROUND_PAUSE_MS);
      return;
    }

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
    if (this.state.betPhaseTimer) clearTimeout(this.state.betPhaseTimer);
    for (const t of Object.values(this.state.disconnectTimers)) clearTimeout(t);

    let winnerSocketId: SocketId | null;
    if (forcedWinnerSocketId !== undefined) {
      winnerSocketId = forcedWinnerSocketId;
    } else {
      // Iterative-betting Brain Bet: chip-stack leader wins. Falls back
      // to the legacy round-win count on a chip-stack tie (rare but
      // possible after a clean sweep of zero-raise rounds).
      const [a, b] = this.game.players;
      const aChips = this.state.chipStacks[a.socketId] || 0;
      const bChips = this.state.chipStacks[b.socketId] || 0;
      if (aChips > bChips) winnerSocketId = a.socketId;
      else if (bChips > aChips) winnerSocketId = b.socketId;
      else {
        const aScore = this.state.scores[a.socketId] || 0;
        const bScore = this.state.scores[b.socketId] || 0;
        if (aScore > bScore) winnerSocketId = a.socketId;
        else if (bScore > aScore) winnerSocketId = b.socketId;
        else winnerSocketId = null;
      }
    }
    const winnerUserId =
      winnerSocketId == null
        ? null
        : this.game.players.find((p) => p.socketId === winnerSocketId)?.userId ?? null;

    // Bot matches skip the platform-points settlement entirely — no
    // chargeAntes ran at game start, no settleGame at end. The chip
    // stacks still moved during the game (so the chip leader is real)
    // but no real points change hands and the bot doesn't appear in
    // game_rounds / point_transactions.
    let settle: { outcome: "win" | "tie"; payout: number; newBalances: Record<string, number> };
    if (this.game.isBotMatch) {
      settle = {
        outcome: winnerSocketId == null ? "tie" : "win",
        payout: 0,
        newBalances: {},
      };
    } else {
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
    }

    this.io.to(this.game.roomId).emit("game_resolved", {
      gameId: this.game.id,
      reason,
      scores: this.publicScores(),
      chipStacks: this.publicChipStacks(),
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
    if (this.state.betPhaseTimer) clearTimeout(this.state.betPhaseTimer);
    for (const t of Object.values(this.state.disconnectTimers)) clearTimeout(t);

    // Bot matches never anted, so there's nothing to refund.
    if (!this.game.isBotMatch) {
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
    }

    this.io.to(this.game.roomId).emit("game_aborted", {
      gameId: this.game.id,
      reason,
    });
    games.delete(this.game.id);
    roomGame.delete(this.game.roomId);
    liveRunners.delete(this.game.id);
  }

  private publicChipStacks(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of this.game.players) {
      out[p.socketId] = this.state.chipStacks[p.socketId] || 0;
    }
    return out;
  }

  private publicScores(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of this.game.players) {
      out[p.handle] = this.state.scores[p.socketId] || 0;
    }
    return out;
  }
}
