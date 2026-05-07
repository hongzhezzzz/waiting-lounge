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
};

export default function MePage() {
  const router = useRouter();
  const { session, signOut, loading } = useAuth();
  const { points, refresh } = useBalance();
  const { deviceId } = useAgentStatus();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bindMsg, setBindMsg] = useState<string | null>(null);
  const [bindBusy, setBindBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    fetch(`${getBackendUrl()}/api/me`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => setProfile(p));
  }, [session, loading, router]);

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
