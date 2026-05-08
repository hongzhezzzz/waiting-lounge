"use client";

import Link from "next/link";
import { Coffee, Users, MessageSquare, Trophy, ShieldCheck, CalendarDays } from "lucide-react";
import { LiveAgentStatusBadge } from "@/components/LiveAgentStatusBadge";
import { BalanceChip } from "@/components/BalanceChip";
import { StreakChip } from "@/components/StreakChip";
import { useGuardedNavClick } from "@/lib/inGame";

export function HeaderNav() {
  const guard = useGuardedNavClick();
  return (
    <header className="border-b border-line bg-bg/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" onClick={guard} className="flex items-center gap-2 group">
          <Coffee className="w-5 h-5 text-sage-deep" strokeWidth={1.75} />
          <span className="font-mono text-sm tracking-tight group-hover:text-sage-deep transition">
            waiting-lounge
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <LiveAgentStatusBadge />
          <BalanceChip />
          <StreakChip />
          <nav className="flex items-center gap-4 text-sm text-muted">
            <Link href="/lounge" onClick={guard} className="flex items-center gap-1.5 hover:text-ink transition">
              <Users className="w-4 h-4" strokeWidth={1.75} />
              <span>Lounge</span>
            </Link>
            <Link href="/daily" onClick={guard} className="flex items-center gap-1.5 hover:text-ink transition">
              <CalendarDays className="w-4 h-4" strokeWidth={1.75} />
              <span>Daily</span>
            </Link>
            <Link href="/board" onClick={guard} className="flex items-center gap-1.5 hover:text-ink transition">
              <MessageSquare className="w-4 h-4" strokeWidth={1.75} />
              <span>Board</span>
            </Link>
            <Link href="/leaderboard" onClick={guard} className="flex items-center gap-1.5 hover:text-ink transition">
              <Trophy className="w-4 h-4" strokeWidth={1.75} />
              <span>Leaderboard</span>
            </Link>
            <Link href="/settings" onClick={guard} className="flex items-center gap-1.5 hover:text-ink transition">
              <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
              <span>About</span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
