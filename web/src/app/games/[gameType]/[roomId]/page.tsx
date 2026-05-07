"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/lib/auth";
import { useInGame } from "@/lib/inGame";
import { SpotTheBugRound, type Snippet } from "@/components/games/SpotTheBugRound";
import { BrainBetRound, type BrainBetRoundType } from "@/components/games/BrainBetRound";

// ---------- shared end-state shapes ----------

type FinalState = {
  outcome: "win" | "tie";
  winnerHandle: string | null;
  scores: Record<string, number>;
  payout: number;
};

type ResolvedPayload = {
  gameId: string;
  outcome: "win" | "tie";
  winnerSocketId: string | null;
  winnerUserId: string | null;
  scores: Record<string, number>;
  payout: number;
};

type AbortedPayload = { gameId?: string; reason?: string };

// ---------- spot_the_bug round shape ----------

type SpotTheBugRoundState = {
  round: number;
  total: number;
  snippet: Snippet;
  endsAt: number;
  scores: Record<string, number>;
  resolved?: {
    buggyLine: number;
    explanation: string;
    winnerSocketId: string | null;
    clicks: Record<string, number>;
  };
  myClick: number | null;
};

// ---------- brain_bet round shape ----------

type BrainBetRoundState = {
  round: number;
  total: number;
  endsAt: number;
  scores: Record<string, number>;
  roundType: BrainBetRoundType;
  payload: unknown;
  myDecision: unknown;
  resolved?: {
    winnerSocketId: string | null;
    reveal: Record<string, unknown>;
  };
};

export default function GameRoomPage() {
  const params = useParams<{ gameType: string; roomId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { session, loading } = useAuth();

  const gameId = search.get("gameId") || "";
  const peerHandle = search.get("peer") || null;

  const [myHandle, setMyHandle] = useState<string | null>(null);
  const mySocketIdRef = useRef<string | null>(null);
  const [stbRound, setStbRound] = useState<SpotTheBugRoundState | null>(null);
  const [bbRound, setBbRound] = useState<BrainBetRoundState | null>(null);
  const [final, setFinal] = useState<FinalState | null>(null);
  const [aborted, setAborted] = useState<string | null>(null);

  const { setInGame } = useInGame();
  useEffect(() => {
    const active = !final && !aborted;
    setInGame(active);
    return () => setInGame(false);
  }, [final, aborted, setInGame]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!gameId) return;

    const socket = getSocket();

    function onWelcome(p: { handle: string; socketId: string }) {
      setMyHandle(p.handle);
      mySocketIdRef.current = p.socketId;
    }

    function onState(p: { gameId?: string } & Record<string, unknown>) {
      if (p.gameId !== gameId) return;

      // Brain Bet round events carry a roundType field.
      const rt = p.roundType as BrainBetRoundType | undefined;
      const t = p.type as string;

      if (t === "round_start") {
        if (rt) {
          setBbRound({
            round: p.round as number,
            total: p.total as number,
            endsAt: p.endsAt as number,
            scores: p.scores as Record<string, number>,
            roundType: rt,
            payload: p.payload,
            myDecision: null,
            resolved: undefined,
          });
        } else {
          setStbRound({
            round: p.round as number,
            total: p.total as number,
            snippet: p.snippet as Snippet,
            endsAt: p.endsAt as number,
            scores: p.scores as Record<string, number>,
            resolved: undefined,
            myClick: null,
          });
        }
      } else if (t === "click_recorded") {
        setStbRound((prev) => prev ? { ...prev, myClick: p.line as number } : prev);
      } else if (t === "decision_recorded") {
        setBbRound((prev) => prev ? { ...prev, myDecision: p.choice } : prev);
      } else if (t === "submission_recorded") {
        setBbRound((prev) => prev ? { ...prev, myDecision: p.value } : prev);
      } else if (t === "pick_recorded") {
        setBbRound((prev) => prev ? { ...prev, myDecision: p.value } : prev);
      } else if (t === "round_resolved") {
        if (rt) {
          setBbRound((prev) => prev ? {
            ...prev,
            scores: p.scores as Record<string, number>,
            resolved: {
              winnerSocketId: p.winnerSocketId as string | null,
              reveal: p.reveal as Record<string, unknown>,
            },
          } : prev);
        } else {
          setStbRound((prev) => prev ? {
            ...prev,
            scores: p.scores as Record<string, number>,
            resolved: {
              buggyLine: p.buggyLine as number,
              explanation: p.explanation as string,
              winnerSocketId: p.winnerSocketId as string | null,
              clicks: p.clicks as Record<string, number>,
            },
          } : prev);
        }
      }
    }

    function onResolved(p: ResolvedPayload) {
      if (p.gameId !== gameId) return;
      setFinal({
        outcome: p.outcome,
        winnerHandle:
          p.winnerUserId === null
            ? null
            : p.winnerSocketId === mySocketIdRef.current
              ? myHandle
              : peerHandle,
        scores: p.scores,
        payout: p.payout,
      });
    }
    function onAborted(p: AbortedPayload) {
      if (p.gameId && p.gameId !== gameId) return;
      setAborted(p.reason || "unknown");
    }

    socket.on("welcome", onWelcome);
    socket.on("game_state_update", onState);
    socket.on("game_resolved", onResolved);
    socket.on("game_aborted", onAborted);

    if (socket.connected && socket.id) mySocketIdRef.current = socket.id;

    return () => {
      socket.off("welcome", onWelcome);
      socket.off("game_state_update", onState);
      socket.off("game_resolved", onResolved);
      socket.off("game_aborted", onAborted);
    };
  }, [session, loading, gameId, router, myHandle, peerHandle]);

  function emitAction(action: unknown) {
    if (!gameId) return;
    getSocket().emit("game_action", { gameId, action });
  }

  if (loading) return <div className="max-w-3xl mx-auto px-6 py-12 text-muted">Loading…</div>;

  if (aborted) {
    const peerLeft = aborted === "user_requeued";
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-4">
        <h1 className="text-2xl font-medium text-ink">
          {peerLeft ? "Your opponent left." : "Game ended unexpectedly"}
        </h1>
        <p className="text-muted">
          {peerLeft
            ? "Both antes have been refunded. Find a new match below."
            : <>Reason: <span className="font-mono">{aborted}</span>. Any ante is refunded automatically — refresh the page to see the latest balance.</>}
        </p>
        <div className="flex gap-2">
          <button onClick={() => router.push("/join")} className="btn-primary">Find a new match</button>
          <button onClick={() => router.push("/me")} className="btn-secondary">Profile</button>
        </div>
      </div>
    );
  }

  if (final) {
    const won = final.outcome === "win" && final.winnerHandle === myHandle;
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-4">
        <h1 className="text-2xl font-medium text-ink">
          {final.outcome === "tie"
            ? "Tie — antes returned."
            : won
              ? `You won ${final.payout} pts.`
              : "You lost the pot."}
        </h1>
        <div className="card p-4 text-sm">
          <p className="text-muted mb-1">Final scores:</p>
          {Object.entries(final.scores).map(([h, s]) => (
            <div key={h} className="flex justify-between font-mono">
              <span>{h}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push("/join")} className="btn-primary">Play again</button>
          <button onClick={() => router.push("/me")} className="btn-secondary">Profile</button>
        </div>
      </div>
    );
  }

  if (params.gameType === "spot_the_bug") {
    if (!stbRound) {
      return <div className="max-w-2xl mx-auto px-6 py-12 text-muted">Waiting for first round…</div>;
    }
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <header className="mb-4 flex items-baseline justify-between">
          <h1 className="text-xl font-medium text-ink">Spot the Bug</h1>
          <span className="text-xs text-muted font-mono">{peerHandle ? `vs ${peerHandle}` : ""}</span>
        </header>
        <SpotTheBugRound
          round={stbRound.round}
          total={stbRound.total}
          snippet={stbRound.snippet}
          endsAt={stbRound.endsAt}
          scores={stbRound.scores}
          myHandle={myHandle}
          peerHandle={peerHandle}
          resolved={
            stbRound.resolved
              ? { ...stbRound.resolved, mySocketId: mySocketIdRef.current }
              : undefined
          }
          myClick={stbRound.myClick}
          onClickLine={(line) => emitAction({ type: "click_line", line })}
        />
      </div>
    );
  }

  if (params.gameType === "brain_bet") {
    if (!bbRound) {
      return <div className="max-w-2xl mx-auto px-6 py-12 text-muted">Shuffling rounds…</div>;
    }
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <header className="mb-4 flex items-baseline justify-between">
          <h1 className="text-xl font-medium text-ink">Brain Bet</h1>
          <span className="text-xs text-muted font-mono">{peerHandle ? `vs ${peerHandle}` : ""}</span>
        </header>
        <BrainBetRound
          round={bbRound.round}
          total={bbRound.total}
          endsAt={bbRound.endsAt}
          scores={bbRound.scores}
          myHandle={myHandle}
          peerHandle={peerHandle}
          roundType={bbRound.roundType}
          payload={bbRound.payload}
          myDecision={bbRound.myDecision}
          resolved={
            bbRound.resolved
              ? { ...bbRound.resolved, mySocketId: mySocketIdRef.current }
              : undefined
          }
          onIndianPoker={(choice) => emitAction({ type: "indian_poker_decide", choice })}
          onEstimation={(value) => emitAction({ type: "estimation_submit", value })}
          onChicken={(value) => emitAction({ type: "chicken_pick", value })}
          onBigO={(choice) => {
            // Optimistic lock — server doesn't echo the choice in lock_recorded.
            setBbRound((prev) => prev ? { ...prev, myDecision: choice } : prev);
            emitAction({ type: "big_o_lock", choice });
          }}
          onMontyMirage={(value) => emitAction({ type: "monty_mirage_submit", value })}
          onGeoTrivia={(choice) => {
            setBbRound((prev) => prev ? { ...prev, myDecision: choice } : prev);
            emitAction({ type: "geo_trivia_lock", choice });
          }}
        />
      </div>
    );
  }

  return <div className="max-w-2xl mx-auto px-6 py-12 text-muted">Game type {params.gameType} coming soon.</div>;
}
