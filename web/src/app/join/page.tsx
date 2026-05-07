"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TagSelector } from "@/components/TagSelector";
import { ModeSelector } from "@/components/ModeSelector";
import { MOODS, GAMES, GAME_DURATIONS, DEFAULT_ANTE, type Tag, type Mood, type GameTypeId, type GameDuration } from "@/lib/fakeData";
import { useAuth } from "@/lib/auth";
import { useBalance } from "@/lib/points";
import { getSocket } from "@/lib/socket";

export default function JoinPage() {
  const router = useRouter();
  const { session } = useAuth();
  const { points } = useBalance();

  const [tag, setTag] = useState<Tag | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [mode, setMode] = useState<string | null>(null);

  // Game-mode selections
  const [gameType, setGameType] = useState<GameTypeId>("spot_the_bug");
  const [duration, setDuration] = useState<GameDuration>(1);

  const [queueState, setQueueState] = useState<"idle" | "waiting" | "matched">("idle");
  const [queueErr, setQueueErr] = useState<string | null>(null);

  // Listen for game events while on this page if we've queued.
  useEffect(() => {
    if (queueState === "idle") return;
    const socket = getSocket();
    function onWaiting(_p: unknown) {
      setQueueState("waiting");
    }
    function onStarted(p: { gameId: string; roomId: string; gameType: string; peerHandle: string }) {
      setQueueState("matched");
      router.push(`/games/${p.gameType}/${p.roomId}?gameId=${p.gameId}&peer=${encodeURIComponent(p.peerHandle)}`);
    }
    function onError(p: { message?: string }) {
      setQueueErr(p?.message || "Could not start game.");
      setQueueState("idle");
    }
    socket.on("game_waiting", onWaiting);
    socket.on("game_started", onStarted);
    socket.on("error_message", onError);
    return () => {
      socket.off("game_waiting", onWaiting);
      socket.off("game_started", onStarted);
      socket.off("error_message", onError);
    };
  }, [queueState, router]);

  function go() {
    if (!mode) return;
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (mood) params.set("mood", mood);

    if (mode === "match") return router.push(`/chat?${params.toString()}`);
    if (mode === "board") return router.push(`/board?${params.toString()}`);
    if (mode === "lobby") return router.push(`/lounge?${params.toString()}`);

    if (mode === "game") {
      if (!session) {
        router.push("/login");
        return;
      }
      if (points != null && points < DEFAULT_ANTE) {
        setQueueErr(`You need at least ${DEFAULT_ANTE} pts. You have ${points}.`);
        return;
      }
      setQueueErr(null);
      setQueueState("waiting");
      getSocket().emit("queue_for_game", {
        gameType,
        durationMin: duration,
        ante: DEFAULT_ANTE,
      });
    }
  }

  function cancelQueue() {
    getSocket().emit("cancel_game_queue");
    setQueueState("idle");
  }

  if (queueState !== "idle") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-6">
        <div className="card p-6 space-y-3">
          <h1 className="text-xl font-medium text-ink">Looking for an opponent…</h1>
          <p className="text-sm text-muted">
            {(GAMES.find((g) => g.id === gameType)?.label) || gameType} · {duration} min · ante {DEFAULT_ANTE} pts
          </p>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="inline-block w-2 h-2 rounded-full bg-sage-deep animate-pulse" />
            Tell a friend to join with the same settings.
          </div>
          <button onClick={cancelQueue} className="btn-secondary">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">Claude is working. What kind of wait is this?</h1>
      </div>

      <section className="space-y-3 mb-8">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wider">Tag</h2>
        <TagSelector value={tag} onChange={setTag} />
      </section>

      <section className="space-y-3 mb-8">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wider">Mood (optional)</h2>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(mood === m ? null : m)}
              className={`chip ${mood === m ? "chip-active" : ""}`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 mb-8">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wider">Mode</h2>
        <ModeSelector value={mode} onChange={setMode} />
      </section>

      {mode === "game" && (
        <section className="space-y-4 mb-10 card p-5 bg-sage-soft/30">
          <div>
            <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">Game</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {GAMES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  disabled={!g.enabled}
                  onClick={() => g.enabled && setGameType(g.id)}
                  className={`text-left p-3 rounded-xl border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    gameType === g.id && g.enabled
                      ? "border-sage bg-sage-soft"
                      : "border-line bg-surface hover:border-sage"
                  }`}
                >
                  <div className="font-medium text-ink text-sm">{g.label}</div>
                  <div className="text-xs text-muted mt-1">{g.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">Duration</h3>
            <div className="flex gap-2">
              {GAME_DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`chip ${duration === d ? "chip-active" : ""}`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          <div className="text-sm text-muted">
            Ante: <span className="font-mono text-ink">{DEFAULT_ANTE} pts</span>
            {points != null && (
              <span className="ml-2">· Your balance: <span className="font-mono text-ink">{points} pts</span></span>
            )}
            {!session && (
              <span className="ml-2 text-amber-700">· You&apos;ll need to sign in.</span>
            )}
          </div>
          {queueErr && <p className="text-sm text-amber-700 bg-amber-50 rounded p-2">{queueErr}</p>}
        </section>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          You can leave any time. Conversations don&apos;t persist.
        </p>
        <button onClick={go} className="btn-primary disabled:opacity-50" disabled={!mode}>
          Continue
        </button>
      </div>
    </div>
  );
}
