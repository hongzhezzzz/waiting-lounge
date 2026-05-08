"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useBalance } from "@/lib/points";
import { getSocket } from "@/lib/socket";
import { getBackendUrl } from "@/lib/backend";
import { GAMES, GAME_DURATIONS, DEFAULT_ANTE, type GameTypeId, type GameDuration } from "@/lib/fakeData";
import { LoungeTicker, type RecentEvent } from "@/components/LoungeTicker";

type IdleUser = { handle: string; userId: string; socketId: string };
type PoolGameType = "brain_bet" | "spot_the_bug";
type LoungeStats = {
  idleCount: number;
  inGameCount: number;
  postsLastHour: number;
  topThree: Array<{ handle: string; points: number; rank: number }>;
  recentEvents: RecentEvent[];
};

const POOL_GAMES: { id: PoolGameType; label: string }[] = [
  { id: "brain_bet", label: "Brain Bet" },
  { id: "spot_the_bug", label: "Spot the Bug" },
];
const POOL_ANTE = 100;
const POOL_DURATION_LABEL = "5-min match";

export default function LoungePage() {
  const { session } = useAuth();
  const { points } = useBalance();
  const [idleUsers, setIdleUsers] = useState<IdleUser[]>([]);
  const [target, setTarget] = useState<IdleUser | null>(null);
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [declinedMsg, setDeclinedMsg] = useState<string | null>(null);
  const [poolMatching, setPoolMatching] = useState<PoolGameType | null>(null);
  const [stats, setStats] = useState<LoungeStats | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const statsPollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!session) return;
    const socket = getSocket();
    function onIdleUsers(p: { users: IdleUser[] }) {
      setIdleUsers(p.users);
    }
    function onError(p: { message?: string }) {
      setErrorMsg(p?.message ?? "Error.");
      setPoolMatching(null);
    }
    function onSent(p: { inviteId: string; targetHandle: string }) {
      setPendingInviteId(p.inviteId);
      setPendingTarget(p.targetHandle);
    }
    function onDeclined() {
      setPendingInviteId(null);
      setPendingTarget(null);
      setDeclinedMsg("Invite declined.");
      window.setTimeout(() => setDeclinedMsg(null), 3000);
    }
    function onExpired() {
      setPendingInviteId(null);
      setPendingTarget(null);
      setDeclinedMsg("Invite expired without an answer.");
      window.setTimeout(() => setDeclinedMsg(null), 3000);
    }
    function onPoolWaiting() {
      // Server confirmed we're in the pool. UI already shows "Matching…".
    }
    function onQueueCancelled() {
      setPoolMatching(null);
    }
    function onStarted() {
      // Routing is delegated to the layout-level <GameStartRedirect>.
      // We only clear local state for cleanliness; the page is about
      // to unmount on the redirect anyway.
      setPoolMatching(null);
    }

    socket.on("idle_users", onIdleUsers);
    socket.on("error_message", onError);
    socket.on("invite_sent", onSent);
    socket.on("invite_declined", onDeclined);
    socket.on("invite_expired", onExpired);
    socket.on("pool_waiting", onPoolWaiting);
    socket.on("game_queue_cancelled", onQueueCancelled);
    socket.on("game_started", onStarted);

    socket.emit("list_idle_users");
    pollRef.current = setInterval(() => socket.emit("list_idle_users"), 10_000);

    return () => {
      socket.off("idle_users", onIdleUsers);
      socket.off("error_message", onError);
      socket.off("invite_sent", onSent);
      socket.off("invite_declined", onDeclined);
      socket.off("invite_expired", onExpired);
      socket.off("pool_waiting", onPoolWaiting);
      socket.off("game_queue_cancelled", onQueueCancelled);
      socket.off("game_started", onStarted);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session]);

  // Lounge stats (counter row + recent ticker + leaderboard top 3).
  // Polls at 12 s — same cadence as the homepage cards. Single fetch
  // covers all three UI elements; failures fall through silently.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${getBackendUrl()}/api/lounge/stats`);
        if (!res.ok) return;
        const data: LoungeStats = await res.json();
        if (!cancelled) setStats(data);
      } catch {
        // Network blip; next poll catches up.
      }
    }
    load();
    statsPollRef.current = setInterval(load, 12_000);
    return () => {
      cancelled = true;
      if (statsPollRef.current) clearInterval(statsPollRef.current);
    };
  }, [session]);

  function findMatch(gameType: PoolGameType) {
    setPoolMatching(gameType);
    getSocket().emit("queue_for_pool", { gameType });
  }
  function cancelMatch() {
    getSocket().emit("cancel_game_queue");
    setPoolMatching(null);
  }
  function cancelPending() {
    setPendingInviteId(null);
    setPendingTarget(null);
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-4">
        <h1 className="text-2xl font-medium text-ink">Lounge</h1>
        <p className="text-sm text-muted">
          Sign in to find a match or challenge a specific player.
        </p>
        <Link href="/login" className="btn-primary inline-block">Sign in</Link>
      </div>
    );
  }

  const balance = points ?? 0;
  const canPool = balance >= POOL_ANTE;
  const matchingLabel = poolMatching === "brain_bet" ? "Brain Bet" : poolMatching === "spot_the_bug" ? "Spot the Bug" : "";

  const idle = stats?.idleCount ?? 0;
  const inGame = stats?.inGameCount ?? 0;
  const postsLast = stats?.postsLastHour ?? 0;
  const recentEvents = stats?.recentEvents ?? [];
  const topThree = stats?.topThree ?? [];

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-ink">Lounge</h1>
        <p className="text-sm text-muted">
          Hit Find a match for the fastest pairing, or challenge a specific player below.
        </p>
        {stats && (
          <div className="mt-3 text-xs text-muted font-mono">
            {idle} active · {inGame} game{inGame === 1 ? "" : "s"} in progress · {postsLast} post{postsLast === 1 ? "" : "s"} in the last hour
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="card p-3 bg-amber-50 text-sm text-amber-900">
          {errorMsg}
          <button onClick={() => setErrorMsg(null)} className="ml-3 text-xs text-muted hover:text-ink">dismiss</button>
        </div>
      )}
      {declinedMsg && (
        <div className="card p-3 bg-amber-50 text-sm text-amber-900">{declinedMsg}</div>
      )}

      {/* Pool matchmaking — primary CTA */}
      <div className="card p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-ink">Find a match</div>
            <div className="text-xs text-muted">{POOL_DURATION_LABEL} · {POOL_ANTE} pt ante · pairs with the next idle player, or a lounge bot after 30 s</div>
          </div>
          {poolMatching && (
            <button onClick={cancelMatch} className="text-xs text-muted hover:text-ink underline whitespace-nowrap">
              Cancel
            </button>
          )}
        </div>
        {poolMatching ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="inline-block w-2 h-2 rounded-full bg-sage-deep animate-pulse" aria-hidden />
            Matching for {matchingLabel}…
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {POOL_GAMES.map((g, i) => (
              <button
                key={g.id}
                onClick={() => findMatch(g.id)}
                disabled={!canPool || pendingInviteId !== null}
                className={`${i === 0 ? "btn-primary" : "btn-secondary"} disabled:opacity-50`}
              >
                {g.label}
              </button>
            ))}
            {!canPool && (
              <span className="text-xs text-amber-700 self-center">Not enough points (need {POOL_ANTE}).</span>
            )}
          </div>
        )}
      </div>

      {pendingInviteId && (
        <div className="card p-4 bg-sage-soft/40 flex items-center justify-between">
          <span className="text-sm">
            Waiting for <span className="font-mono text-ink">{pendingTarget}</span> to respond…
          </span>
          <button onClick={cancelPending} className="text-xs text-muted hover:text-ink underline">
            Hide
          </button>
        </div>
      )}

      <div>
        <h2 className="text-xs text-muted uppercase tracking-wider mb-2">Or challenge someone specific</h2>

        {idleUsers.length === 0 && (
          <div className="card p-6 text-center text-muted text-sm space-y-1">
            <div>Pretty quiet right now.</div>
            <div className="text-xs">Hit Find a match above — you&apos;ll be first in line for whoever shows up next.</div>
          </div>
        )}

        {idleUsers.length > 0 && (
          <ul className="space-y-2">
            {idleUsers.map((u) => (
              <li key={u.userId} className="card px-5 py-4 flex items-center justify-between text-sm">
                <span className="font-mono text-ink">{u.handle}</span>
                <button
                  onClick={() => setTarget(u)}
                  disabled={pendingInviteId !== null || poolMatching !== null}
                  className="btn-secondary disabled:opacity-50"
                >
                  Challenge
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {recentEvents.length > 0 && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-2">Recent activity</h2>
          <div className="card p-4">
            <LoungeTicker events={recentEvents} />
          </div>
        </div>
      )}

      {topThree.length > 0 && (
        <div>
          <h2 className="text-xs text-muted uppercase tracking-wider mb-2 flex items-baseline justify-between">
            <span>Top of the leaderboard</span>
            <Link href="/leaderboard" className="normal-case tracking-normal text-muted hover:text-ink">
              See all →
            </Link>
          </h2>
          <ul className="card p-4 space-y-1.5 text-sm">
            {topThree.map((row) => (
              <li key={row.handle} className="flex items-baseline justify-between">
                <span>
                  <span className="text-muted font-mono">#{row.rank}</span>{" "}
                  <span className="font-mono text-ink">{row.handle}</span>
                </span>
                <span className="text-muted font-mono">{row.points} pts</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {target && (
        <ChallengeModal
          target={target}
          balance={balance}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}

function ChallengeModal({
  target,
  balance,
  onClose,
}: {
  target: IdleUser;
  balance: number;
  onClose: () => void;
}) {
  const [gameType, setGameType] = useState<GameTypeId>("brain_bet");
  const [duration, setDuration] = useState<GameDuration>(1);
  const insufficient = balance < DEFAULT_ANTE;

  function send() {
    getSocket().emit("invite_to_game", {
      targetSocketId: target.socketId,
      gameType,
      durationMin: duration,
      ante: DEFAULT_ANTE,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm flex items-center justify-center px-6">
      <div className="card p-6 max-w-md w-full space-y-4">
        <h2 className="text-lg font-medium text-ink">
          Challenge <span className="font-mono">{target.handle}</span>
        </h2>

        <div>
          <h3 className="text-sm font-medium text-muted uppercase tracking-wider mb-2">Game</h3>
          <div className="grid grid-cols-2 gap-2">
            {GAMES.filter((g) => g.enabled).map((g) => (
              <button
                key={g.id}
                onClick={() => setGameType(g.id)}
                className={`text-left p-3 rounded-xl border text-sm ${
                  gameType === g.id ? "border-sage bg-sage-soft" : "border-line bg-surface hover:border-sage"
                }`}
              >
                <div className="font-medium text-ink">{g.label}</div>
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
          <span className="ml-2">· Your balance: <span className="font-mono text-ink">{balance} pts</span></span>
          {insufficient && <span className="ml-2 text-amber-700">· Not enough.</span>}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={send}
            disabled={insufficient}
            className="btn-primary disabled:opacity-50"
          >
            Send invite
          </button>
        </div>
      </div>
    </div>
  );
}
