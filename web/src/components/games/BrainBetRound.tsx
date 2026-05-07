"use client";

import { useEffect, useState } from "react";

export type BrainBetRoundType = "indian_poker" | "estimation" | "chicken";

export type BrainBetRoundView = {
  round: number;
  total: number;
  endsAt: number;
  scores: Record<string, number>;
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
  onIndianPoker: (choice: "bet" | "fold") => void;
  onEstimation: (value: number) => void;
  onChicken: (value: number) => void;
};

export function BrainBetRound(p: BrainBetRoundView) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const remaining = Math.max(0, Math.ceil((p.endsAt - now) / 1000));

  const ribbon = (
    <div className="flex items-center justify-between text-sm mb-3">
      <span className="text-muted">
        Round <span className="font-mono text-ink">{p.round}</span> /{" "}
        <span className="font-mono">{p.total}</span>
        <span className="ml-2 text-xs uppercase tracking-wider text-muted">
          {labelFor(p.roundType)}
        </span>
      </span>
      <span className="text-muted">
        {p.myHandle && (
          <>
            <span className="font-mono text-ink">{p.myHandle}</span>{" "}
            <span className="font-mono text-sage-deep">{p.scores[p.myHandle] ?? 0}</span>
          </>
        )}
        <span className="mx-2">·</span>
        {p.peerHandle && (
          <>
            <span className="font-mono text-ink">{p.peerHandle}</span>{" "}
            <span className="font-mono text-sage-deep">{p.scores[p.peerHandle] ?? 0}</span>
          </>
        )}
      </span>
      <span className="font-mono text-sm">
        {p.resolved ? (
          <span className="text-muted">resolved</span>
        ) : (
          <span className={remaining <= 5 ? "text-amber-700" : "text-ink"}>{remaining}s</span>
        )}
      </span>
    </div>
  );

  let body: React.ReactNode = null;
  if (p.roundType === "indian_poker") body = <IndianPokerView {...p} />;
  else if (p.roundType === "estimation") body = <EstimationView {...p} />;
  else if (p.roundType === "chicken") body = <ChickenView {...p} />;

  return (
    <div>
      {ribbon}
      {body}
    </div>
  );
}

function labelFor(t: BrainBetRoundType): string {
  if (t === "indian_poker") return "Indian Poker";
  if (t === "estimation") return "Estimation";
  return "Chicken Numbers";
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
