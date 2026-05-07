"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useBalance } from "@/lib/points";
import { useAgentStatus } from "@/lib/agentStatus";
import { getBackendUrl } from "@/lib/backend";

type Profile = {
  id: string;
  email: string;
  handle: string;
  points: number;
  refilledAmount: number;
};

type GameHistoryEntry = {
  id: string;
  gameType: string;
  roundSubtype: string | null;
  durationMin: number;
  ante: number;
  opponentHandle: string;
  outcome: "win" | "tie" | "aborted" | "in_progress";
  didIWin: boolean;
  startedAt: string;
  endedAt: string | null;
};

const GAME_LABELS: Record<string, string> = {
  spot_the_bug: "Spot the Bug",
  brain_bet: "Brain Bet",
};

export default function MePage() {
  const router = useRouter();
  const { session, signOut, loading } = useAuth();
  const { points, refresh } = useBalance();
  const { deviceId } = useAgentStatus();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[] | null>(null);
  const [bindMsg, setBindMsg] = useState<string | null>(null);
  const [bindBusy, setBindBusy] = useState(false);
  const [refillToast, setRefillToast] = useState<number | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    const headers = { authorization: `Bearer ${session.access_token}` };
    fetch(`${getBackendUrl()}/api/me`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Profile | null) => {
        setProfile(p);
        if (p && p.refilledAmount > 0) {
          setRefillToast(p.refilledAmount);
          // refresh the balance chip too so the header updates
          refresh();
        }
      });
    fetch(`${getBackendUrl()}/api/me/game-history?limit=20`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { games: GameHistoryEntry[] } | null) => setHistory(d?.games ?? []));
  }, [session, loading, router, refresh]);

  if (loading || !session || !profile) {
    return <div className="max-w-2xl mx-auto px-6 py-12 text-muted">Loading…</div>;
  }

  async function bind() {
    if (!deviceId) {
      setBindMsg("This browser isn't paired to a Claude Code device yet.");
      return;
    }
    setBindBusy(true);
    setBindMsg(null);
    try {
      const res = await fetch(`${getBackendUrl()}/api/me/bind-device`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify({ deviceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBindMsg(
          data.error === "device_taken_by_other"
            ? "This device is already linked to another account."
            : `Could not bind: ${data.error}`,
        );
        return;
      }
      setBindMsg(data.bound ? "Linked to this account." : "Already linked to this account.");
    } finally {
      setBindBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-ink">Your lounge profile</h1>
        <p className="text-sm text-muted">Used to keep your points across sessions.</p>
      </div>

      {refillToast != null && (
        <div className="card p-4 bg-sage-soft/40 border-sage flex items-center justify-between">
          <span className="text-sm text-sage-deep">
            <span className="font-mono">+{refillToast} pts</span> daily refill applied. Welcome back.
          </span>
          <button
            onClick={() => setRefillToast(null)}
            className="text-xs text-muted hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="card p-5 space-y-3">
        <Row label="Handle" value={<span className="font-mono">{profile.handle}</span>} />
        <Row label="Email" value={<span className="font-mono">{profile.email}</span>} />
        <Row
          label="Balance"
          value={
            <span className="font-mono text-sage-deep">
              {points ?? profile.points} pts
              <button onClick={refresh} className="ml-3 text-xs text-muted hover:text-ink">refresh</button>
            </span>
          }
        />
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wider">Recent games</h2>
        {history == null && <p className="text-sm text-muted">Loading…</p>}
        {history != null && history.length === 0 && (
          <p className="text-sm text-muted">No games played yet. Start one from /join.</p>
        )}
        {history != null && history.length > 0 && (
          <ul className="divide-y divide-line">
            {history.map((g) => (
              <li key={g.id} className="py-2 flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                    g.outcome === "aborted" ? "bg-line text-muted" :
                    g.outcome === "tie" ? "bg-line text-ink" :
                    g.didIWin ? "bg-sage-soft text-sage-deep" :
                    "bg-amber-100 text-amber-900"
                  }`}>
                    {g.outcome === "aborted" ? "—" : g.outcome === "tie" ? "T" : g.didIWin ? "W" : "L"}
                  </span>
                  <span className="text-ink truncate">{GAME_LABELS[g.gameType] ?? g.gameType}</span>
                  <span className="text-muted text-xs">vs <span className="font-mono">{g.opponentHandle}</span></span>
                </span>
                <span className="text-muted text-xs whitespace-nowrap">
                  {new Date(g.startedAt).toLocaleDateString()} · {g.durationMin}m · {g.ante} pts
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wider">This browser</h2>
        <Row
          label="Device id"
          value={
            <span className="font-mono">
              {deviceId ? `${deviceId.slice(0, 8)}…` : <span className="text-muted">not paired</span>}
            </span>
          }
        />
        <button
          onClick={bind}
          disabled={!deviceId || bindBusy}
          className="btn-secondary disabled:opacity-50"
        >
          {bindBusy ? "Linking…" : "Link this Claude Code device to my account"}
        </button>
        {bindMsg && <p className="text-sm text-muted">{bindMsg}</p>}
      </div>

      <div>
        <button onClick={() => signOut()} className="text-sm text-muted hover:text-ink underline">
          Sign out
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
