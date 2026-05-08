"use client";

// Tiny chip in the header that shows the user's current Daily Brain
// Bet streak (only when > 0). Clicks through to /daily. Polls once on
// mount and re-fetches when the user changes.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getBackendUrl } from "@/lib/backend";

export function StreakChip() {
  const { session } = useAuth();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!session) {
      setCurrent(0);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${getBackendUrl()}/api/daily/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: { todayScore: number | null; streak: { current: number; longest: number } } = await res.json();
        if (!cancelled) setCurrent(data.streak?.current ?? 0);
      } catch {
        // Network blip — stay at 0.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session || current <= 0) return null;
  return (
    <Link
      href="/daily"
      title={`${current}-day streak`}
      className="text-xs px-2 py-1 rounded-full border border-amber bg-amber-50/60 text-amber-900 font-mono hover:bg-amber-50 transition flex items-center gap-1.5"
    >
      <Flame className="w-3.5 h-3.5" strokeWidth={1.75} />
      <span>{current}</span>
    </Link>
  );
}
