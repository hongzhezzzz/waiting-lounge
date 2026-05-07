"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBackendUrl } from "@/lib/backend";
import { useAuth } from "@/lib/auth";

type Entry = { rank: number; handle: string; points: number };

export default function LeaderboardPage() {
  const { session } = useAuth();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myHandle, setMyHandle] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${getBackendUrl()}/api/leaderboard?limit=20`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((data: { entries: Entry[] }) => setEntries(data.entries))
      .catch((e) => setError(String(e)));
  }, []);

  // If signed in, fetch our own handle so we can highlight our row.
  useEffect(() => {
    if (!session?.access_token) return;
    fetch(`${getBackendUrl()}/api/me`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { handle: string } | null) => d && setMyHandle(d.handle));
  }, [session?.access_token]);

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-ink">Leaderboard</h1>
        <p className="text-sm text-muted">Top 20 lounge players by points. Anonymous handles.</p>
      </div>

      {error && (
        <div className="card p-4 text-sm text-amber-700 bg-amber-50">
          Could not load leaderboard: <span className="font-mono">{error}</span>
        </div>
      )}

      {!entries && !error && <div className="text-muted">Loading…</div>}

      {entries && entries.length === 0 && (
        <div className="card p-6 text-center text-muted">
          No one is on the board yet.{" "}
          <Link href="/login" className="underline hover:text-ink">Sign in</Link> and play a game to be the first.
        </div>
      )}

      {entries && entries.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left w-12">Rank</th>
                <th className="px-4 py-3 text-left">Handle</th>
                <th className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isMe = myHandle != null && e.handle === myHandle;
                return (
                  <tr
                    key={e.rank}
                    className={`border-t border-line ${isMe ? "bg-sage-soft" : ""}`}
                  >
                    <td className="px-4 py-3 font-mono text-muted">{e.rank}</td>
                    <td className={`px-4 py-3 font-mono ${isMe ? "text-sage-deep font-medium" : "text-ink"}`}>
                      {e.handle}{isMe && <span className="ml-2 text-xs text-muted">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink">{e.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!session && entries && entries.length > 0 && (
        <p className="text-xs text-muted text-center">
          <Link href="/login" className="underline hover:text-ink">Sign in</Link> to claim a handle and start climbing.
        </p>
      )}
    </div>
  );
}
