"use client";

// Daily Brain Bet — solo Wordle-shape puzzle. One curated 3-round
// puzzle per UTC day, same for everyone, one attempt per user.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getBackendUrl } from "@/lib/backend";

type EstimationRound = { type: "estimation"; questionId: string; question: string };
type BigORound = { type: "big_o"; questionId: string; language: string; code: string[]; choices: string[] };
type GeoRound = { type: "geo_trivia"; questionId: string; prompt: string; choices: string[] };
type DailyRound = EstimationRound | BigORound | GeoRound;

type Puzzle = {
  date: string;
  rounds: DailyRound[];
  resetAtUtc: string;
};

type RoundResult = {
  correct: boolean;
  answer: string | number;
  explanation: string;
  yourAnswer: unknown;
};

type SubmitResponse = {
  score: number;
  perRound: RoundResult[] | null;
  streak: { current: number; longest: number };
  alreadyPlayed: boolean;
};

type Answer =
  | { type: "estimation"; value: string }
  | { type: "big_o"; choice: string | null }
  | { type: "geo_trivia"; choice: string | null };

function makeBlankAnswer(round: DailyRound): Answer {
  if (round.type === "estimation") return { type: "estimation", value: "" };
  if (round.type === "big_o") return { type: "big_o", choice: null };
  return { type: "geo_trivia", choice: null };
}

function relTimeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DailyPage() {
  const { session, loading } = useAuth();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${getBackendUrl()}/api/daily/today`);
        if (!res.ok) throw new Error(String(res.status));
        const data: Puzzle = await res.json();
        if (cancelled) return;
        setPuzzle(data);
        setAnswers(data.rounds.map(makeBlankAnswer));
      } catch {
        if (!cancelled) setError("Couldn't load today's puzzle.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // If signed-in user already played today, jump straight to the
  // results card. Uses /status (non-destructive lookup) — calling
  // /submit with empty answers would have recorded a 0-score for
  // anyone who hadn't actually played yet.
  useEffect(() => {
    if (!session || !puzzle) return;
    let cancelled = false;
    async function checkExisting() {
      const token = session?.access_token;
      if (!token) return;
      try {
        const res = await fetch(`${getBackendUrl()}/api/daily/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: { todayScore: number | null; streak: { current: number; longest: number } } = await res.json();
        if (data.todayScore != null && !cancelled) {
          setResult({
            score: data.todayScore,
            perRound: null,
            streak: data.streak,
            alreadyPlayed: true,
          });
        }
      } catch {
        // Network blip — let the user submit normally.
      }
    }
    checkExisting();
    return () => {
      cancelled = true;
    };
  }, [session, puzzle]);

  function setAnswer(idx: number, next: Answer) {
    setAnswers((prev) => prev.map((a, i) => (i === idx ? next : a)));
  }

  async function submit() {
    if (!session || !puzzle) return;
    const token = session.access_token;
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        date: puzzle.date,
        answers: answers.map((a) =>
          a.type === "estimation" ? { value: Number(a.value) } : { choice: a.choice ?? "" },
        ),
      };
      const res = await fetch(`${getBackendUrl()}/api/daily/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data: SubmitResponse = await res.json();
      setResult(data);
    } catch {
      setError("Couldn't submit. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-6 py-12 text-muted">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-4">
        <h1 className="text-2xl font-medium text-ink">Daily Brain Bet</h1>
        <p className="text-sm text-muted">
          One puzzle a day — same one for everyone. Sign in to play and start a streak.
        </p>
        <Link href="/login" className="btn-primary inline-block">Sign in</Link>
      </div>
    );
  }

  if (error && !puzzle) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <p className="text-amber-700">{error}</p>
      </div>
    );
  }

  if (!puzzle) {
    return <div className="max-w-2xl mx-auto px-6 py-12 text-muted">Loading today&apos;s puzzle…</div>;
  }

  const ready = answers.every((a) => {
    if (a.type === "estimation") return a.value.trim() !== "" && Number.isFinite(Number(a.value));
    return a.choice != null;
  });

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-medium text-ink">Daily Brain Bet</h1>
        <span className="text-xs text-muted font-mono">{puzzle.date}</span>
      </div>
      <p className="text-sm text-muted">
        Three rounds — same for everyone today. Resets in <span className="font-mono text-ink">{relTimeUntil(puzzle.resetAtUtc)}</span>.
      </p>

      {result ? (
        <ResultCard result={result} resetIn={relTimeUntil(puzzle.resetAtUtc)} rounds={puzzle.rounds} />
      ) : (
        <>
          <ol className="space-y-4 list-none">
            {puzzle.rounds.map((round, i) => (
              <li key={round.questionId} className="card p-5 space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted">
                  Round {i + 1} · {labelFor(round.type)}
                </div>
                <RoundEntry round={round} answer={answers[i]} onChange={(a) => setAnswer(i, a)} disabled={submitting} />
              </li>
            ))}
          </ol>
          {error && <p className="text-sm text-amber-700">{error}</p>}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">One submission per day. Refresh after midnight UTC.</p>
            <button onClick={submit} disabled={!ready || submitting} className="btn-primary disabled:opacity-50">
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function labelFor(t: DailyRound["type"]): string {
  if (t === "estimation") return "Estimation";
  if (t === "big_o") return "Big-O";
  return "Geo Trivia";
}

function RoundEntry({
  round,
  answer,
  onChange,
  disabled,
}: {
  round: DailyRound;
  answer: Answer;
  onChange: (a: Answer) => void;
  disabled: boolean;
}) {
  if (round.type === "estimation" && answer.type === "estimation") {
    return (
      <div className="space-y-3">
        <p className="text-base text-ink">{round.question}</p>
        <input
          type="number"
          value={answer.value}
          onChange={(e) => onChange({ type: "estimation", value: e.target.value })}
          disabled={disabled}
          placeholder="Your guess"
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-mono focus:outline-none focus:border-sage"
        />
        <p className="text-xs text-muted">Within 25% of the true answer counts as correct.</p>
      </div>
    );
  }
  if (round.type === "big_o" && answer.type === "big_o") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted uppercase tracking-wider">{round.language}</p>
        <pre className="card p-3 text-xs font-mono leading-relaxed overflow-x-auto bg-surface">
          {round.code.join("\n")}
        </pre>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {round.choices.map((c) => (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ type: "big_o", choice: c })}
              className={`px-3 py-2 rounded-xl border text-sm transition disabled:opacity-50 ${
                answer.choice === c
                  ? "border-sage bg-sage-soft"
                  : "border-line bg-surface hover:border-sage"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (round.type === "geo_trivia" && answer.type === "geo_trivia") {
    return (
      <div className="space-y-3">
        <p className="text-base text-ink">{round.prompt}</p>
        <div className="grid grid-cols-2 gap-2">
          {round.choices.map((c) => (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ type: "geo_trivia", choice: c })}
              className={`px-3 py-2 rounded-xl border text-sm transition disabled:opacity-50 ${
                answer.choice === c
                  ? "border-sage bg-sage-soft"
                  : "border-line bg-surface hover:border-sage"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

function ResultCard({
  result,
  resetIn,
  rounds,
}: {
  result: SubmitResponse;
  resetIn: string;
  rounds: DailyRound[];
}) {
  const { score, perRound, streak, alreadyPlayed } = result;
  return (
    <div className="space-y-4">
      <div className="card p-6 text-center space-y-2 border-sage">
        <div className="text-3xl font-medium text-ink">{score} / 3</div>
        <div className="text-sm text-muted">
          {alreadyPlayed
            ? "You already played today. Come back after the reset."
            : score === 3
              ? "Clean sweep."
              : score === 0
                ? "Tough one. Try again tomorrow."
                : "Nice — partial score still extends your streak."}
        </div>
        <div className="flex items-center justify-center gap-3 pt-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-amber-700">
            <Flame className="w-4 h-4" strokeWidth={1.75} />
            <span className="font-mono">{streak.current}-day streak</span>
          </span>
          <span className="text-muted">·</span>
          <span className="text-muted">
            best <span className="font-mono text-ink">{streak.longest}</span>
          </span>
        </div>
        <div className="text-xs text-muted pt-1">Resets in {resetIn}</div>
      </div>
      {perRound && (
        <ol className="space-y-2 list-none">
          {perRound.map((r, i) => (
            <li
              key={i}
              className={`card p-4 text-sm space-y-1 ${r.correct ? "border-sage" : "border-line"}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Round {i + 1} · {labelFor(rounds[i].type)}
                </span>
                <span className={r.correct ? "text-sage-deep" : "text-amber-700"}>
                  {r.correct ? "Correct" : "Missed"}
                </span>
              </div>
              <div className="text-muted">
                Answer: <span className="font-mono text-ink">{String(r.answer)}</span>
                {r.yourAnswer != null && (
                  <span className="ml-2">
                    · You: <span className="font-mono">{String(r.yourAnswer)}</span>
                  </span>
                )}
              </div>
              {r.explanation && <div className="text-xs text-muted">{r.explanation}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
