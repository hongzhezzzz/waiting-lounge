"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useBalance } from "@/lib/points";
import { getSocket } from "@/lib/socket";
import { GAMES, GAME_DURATIONS, DEFAULT_ANTE, type GameTypeId, type GameDuration } from "@/lib/fakeData";

type IdleUser = { handle: string; userId: string; socketId: string };

export default function LoungePage() {
  const { session } = useAuth();
  const { points } = useBalance();
  const router = useRouter();
  const [idleUsers, setIdleUsers] = useState<IdleUser[]>([]);
  const [target, setTarget] = useState<IdleUser | null>(null);
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [declinedMsg, setDeclinedMsg] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Poll idle users while signed in. Backend caps lookups; we throttle to
  // 10s so the friend pilot doesn't hammer the server.
  useEffect(() => {
    if (!session) return;
    const socket = getSocket();
    function onIdleUsers(p: { users: IdleUser[] }) {
      setIdleUsers(p.users);
    }
    function onError(p: { message?: string }) {
      setErrorMsg(p?.message ?? "Error.");
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
    function onStarted(p: { gameId: string; roomId: string; gameType: string; peerHandle: string }) {
      // Inviter side: when the target accepts, server emits game_started.
      router.push(`/games/${p.gameType}/${p.roomId}?gameId=${p.gameId}&peer=${encodeURIComponent(p.peerHandle)}`);
    }

    socket.on("idle_users", onIdleUsers);
    socket.on("error_message", onError);
    socket.on("invite_sent", onSent);
    socket.on("invite_declined", onDeclined);
    socket.on("invite_expired", onExpired);
    socket.on("game_started", onStarted);

    socket.emit("list_idle_users");
    pollRef.current = setInterval(() => socket.emit("list_idle_users"), 10_000);

    return () => {
      socket.off("idle_users", onIdleUsers);
      socket.off("error_message", onError);
      socket.off("invite_sent", onSent);
      socket.off("invite_declined", onDeclined);
      socket.off("invite_expired", onExpired);
      socket.off("game_started", onStarted);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session, router]);

  function cancelPending() {
    // Server has no explicit cancel; we just clear UI and let the 30s expiry run out.
    setPendingInviteId(null);
    setPendingTarget(null);
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-4">
        <h1 className="text-2xl font-medium text-ink">Lounge</h1>
        <p className="text-sm text-muted">
          Sign in to see who&apos;s online and challenge them to a game.
        </p>
        <Link href="/login" className="btn-primary inline-block">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-ink">Lounge</h1>
        <p className="text-sm text-muted">Signed-in players, currently idle. Click to challenge.</p>
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

      {idleUsers.length === 0 && (
        <div className="card p-6 text-center text-muted text-sm">
          No one else is idle right now. Tell a friend to{" "}
          <code className="font-mono text-ink">/login</code> and refresh.
        </div>
      )}

      {idleUsers.length > 0 && (
        <ul className="space-y-2">
          {idleUsers.map((u) => (
            <li key={u.userId} className="card px-5 py-4 flex items-center justify-between text-sm">
              <span className="font-mono text-ink">{u.handle}</span>
              <button
                onClick={() => setTarget(u)}
                disabled={pendingInviteId !== null}
                className="btn-secondary disabled:opacity-50"
              >
                Challenge
              </button>
            </li>
          ))}
        </ul>
      )}

      {target && (
        <ChallengeModal
          target={target}
          balance={points ?? 0}
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
