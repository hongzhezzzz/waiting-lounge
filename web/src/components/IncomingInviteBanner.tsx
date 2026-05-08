"use client";

// Layout-level banner: any signed-in user, on any page, can receive a
// game invite. Listens for incoming_invite, shows a sticky banner with
// Accept/Decline. Auto-dismisses on invite_expired or game_started.
// Routing on accept is delegated to the layout-level <GameStartRedirect>
// — this component used to do the redirect itself but had a stale
// closure on the `accepting` flag that occasionally swallowed game_started.

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSocket } from "@/lib/socket";

type Invite = {
  inviteId: string;
  inviterHandle: string;
  gameType: string;
  durationMin: number;
  ante: number;
  expiresAt: number;
};

const GAME_LABELS: Record<string, string> = {
  spot_the_bug: "Spot the Bug",
  brain_bet: "Brain Bet",
};

export function IncomingInviteBanner() {
  const { session } = useAuth();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Tick for the countdown.
  useEffect(() => {
    if (!invite) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [invite]);

  useEffect(() => {
    if (!session) return;
    const socket = getSocket();
    function onIncoming(p: Invite) {
      setInvite(p);
    }
    function onExpired(p: { inviteId: string }) {
      setInvite((i) => (i && i.inviteId === p.inviteId ? null : i));
      setAccepting(false);
    }
    function onStarted() {
      // Any game starting (most often the one we just accepted) means
      // this banner is no longer relevant. Clearing local state is the
      // only job here — the layout-level <GameStartRedirect> performs
      // the actual routing.
      setAccepting(false);
      setInvite(null);
    }
    socket.on("incoming_invite", onIncoming);
    socket.on("invite_expired", onExpired);
    socket.on("game_started", onStarted);
    return () => {
      socket.off("incoming_invite", onIncoming);
      socket.off("invite_expired", onExpired);
      socket.off("game_started", onStarted);
    };
  }, [session]);

  if (!invite) return null;

  const remaining = Math.max(0, Math.ceil((invite.expiresAt - now) / 1000));

  function accept() {
    setAccepting(true);
    getSocket().emit("accept_invite", { inviteId: invite!.inviteId });
  }
  function decline() {
    getSocket().emit("decline_invite", { inviteId: invite!.inviteId });
    setInvite(null);
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 card px-5 py-3 shadow-lg border-sage flex items-center gap-4">
      <div className="text-sm">
        <span className="font-mono text-ink">{invite.inviterHandle}</span>{" "}
        <span className="text-muted">wants to play</span>{" "}
        <span className="text-ink">{GAME_LABELS[invite.gameType] ?? invite.gameType}</span>{" "}
        <span className="text-muted">
          ({invite.durationMin} min · ante {invite.ante} pts)
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted font-mono">{remaining}s</span>
        <button
          onClick={accept}
          disabled={accepting}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {accepting ? "Joining…" : "Accept"}
        </button>
        <button onClick={decline} className="btn-secondary text-sm">
          Decline
        </button>
      </div>
    </div>
  );
}
