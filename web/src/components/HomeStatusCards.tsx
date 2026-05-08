"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Users, MessageSquare, Trophy } from "lucide-react";
import { getBackendUrl } from "@/lib/backend";

type Stats = {
  idleCount: number;
  inGameCount: number;
  postsLastHour: number;
  topThree: Array<{ handle: string; points: number; rank: number }>;
};

const POLL_MS = 12_000;

export function HomeStatusCards() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${getBackendUrl()}/api/lounge/stats`);
        if (!res.ok) return;
        const data: Stats = await res.json();
        if (!cancelled) setStats(data);
      } catch {
        // Network blip; next poll will catch up.
      }
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const idle = stats?.idleCount ?? 0;
  const inGame = stats?.inGameCount ?? 0;
  const posts = stats?.postsLastHour ?? 0;

  return (
    <div className="grid sm:grid-cols-3 gap-4">
      <Link href="/lounge" className="card p-5 hover:border-sage transition block">
        <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wider mb-2">
          <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Lounge</span>
        </div>
        <div className="text-3xl font-medium text-ink mb-1 leading-none">
          {stats ? idle : "—"}
          <span className="text-base text-muted ml-2 font-normal">active</span>
        </div>
        <div className="text-sm text-muted">
          {inGame} game{inGame === 1 ? "" : "s"} in progress
        </div>
      </Link>

      <Link href="/board" className="card p-5 hover:border-sage transition block">
        <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wider mb-2">
          <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Board</span>
        </div>
        <div className="text-3xl font-medium text-ink mb-1 leading-none">
          {stats ? posts : "—"}
          <span className="text-base text-muted ml-2 font-normal">post{posts === 1 ? "" : "s"}</span>
        </div>
        <div className="text-sm text-muted">in the last hour</div>
      </Link>

      <Link href="/leaderboard" className="card p-5 hover:border-sage transition block">
        <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wider mb-2">
          <Trophy className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Leaderboard</span>
        </div>
        {stats && stats.topThree.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {stats.topThree.map((row) => (
              <li key={row.handle} className="flex items-baseline justify-between">
                <span>
                  <span className="text-muted font-mono">#{row.rank}</span>{" "}
                  <span className="font-mono text-ink">{row.handle}</span>
                </span>
                <span className="text-muted font-mono">{row.points}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-muted">No scores yet — be first.</div>
        )}
      </Link>
    </div>
  );
}
