// Daily Brain Bet — one solo Wordle-shape puzzle per UTC day. Same 3
// questions for everyone, deterministic from the date string.
//
// GET /api/daily/today   (no auth) — today's questions, no answers.
// POST /api/daily/submit (auth)    — record attempt, return score + streak.
//
// One attempt per user per UTC day. Streak grows by 1 if last_play was
// yesterday, resets to 1 otherwise.

import express, { type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { query, withTx } from "../db/index.js";
import { verifySupabaseJwt } from "../auth/supabase.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK_DIR = path.resolve(here, "../games/brainBet");

type EstimationQuestion = { id: string; question: string; answer: number; explanation: string };
type BigOQuestion = { id: string; language: string; code: string[]; answer: string; explanation: string };
type GeoQuestion = { id: string; prompt: string; choices: string[]; answer: string; explanation: string };

const ESTIMATION = JSON.parse(
  readFileSync(path.join(BANK_DIR, "estimationBank.json"), "utf8"),
) as EstimationQuestion[];
const BIG_O = JSON.parse(
  readFileSync(path.join(BANK_DIR, "bigOBank.json"), "utf8"),
) as BigOQuestion[];
const GEO = JSON.parse(
  readFileSync(path.join(BANK_DIR, "geoTriviaBank.json"), "utf8"),
) as GeoQuestion[];

const BIG_O_CHOICES = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)", "O(2^n)"];

// Estimation tolerance: solo "correct" is within 25% of the true answer.
// Looser than the multiplayer "closer wins" rule because there's no
// opponent to bound your guess.
const ESTIMATION_TOLERANCE = 0.25;

// Deterministic 32-bit hash of a string (FNV-1a). Same string → same
// hash, no salt needed.
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Linear-congruential PRNG seeded by `hashSeed`. Sequence is identical
// across servers as long as the date string is identical.
function makeRng(dateUtc: string): () => number {
  let state = hashSeed(dateUtc);
  return () => {
    // Numerical Recipes constants.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pickFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function utcDateString(d = new Date()): string {
  // YYYY-MM-DD in UTC, regardless of server tz.
  return d.toISOString().slice(0, 10);
}

function nextUtcMidnight(now: Date): string {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0,
  ));
  return next.toISOString();
}

type DailyRound =
  | { type: "estimation"; questionId: string; question: string }
  | { type: "big_o"; questionId: string; language: string; code: string[]; choices: string[] }
  | { type: "geo_trivia"; questionId: string; prompt: string; choices: string[] };

function buildPuzzle(dateUtc: string): { rounds: DailyRound[]; answers: { type: string; questionId: string; answer: string | number; explanation: string }[] } {
  const rng = makeRng(dateUtc);
  // Fixed shape: one of each round type. Order is also deterministic.
  const est = pickFrom(ESTIMATION, rng);
  const big = pickFrom(BIG_O, rng);
  const geo = pickFrom(GEO, rng);
  const rounds: DailyRound[] = [
    { type: "estimation", questionId: est.id, question: est.question },
    { type: "big_o", questionId: big.id, language: big.language, code: big.code, choices: BIG_O_CHOICES },
    { type: "geo_trivia", questionId: geo.id, prompt: geo.prompt, choices: geo.choices },
  ];
  const answers = [
    { type: "estimation", questionId: est.id, answer: est.answer, explanation: est.explanation },
    { type: "big_o", questionId: big.id, answer: big.answer, explanation: big.explanation },
    { type: "geo_trivia", questionId: geo.id, answer: geo.answer, explanation: geo.explanation },
  ];
  return { rounds, answers };
}

function scoreAnswer(idx: number, given: unknown, truth: { type: string; answer: string | number }): boolean {
  if (truth.type === "estimation") {
    const v = Number(given);
    if (!Number.isFinite(v)) return false;
    const ans = Number(truth.answer);
    if (ans === 0) return v === 0;
    return Math.abs(v - ans) / Math.abs(ans) <= ESTIMATION_TOLERANCE;
  }
  return String(given) === String(truth.answer);
}

export function createDailyRouter() {
  const router = express.Router();

  router.get("/today", (_req: Request, res: Response) => {
    const dateUtc = utcDateString();
    const { rounds } = buildPuzzle(dateUtc);
    res.json({
      date: dateUtc,
      rounds,
      resetAtUtc: nextUtcMidnight(new Date()),
    });
  });

  router.post("/submit", async (req: Request, res: Response) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Sign in required." });
    let claims;
    try {
      claims = await verifySupabaseJwt(token);
    } catch {
      return res.status(401).json({ error: "Invalid session." });
    }
    const email = (claims.email || "").toString();
    if (!email) return res.status(401).json({ error: "Invalid session." });

    const userRow = await query<{ id: string }>(
      `select id from users where email = $1`,
      [email],
    );
    if (!userRow.rows[0]) {
      return res.status(404).json({ error: "Account not found." });
    }
    const userId = userRow.rows[0].id;

    const dateUtc = utcDateString();
    const submittedDate = (req.body?.date || "").toString();
    if (submittedDate !== dateUtc) {
      return res.status(400).json({ error: "Stale puzzle — refresh the page." });
    }
    const submittedAnswers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    if (submittedAnswers.length !== 3) {
      return res.status(400).json({ error: "Expected 3 answers." });
    }

    const { answers } = buildPuzzle(dateUtc);

    // Idempotency: if they already submitted today, return their existing score.
    const existing = await query<{ score: number }>(
      `select score from daily_brain_bet_attempts where user_id = $1 and date_utc = $2`,
      [userId, dateUtc],
    );
    if (existing.rows[0]) {
      const streak = await getStreak(userId);
      return res.json({
        score: existing.rows[0].score,
        perRound: null,
        streak,
        alreadyPlayed: true,
      });
    }

    let score = 0;
    const perRound: Array<{
      correct: boolean;
      answer: string | number;
      explanation: string;
      yourAnswer: unknown;
    }> = [];
    for (let i = 0; i < 3; i++) {
      const truth = answers[i];
      const given = submittedAnswers[i];
      let value: unknown = null;
      if (truth.type === "estimation") {
        value = Number(given?.value);
      } else if (truth.type === "big_o") {
        value = String(given?.choice ?? "");
      } else if (truth.type === "geo_trivia") {
        value = String(given?.choice ?? "");
      }
      const correct = scoreAnswer(i, value, truth);
      if (correct) score++;
      perRound.push({
        correct,
        answer: truth.answer,
        explanation: truth.explanation,
        yourAnswer: value,
      });
    }

    // Persist + update streak in one transaction.
    let newStreak = { current: 0, longest: 0 };
    try {
      await withTx(async (client) => {
        await client.query(
          `insert into daily_brain_bet_attempts (user_id, date_utc, score)
           values ($1, $2, $3)`,
          [userId, dateUtc, score],
        );
        const sRow = await client.query<{
          current_streak: number;
          longest_streak: number;
          last_play_date: string | null;
        }>(
          `select current_streak, longest_streak, last_play_date
             from daily_streaks where user_id = $1 for update`,
          [userId],
        );
        const yesterday = (() => {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - 1);
          return d.toISOString().slice(0, 10);
        })();
        let current = 1;
        let longest = 1;
        if (sRow.rows[0]) {
          const last = sRow.rows[0].last_play_date;
          if (last === dateUtc) {
            // Shouldn't happen — already-played case is caught above —
            // but safe-default to keeping the existing streak.
            current = sRow.rows[0].current_streak;
          } else if (last === yesterday) {
            current = sRow.rows[0].current_streak + 1;
          } else {
            current = 1;
          }
          longest = Math.max(sRow.rows[0].longest_streak, current);
          await client.query(
            `update daily_streaks
                set current_streak = $2, longest_streak = $3, last_play_date = $4
              where user_id = $1`,
            [userId, current, longest, dateUtc],
          );
        } else {
          await client.query(
            `insert into daily_streaks (user_id, current_streak, longest_streak, last_play_date)
             values ($1, 1, 1, $2)`,
            [userId, dateUtc],
          );
        }
        newStreak = { current, longest };
      });
    } catch (err) {
      console.error("[daily] submit failed", (err as Error).message);
      return res.status(500).json({ error: "Could not record attempt." });
    }

    res.json({
      score,
      perRound,
      streak: newStreak,
      alreadyPlayed: false,
    });
  });

  // /status — non-destructive "what's my daily state?" lookup. Returns
  // today's score if the user has already played, plus the current
  // streak. Both the Daily page (to jump straight to results) and the
  // header StreakChip use this endpoint.
  router.get("/status", async (req: Request, res: Response) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const empty = { todayScore: null as number | null, streak: { current: 0, longest: 0 } };
    if (!token) return res.json(empty);
    try {
      const claims = await verifySupabaseJwt(token);
      const email = (claims.email || "").toString();
      const userRow = await query<{ id: string }>(
        `select id from users where email = $1`,
        [email],
      );
      if (!userRow.rows[0]) return res.json(empty);
      const userId = userRow.rows[0].id;
      const dateUtc = utcDateString();
      const todayRow = await query<{ score: number }>(
        `select score from daily_brain_bet_attempts where user_id = $1 and date_utc = $2`,
        [userId, dateUtc],
      );
      const streak = await getStreak(userId);
      res.json({
        todayScore: todayRow.rows[0]?.score ?? null,
        streak,
      });
    } catch {
      res.json(empty);
    }
  });

  return router;
}

async function getStreak(userId: string): Promise<{ current: number; longest: number }> {
  const r = await query<{ current_streak: number; longest_streak: number; last_play_date: string | null }>(
    `select current_streak, longest_streak, last_play_date
       from daily_streaks where user_id = $1`,
    [userId],
  );
  if (!r.rows[0]) return { current: 0, longest: 0 };
  // If they haven't played today AND missed yesterday, the displayed
  // streak is broken even though we haven't reset it server-side yet —
  // mask it as 0 so the UI doesn't promise a streak that's already gone.
  const today = utcDateString();
  const yesterday = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const last = r.rows[0].last_play_date;
  const liveCurrent =
    last === today || last === yesterday ? r.rows[0].current_streak : 0;
  return { current: liveCurrent, longest: r.rows[0].longest_streak };
}
