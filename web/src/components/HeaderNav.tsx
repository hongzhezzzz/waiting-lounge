"use client";

import Link from "next/link";
import { LiveAgentStatusBadge } from "@/components/LiveAgentStatusBadge";
import { BalanceChip } from "@/components/BalanceChip";
import { useGuardedNavClick } from "@/lib/inGame";

export function HeaderNav() {
  const guard = useGuardedNavClick();
  return (
    <header className="border-b border-line bg-bg/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" onClick={guard} className="flex items-center gap-2 group">
          <span className="text-xl">◖</span>
          <span className="font-mono text-sm tracking-tight group-hover:text-sage-deep transition">
            waiting-lounge
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <LiveAgentStatusBadge />
          <BalanceChip />
          <nav className="flex items-center gap-5 text-sm text-muted">
            <Link href="/lounge" onClick={guard} className="hover:text-ink">Lounge</Link>
            <Link href="/board" onClick={guard} className="hover:text-ink">Board</Link>
            <Link href="/leaderboard" onClick={guard} className="hover:text-ink">Leaderboard</Link>
            <Link href="/settings" onClick={guard} className="hover:text-ink">About</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
