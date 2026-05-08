"use client";

import { useEffect, useState } from "react";

export type BrainBetRoundType =
  | "indian_poker"
  | "estimation"
  | "chicken"
  | "big_o"
  | "monty_mirage"
  | "geo_trivia"
  | "stock_direction";

export type BrainBetPhase = "reveal" | "bet" | "answer" | "showdown";

export type BetActionType =
  | "check"
  | "raise_25"
  | "raise_50"
  | "raise_100"
  | "all_in"
  | "fold";

export type BrainBetRoundView = {
  round: number;
  total: number;
  endsAt: number;
  scores: Record<string, number>;
  // Iterative-betting fields. Server emits these on round_start +
  // phase_change. The chip stacks update at every phase boundary;
  // myBet / peerBet stay null until the bet phase closes.
  phase: BrainBetPhase;
  pot: number;
  chipStacks: Record<string, number>;
  betWindowEndsAt: number | null;
  myBet: { type: BetActionType; raise: number } | null;
  peerBet: { type: BetActionType; raise: number } | null;
  mySocketId: string | null;
  peerSocketId: string | null;
  myHandle: string | null;
  peerHandle: string | null;
  roundType: BrainBetRoundType;
  payload: unknown; // type-specific
  myDecision: unknown; // null until I act
  resolved?: {
    winnerSocketId: string | null;
    reveal: Record<string, unknown>;
    mySocketId: string | null;
  };
  // dispatchers
  onBet: (choice: BetActionType) => void;
  onIndianPoker: (choice: "bet" | "fold") => void;
  onEstimation: (value: number) => void;
  onChicken: (value: number) => void;
  onBigO: (choice: string) => void;
  onMontyMirage: (value: number) => void;
  onGeoTrivia: (choice: string) => void;
  onStockDirection: (direction: "up" | "down", magnitude: number) => void;
};

export function BrainBetRound(p: BrainBetRoundView) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Phase-aware countdown. During "bet" we show the bet-window timer;
  // during "answer" we show the round timer; in reveal/showdown nothing.
  const phaseEndsAt = p.phase === "bet" ? p.betWindowEndsAt : p.phase === "answer" ? p.endsAt : null;
  const remaining = phaseEndsAt != null ? Math.max(0, Math.ceil((phaseEndsAt - now) / 1000)) : 0;
  const phaseLabel =
    p.phase === "reveal" ? "starting" :
    p.phase === "bet" ? "place your bet" :
    p.phase === "answer" ? "answer" :
    "showdown";

  const myStack = p.mySocketId ? p.chipStacks[p.mySocketId] ?? 0 : 0;
  const peerStack = p.peerSocketId ? p.chipStacks[p.peerSocketId] ?? 0 : 0;

  const ribbon = (
    <div className="flex items-center justify-between text-sm mb-3">
      <span className="text-muted">
        Round <span className="font-mono text-ink">{p.round}</span> /{" "}
        <span className="font-mono">{p.total}</span>
        <span className="ml-2 text-xs uppercase tracking-wider text-muted">
          {labelFor(p.roundType)}
        </span>
        <span className="ml-3 text-xs uppercase tracking-wider text-sage-deep">
          {phaseLabel}
        </span>
      </span>
      <span className="font-mono text-sm">
        {phaseEndsAt != null && !p.resolved ? (
          <span className={remaining <= 3 ? "text-amber-700" : "text-ink"}>{remaining}s</span>
        ) : (
          <span className="text-muted">{p.resolved ? "resolved" : "—"}</span>
        )}
      </span>
    </div>
  );

  // Disable answer-phase action handlers if we are not yet in the
  // answer phase. The backend rejects out-of-phase actions either way;
  // this keeps the buttons visually inactive too.
  const canAnswer = p.phase === "answer" && !p.resolved;
  const sub: BrainBetRoundView = canAnswer ? p : {
    ...p,
    onIndianPoker: () => {},
    onEstimation: () => {},
    onChicken: () => {},
    onBigO: () => {},
    onMontyMirage: () => {},
    onGeoTrivia: () => {},
    onStockDirection: () => {},
  };

  let body: React.ReactNode = null;
  if (p.roundType === "indian_poker") body = <IndianPokerView {...sub} />;
  else if (p.roundType === "estimation") body = <EstimationView {...sub} />;
  else if (p.roundType === "chicken") body = <ChickenView {...sub} />;
  else if (p.roundType === "big_o") body = <BigOView {...sub} />;
  else if (p.roundType === "monty_mirage") body = <MontyMirageView {...sub} />;
  else if (p.roundType === "geo_trivia") body = <GeoTriviaView {...sub} />;
  else if (p.roundType === "stock_direction") body = <StockDirectionView {...sub} />;

  return (
    <div className="space-y-4">
      {ribbon}
      <ChipBar
        myHandle={p.myHandle}
        peerHandle={p.peerHandle}
        myStack={myStack}
        peerStack={peerStack}
        pot={p.pot}
      />
      {p.phase === "bet" && !p.myBet && !p.resolved && (
        <BetPhasePanel myStack={myStack} pot={p.pot} onBet={p.onBet} />
      )}
      {p.phase === "bet" && p.myBet && !p.resolved && (
        <div className="card p-4 text-center text-sm text-muted">
          You: <span className="font-mono text-ink">{betLabel(p.myBet.type)}</span>{p.myBet.raise > 0 ? ` (+${p.myBet.raise})` : ""}.
          Waiting for opponent…
        </div>
      )}
      {p.phase === "answer" && !p.resolved && (p.myBet || p.peerBet) && (
        <div className="text-xs text-muted text-center">
          Bets in. Pot: <span className="font-mono text-ink">{p.pot}</span>.
          You {betLabel(p.myBet?.type ?? "check")}, opponent {betLabel(p.peerBet?.type ?? "check")}.
        </div>
      )}
      {body}
    </div>
  );
}

function ChipBar({
  myHandle,
  peerHandle,
  myStack,
  peerStack,
  pot,
}: {
  myHandle: string | null;
  peerHandle: string | null;
  myStack: number;
  peerStack: number;
  pot: number;
}) {
  return (
    <div className="card p-3 flex items-center justify-between text-sm">
      <span>
        <span className="font-mono text-ink">{myHandle ?? "you"}</span>
        <span className="ml-2 font-mono text-sage-deep">{myStack}</span>
        <span className="ml-1 text-xs text-muted">chips</span>
      </span>
      <span className="text-muted">
        Pot: <span className="font-mono text-ink">{pot}</span>
      </span>
      <span>
        <span className="font-mono text-ink">{peerHandle ?? "opponent"}</span>
        <span className="ml-2 font-mono text-sage-deep">{peerStack}</span>
        <span className="ml-1 text-xs text-muted">chips</span>
      </span>
    </div>
  );
}

function BetPhasePanel({
  myStack,
  pot,
  onBet,
}: {
  myStack: number;
  pot: number;
  onBet: (choice: BetActionType) => void;
}) {
  // Tier disable rules: can only raise N if you have at least N chips
  // available. AllIn is always allowed (uses whatever you have).
  const tiers: { type: BetActionType; label: string; need: number; primary?: boolean }[] = [
    { type: "check", label: "Check", need: 0 },
    { type: "raise_25", label: "Raise +25", need: 25 },
    { type: "raise_50", label: "Raise +50", need: 50 },
    { type: "raise_100", label: "Raise +100", need: 100 },
    { type: "all_in", label: `All-in (${myStack})`, need: 0 },
  ];
  return (
    <div className="card p-4 border-sage space-y-3">
      <div className="text-xs uppercase tracking-wider text-muted">
        Bet phase · pot <span className="font-mono text-ink">{pot}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {tiers.map((t) => {
          const disabled = t.need > myStack;
          return (
            <button
              key={t.type}
              type="button"
              onClick={() => !disabled && onBet(t.type)}
              disabled={disabled}
              className={`px-3 py-2 rounded-xl border text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${
                t.type === "all_in"
                  ? "border-amber bg-amber-50 text-amber-900 hover:border-amber"
                  : "border-line bg-surface hover:border-sage hover:bg-sage-soft/40"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onBet("fold")}
          className="px-3 py-2 rounded-xl border border-line text-muted text-sm hover:text-ink hover:border-sage transition"
        >
          Fold
        </button>
      </div>
      <p className="text-xs text-muted">
        Your stake goes into the pot. Winner of the round takes it.
      </p>
    </div>
  );
}

function betLabel(t: BetActionType): string {
  if (t === "check") return "checked";
  if (t === "raise_25") return "raised 25";
  if (t === "raise_50") return "raised 50";
  if (t === "raise_100") return "raised 100";
  if (t === "all_in") return "went all-in";
  return "folded";
}

function labelFor(t: BrainBetRoundType): string {
  if (t === "indian_poker") return "Indian Poker";
  if (t === "estimation") return "Estimation";
  if (t === "chicken") return "Chicken Numbers";
  if (t === "big_o") return "Big-O Showdown";
  if (t === "monty_mirage") return "Monty Mirage";
  if (t === "geo_trivia") return "Geo Trivia";
  return "Stock Direction";
}

// ---------- Indian Poker ----------

function IndianPokerView(p: BrainBetRoundView) {
  const payload = p.payload as { opponentCard: number | null; opponentHandle: string | null };
  const decided = p.myDecision as "bet" | "fold" | null;
  const resolved = p.resolved;
  const reveal = resolved?.reveal as
    | { cards?: Record<string, number>; decisions?: Record<string, "bet" | "fold"> }
    | undefined;

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-3">
        <p className="text-sm text-muted">
          You can see your opponent&apos;s card. You cannot see your own. Bet or fold.
        </p>
        <div className="flex items-center justify-around">
          <div className="text-center">
            <div className="text-xs text-muted uppercase tracking-wider mb-1">You</div>
            <div className="w-20 h-28 rounded-xl border-2 border-line bg-surface flex items-center justify-center text-2xl font-mono">
              ?
            </div>
            <div className="text-xs text-muted mt-1">{p.myHandle ?? ""}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted uppercase tracking-wider mb-1">Opponent</div>
            <div className="w-20 h-28 rounded-xl border-2 border-sage bg-sage-soft flex items-center justify-center text-3xl font-mono">
              {cardLabel(payload.opponentCard)}
            </div>
            <div className="text-xs text-muted mt-1">{payload.opponentHandle ?? ""}</div>
          </div>
        </div>
      </div>

      {!resolved && !decided && (
        <div className="flex gap-3 justify-center">
          <button onClick={() => p.onIndianPoker("bet")} className="btn-primary">
            Bet
          </button>
          <button onClick={() => p.onIndianPoker("fold")} className="btn-secondary">
            Fold
          </button>
        </div>
      )}
      {!resolved && decided && (
        <p className="text-center text-sm text-muted">
          You {decided === "bet" ? "bet" : "folded"}. Waiting for opponent…
        </p>
      )}

      {resolved && reveal && (
        <RevealCard>
          <p className="text-sm">
            Your card: <span className="font-mono text-ink text-lg">{cardLabel(reveal.cards?.[resolved.mySocketId ?? ""] ?? null)}</span>
          </p>
          <p className="text-sm">
            Opponent&apos;s card: <span className="font-mono text-ink text-lg">{cardLabel(payload.opponentCard)}</span>
          </p>
          <WinLoseLine winner={resolved.winnerSocketId} mySocketId={resolved.mySocketId} />
        </RevealCard>
      )}
    </div>
  );
}

function cardLabel(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 1) return "A";
  if (n === 11) return "J";
  if (n === 12) return "Q";
  if (n === 13) return "K";
  return String(n);
}

// ---------- Estimation ----------

function EstimationView(p: BrainBetRoundView) {
  const payload = p.payload as { question: string };
  const submitted = p.myDecision as number | null;
  const [draft, setDraft] = useState("");
  const resolved = p.resolved;
  const reveal = resolved?.reveal as
    | { answer?: number; explanation?: string; submissions?: Record<string, number | undefined> }
    | undefined;

  function submit() {
    const v = Number(draft);
    if (!Number.isFinite(v)) return;
    p.onEstimation(v);
    setDraft("");
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-sm text-muted uppercase tracking-wider mb-2">Question</p>
        <p className="text-lg text-ink">{payload.question}</p>
      </div>

      {!resolved && submitted == null && (
        <div className="flex gap-2">
          <input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your guess (integer)"
            className="flex-1 border border-line rounded-lg px-3 py-2 bg-surface focus:border-sage focus:outline-none font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <button onClick={submit} disabled={draft === ""} className="btn-primary disabled:opacity-50">
            Submit
          </button>
        </div>
      )}
      {!resolved && submitted != null && (
        <p className="text-center text-sm text-muted">
          You guessed <span className="font-mono text-ink">{submitted.toLocaleString()}</span>. Waiting for opponent…
        </p>
      )}

      {resolved && reveal && (
        <RevealCard>
          <p className="text-sm">
            Truth: <span className="font-mono text-ink">{(reveal.answer ?? 0).toLocaleString()}</span>
          </p>
          <p className="text-sm">
            You: <span className="font-mono text-ink">{(reveal.submissions?.[resolved.mySocketId ?? ""] ?? "—").toString()}</span>
            {p.peerHandle && (
              <>
                <span className="mx-3">·</span>
                Opp: <span className="font-mono text-ink">{(Object.entries(reveal.submissions ?? {}).find(([sid]) => sid !== resolved.mySocketId)?.[1] ?? "—").toString()}</span>
              </>
            )}
          </p>
          {reveal.explanation && <p className="text-xs text-muted italic">{reveal.explanation}</p>}
          <WinLoseLine winner={resolved.winnerSocketId} mySocketId={resolved.mySocketId} />
        </RevealCard>
      )}
    </div>
  );
}

// ---------- Chicken Numbers ----------

function ChickenView(p: BrainBetRoundView) {
  const picked = p.myDecision as number | null;
  const resolved = p.resolved;
  const reveal = resolved?.reveal as
    | { picks?: Record<string, number | undefined>; bust?: boolean; bustThreshold?: number }
    | undefined;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-sm text-muted">
          Pick a secret number 1–10. Higher number wins the round — <strong>but</strong> if both
          players pick 8 or higher, both lose.
        </p>
      </div>

      {!resolved && picked == null && (
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => p.onChicken(n)}
              className="aspect-square rounded-xl border border-line bg-surface hover:border-sage hover:bg-sage-soft transition font-mono text-xl"
            >
              {n}
            </button>
          ))}
        </div>
      )}
      {!resolved && picked != null && (
        <p className="text-center text-sm text-muted">
          You picked <span className="font-mono text-ink">{picked}</span>. Waiting for opponent…
        </p>
      )}

      {resolved && reveal && (
        <RevealCard>
          {reveal.bust ? (
            <p className="text-amber-700 font-medium">Both busted — picks ≥ {reveal.bustThreshold}.</p>
          ) : null}
          <p className="text-sm">
            You: <span className="font-mono text-ink">{(reveal.picks?.[resolved.mySocketId ?? ""] ?? "—").toString()}</span>
            <span className="mx-3">·</span>
            Opp:{" "}
            <span className="font-mono text-ink">
              {(Object.entries(reveal.picks ?? {}).find(([sid]) => sid !== resolved.mySocketId)?.[1] ?? "—").toString()}
            </span>
          </p>
          <WinLoseLine winner={resolved.winnerSocketId} mySocketId={resolved.mySocketId} bust={reveal.bust} />
        </RevealCard>
      )}
    </div>
  );
}

// ---------- Big-O Showdown ----------

function BigOView(p: BrainBetRoundView) {
  const payload = p.payload as { language: string; code: string[]; choices: readonly string[] };
  const myLock = p.myDecision as "correct" | string | null; // server doesn't echo wrong/correct via myDecision; we get a separate lock_recorded
  // Note: page state updates `myDecision` based on the lock_recorded event content, but
  // BrainBetRound just renders. The page will pass myDecision through when locked.
  const resolved = p.resolved;
  const reveal = resolved?.reveal as
    | { answer?: string; explanation?: string; locks?: Record<string, string | undefined> }
    | undefined;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="text-xs text-muted mb-2 font-mono">{payload.language}</div>
        <pre className="font-mono text-sm leading-7">
          {payload.code.map((line, i) => (
            <code key={i} className="block px-3 py-1">
              <span className="text-muted mr-3 inline-block w-6 text-right">{i + 1}</span>
              {line || " "}
            </code>
          ))}
        </pre>
      </div>
      <p className="text-sm text-muted">Pick the time complexity. First correct lock wins; wrong lock locks you out.</p>
      <div className="grid grid-cols-3 gap-2">
        {payload.choices.map((c) => {
          const locked = myLock != null;
          const isMine = myLock === c;
          const isAnswer = resolved && reveal?.answer === c;
          const isMyWrong = resolved && reveal?.locks?.[resolved.mySocketId ?? ""] === c && c !== reveal?.answer;
          return (
            <button
              key={c}
              disabled={locked || !!resolved}
              onClick={() => p.onBigO(c)}
              className={`px-3 py-3 rounded-xl border font-mono text-sm transition disabled:cursor-not-allowed ${
                isAnswer ? "border-sage bg-sage-soft text-sage-deep" :
                isMyWrong ? "border-amber-400 bg-amber-100 text-amber-900" :
                isMine ? "border-sage bg-sage-soft" :
                locked || resolved ? "border-line bg-surface opacity-50" :
                "border-line bg-surface hover:border-sage hover:bg-sage-soft"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
      {!resolved && myLock != null && (
        <p className="text-center text-sm text-muted">Locked. Waiting for opponent…</p>
      )}
      {resolved && reveal && (
        <RevealCard>
          <p className="text-sm">Answer: <span className="font-mono text-sage-deep">{reveal.answer}</span></p>
          {reveal.explanation && <p className="text-xs text-muted italic">{reveal.explanation}</p>}
          <WinLoseLine winner={resolved.winnerSocketId} mySocketId={resolved.mySocketId} />
        </RevealCard>
      )}
    </div>
  );
}

// ---------- Monty Mirage ----------

function MontyMirageView(p: BrainBetRoundView) {
  const payload = p.payload as { prompt: string };
  const submitted = p.myDecision as number | null;
  const [draft, setDraft] = useState("");
  const resolved = p.resolved;
  const reveal = resolved?.reveal as
    | { answer?: number; explanation?: string; submissions?: Record<string, number | undefined> }
    | undefined;

  function submit() {
    const v = Number(draft);
    if (!Number.isFinite(v)) return;
    p.onMontyMirage(Math.max(0, Math.min(100, Math.round(v))));
    setDraft("");
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-sm text-muted uppercase tracking-wider mb-2">Probability puzzle</p>
        <p className="text-lg text-ink">{payload.prompt}</p>
      </div>
      {!resolved && submitted == null && (
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min={0}
            max={100}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="0–100"
            className="flex-1 border border-line rounded-lg px-3 py-2 bg-surface focus:border-sage focus:outline-none font-mono"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
          <span className="text-muted">%</span>
          <button onClick={submit} disabled={draft === ""} className="btn-primary disabled:opacity-50">Submit</button>
        </div>
      )}
      {!resolved && submitted != null && (
        <p className="text-center text-sm text-muted">You guessed <span className="font-mono text-ink">{submitted}%</span>. Waiting for opponent…</p>
      )}
      {resolved && reveal && (
        <RevealCard>
          <p className="text-sm">Truth: <span className="font-mono text-ink">{reveal.answer}%</span></p>
          <p className="text-sm">
            You: <span className="font-mono text-ink">{(reveal.submissions?.[resolved.mySocketId ?? ""] ?? "—").toString()}%</span>
            <span className="mx-3">·</span>
            Opp: <span className="font-mono text-ink">
              {(Object.entries(reveal.submissions ?? {}).find(([sid]) => sid !== resolved.mySocketId)?.[1] ?? "—").toString()}%
            </span>
          </p>
          {reveal.explanation && <p className="text-xs text-muted italic">{reveal.explanation}</p>}
          <WinLoseLine winner={resolved.winnerSocketId} mySocketId={resolved.mySocketId} />
        </RevealCard>
      )}
    </div>
  );
}

// ---------- Geo Trivia ----------

function GeoTriviaView(p: BrainBetRoundView) {
  const payload = p.payload as { prompt: string; choices: string[] };
  const myLock = p.myDecision as string | null;
  const resolved = p.resolved;
  const reveal = resolved?.reveal as
    | { answer?: string; explanation?: string; locks?: Record<string, string | undefined> }
    | undefined;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="text-lg text-ink">{payload.prompt}</p>
      </div>
      <p className="text-sm text-muted">First correct lock wins; wrong lock locks you out.</p>
      <div className={`grid ${payload.choices.length === 2 ? "grid-cols-2" : "grid-cols-3"} gap-2`}>
        {payload.choices.map((c) => {
          const locked = myLock != null;
          const isMine = myLock === c;
          const isAnswer = resolved && reveal?.answer === c;
          const isMyWrong = resolved && reveal?.locks?.[resolved.mySocketId ?? ""] === c && c !== reveal?.answer;
          return (
            <button
              key={c}
              disabled={locked || !!resolved}
              onClick={() => p.onGeoTrivia(c)}
              className={`px-4 py-4 rounded-xl border text-base transition disabled:cursor-not-allowed ${
                isAnswer ? "border-sage bg-sage-soft text-sage-deep" :
                isMyWrong ? "border-amber-400 bg-amber-100 text-amber-900" :
                isMine ? "border-sage bg-sage-soft" :
                locked || resolved ? "border-line bg-surface opacity-50" :
                "border-line bg-surface hover:border-sage hover:bg-sage-soft"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
      {!resolved && myLock != null && (
        <p className="text-center text-sm text-muted">Locked. Waiting for opponent…</p>
      )}
      {resolved && reveal && (
        <RevealCard>
          <p className="text-sm">Answer: <span className="font-mono text-sage-deep">{reveal.answer}</span></p>
          {reveal.explanation && <p className="text-xs text-muted italic">{reveal.explanation}</p>}
          <WinLoseLine winner={resolved.winnerSocketId} mySocketId={resolved.mySocketId} />
        </RevealCard>
      )}
    </div>
  );
}

// ---------- Stock Direction ----------

function StockDirectionView(p: BrainBetRoundView) {
  const payload = p.payload as { visiblePrices: number[]; magnitudeMax: number };
  const submitted = p.myDecision as { direction: "up" | "down"; magnitude: number } | null;
  const [pickedDir, setPickedDir] = useState<"up" | "down" | null>(null);
  const [magDraft, setMagDraft] = useState("");
  const resolved = p.resolved;
  const reveal = resolved?.reveal as
    | {
        hiddenPrices?: number[];
        answerDirection?: "up" | "down";
        answerMagnitude?: number;
        explanation?: string;
        submissions?: Record<string, { direction: "up" | "down"; magnitude: number } | undefined>;
      }
    | undefined;

  function submit() {
    if (!pickedDir) return;
    const v = Number(magDraft);
    if (!Number.isFinite(v)) return;
    p.onStockDirection(pickedDir, Math.max(0, Math.min(payload.magnitudeMax, v)));
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-sm text-muted uppercase tracking-wider mb-2">First 30 minutes</p>
        <Sparkline values={payload.visiblePrices} />
        <p className="text-xs text-muted mt-2 font-mono">
          {payload.visiblePrices[0]?.toFixed(2)} → {payload.visiblePrices[payload.visiblePrices.length - 1]?.toFixed(2)}
        </p>
      </div>

      {!resolved && submitted == null && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Predict the next 30 minutes. Direction wins; magnitude is the tiebreaker.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setPickedDir("up")}
              className={`px-6 py-3 rounded-xl border-2 text-lg ${
                pickedDir === "up"
                  ? "border-sage bg-sage-soft text-sage-deep"
                  : "border-line bg-surface hover:border-sage"
              }`}
            >
              ↑ Up
            </button>
            <button
              onClick={() => setPickedDir("down")}
              className={`px-6 py-3 rounded-xl border-2 text-lg ${
                pickedDir === "down"
                  ? "border-amber-400 bg-amber-100 text-amber-900"
                  : "border-line bg-surface hover:border-amber-400"
              }`}
            >
              ↓ Down
            </button>
          </div>
          <div className="flex gap-2 items-center justify-center">
            <span className="text-sm text-muted">Magnitude:</span>
            <input
              type="number"
              min={0}
              max={payload.magnitudeMax}
              step={0.1}
              value={magDraft}
              onChange={(e) => setMagDraft(e.target.value)}
              placeholder="0.0"
              className="w-24 border border-line rounded px-2 py-1 bg-surface focus:border-sage focus:outline-none font-mono text-center"
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
            <span className="text-sm text-muted">%</span>
            <button onClick={submit} disabled={!pickedDir || magDraft === ""} className="btn-primary disabled:opacity-50 ml-2">
              Submit
            </button>
          </div>
        </div>
      )}

      {!resolved && submitted != null && (
        <p className="text-center text-sm text-muted">
          You called <span className="font-mono text-ink">{submitted.direction}</span> by{" "}
          <span className="font-mono text-ink">{submitted.magnitude.toFixed(1)}%</span>. Waiting for opponent…
        </p>
      )}

      {resolved && reveal && (
        <RevealCard>
          <p className="text-sm text-muted uppercase tracking-wider">Hidden 30 minutes</p>
          <Sparkline values={[...payload.visiblePrices, ...(reveal.hiddenPrices ?? [])]} splitAt={30} />
          <p className="text-sm">
            Truth: <span className="font-mono text-ink">{reveal.answerDirection === "up" ? "↑ Up" : "↓ Down"} by {reveal.answerMagnitude?.toFixed(2)}%</span>
          </p>
          <p className="text-sm">
            You: <span className="font-mono text-ink">
              {reveal.submissions?.[resolved.mySocketId ?? ""]
                ? `${reveal.submissions[resolved.mySocketId ?? ""]!.direction} ${reveal.submissions[resolved.mySocketId ?? ""]!.magnitude.toFixed(1)}%`
                : "—"}
            </span>
            <span className="mx-3">·</span>
            Opp: <span className="font-mono text-ink">
              {(() => {
                const oppEntry = Object.entries(reveal.submissions ?? {}).find(([sid]) => sid !== resolved.mySocketId)?.[1];
                return oppEntry ? `${oppEntry.direction} ${oppEntry.magnitude.toFixed(1)}%` : "—";
              })()}
            </span>
          </p>
          {reveal.explanation && <p className="text-xs text-muted italic">{reveal.explanation}</p>}
          <WinLoseLine winner={resolved.winnerSocketId} mySocketId={resolved.mySocketId} />
        </RevealCard>
      )}
    </div>
  );
}

// ASCII sparkline using Unicode block chars. `splitAt` draws a divider
// between the visible and hidden halves on the reveal screen.
function Sparkline({ values, splitAt }: { values: number[]; splitAt?: number }) {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const blocks = "▁▂▃▄▅▆▇█";
  const chars = values.map((v) => {
    const idx = Math.floor(((v - min) / range) * (blocks.length - 1));
    return blocks[idx] ?? blocks[0];
  });
  return (
    <div className="font-mono leading-none text-sage-deep text-xl whitespace-pre overflow-x-auto">
      {chars.map((c, i) => (
        <span key={i} className={splitAt != null && i === splitAt ? "border-l-2 border-amber-400 pl-0.5" : ""}>{c}</span>
      ))}
    </div>
  );
}

// ---------- shared bits ----------

function RevealCard({ children }: { children: React.ReactNode }) {
  return <div className="card p-4 space-y-1 text-sm">{children}</div>;
}

function WinLoseLine({
  winner,
  mySocketId,
  bust,
}: {
  winner: string | null;
  mySocketId: string | null;
  bust?: boolean;
}) {
  if (bust) return null;
  if (winner == null) return <p className="text-muted">Round draw — neither scores.</p>;
  if (winner === mySocketId) return <p className="text-sage-deep font-medium">You took the round.</p>;
  return <p className="text-amber-700 font-medium">Opponent took the round.</p>;
}
