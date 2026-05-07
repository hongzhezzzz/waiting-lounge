"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/lib/auth";
import { SpotTheBugRound, type Snippet } from "@/components/games/SpotTheBugRound";

type RoundState = {
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

type FinalState = {
  outcome: "win" | "tie";
  winnerHandle: string | null;
  scores: Record<string, number>;
  payout: number;
};

type StateUpdate =
  | { gameId: string; type: "round_start"; round: number; total: number; snippet: Snippet; endsAt: number; scores: Record<string, number> }
  | { gameId: string; type: "click_recorded"; round: number; line: number }
  | { gameId: string; type: "round_resolved"; round: number; total: number; scores: Record<string, number>; buggyLine: number; explanation: string; winnerSocketId: string | null; clicks: Record<string, number> }
  | { gameId: string; type: "player_disconnected"; socketId: string; graceMs: number }
  | { gameId: string; type: "player_reconnected"; userId: string; socketId: string };

type ResolvedPayload = {
  gameId: string;
  outcome: "win" | "tie";
  winnerSocketId: string | null;
  winnerUserId: string | null;
  scores: Record<string, number>;
  payout: number;
};

type AbortedPayload = { gameId?: string; reason?: string };

export default function GameRoomPage() {
  const params = useParams<{ gameType: string; roomId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { session, loading } = useAuth();

  const gameId = search.get("gameId") || "";
  const peerHandle = search.get("peer") || null;

  const [myHandle, setMyHandle] = useState<string | null>(null);
  const mySocketIdRef = useRef<string | null>(null);
  const [round, setRound] = useState<RoundState | null>(null);
  const [final, setFinal] = useState<FinalState | null>(null);
  const [aborted, setAborted] = useState<string | null>(null);

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
    function onState(p: StateUpdate) {
      if (p.gameId !== gameId) return;
      if (p.type === "round_start") {
        setRound({
          round: p.round,
          total: p.total,
          snippet: p.snippet,
          endsAt: p.endsAt,
          scores: p.scores,
          resolved: undefined,
          myClick: null,
        });
      } else if (p.type === "click_recorded") {
        setRound((prev) => prev ? { ...prev, myClick: p.line } : prev);
      } else if (p.type === "round_resolved") {
        setRound((prev) => prev ? {
          ...prev,
          scores: p.scores,
          resolved: {
            buggyLine: p.buggyLine,
            explanation: p.explanation,
            winnerSocketId: p.winnerSocketId,
            clicks: p.clicks,
          },
        } : prev);
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

    // Capture welcome immediately if already connected.
    if (socket.connected && socket.id) mySocketIdRef.current = socket.id;

    return () => {
      socket.off("welcome", onWelcome);
      socket.off("game_state_update", onState);
      socket.off("game_resolved", onResolved);
      socket.off("game_aborted", onAborted);
    };
  }, [session, loading, gameId, router, myHandle, peerHandle]);

  function clickLine(line: number) {
    if (!gameId) return;
    getSocket().emit("game_action", { gameId, action: { type: "click_line", line } });
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

  if (!round) {
    return <div className="max-w-2xl mx-auto px-6 py-12 text-muted">Waiting for first round…</div>;
  }

  if (params.gameType !== "spot_the_bug") {
    return <div className="max-w-2xl mx-auto px-6 py-12 text-muted">Game type {params.gameType} coming soon.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-medium text-ink">Spot the Bug</h1>
        <span className="text-xs text-muted font-mono">{peerHandle ? `vs ${peerHandle}` : ""}</span>
      </header>
      <SpotTheBugRound
        round={round.round}
        total={round.total}
        snippet={round.snippet}
        endsAt={round.endsAt}
        scores={round.scores}
        myHandle={myHandle}
        peerHandle={peerHandle}
        resolved={
          round.resolved
            ? { ...round.resolved, mySocketId: mySocketIdRef.current }
            : undefined
        }
        myClick={round.myClick}
        onClickLine={clickLine}
      />
    </div>
  );
}
