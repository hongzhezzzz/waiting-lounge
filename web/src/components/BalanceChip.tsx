"use client";

import Link from "next/link";
import { Coins, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useBalance } from "@/lib/points";

export function BalanceChip() {
  const { session } = useAuth();
  const { points } = useBalance();

  if (!session) {
    return (
      <Link
        href="/login"
        className="text-xs px-2 py-1 rounded-full border border-line text-muted hover:text-ink hover:border-sage transition flex items-center gap-1.5"
      >
        <LogIn className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span>Sign in</span>
      </Link>
    );
  }

  return (
    <Link
      href="/me"
      className="text-xs px-2 py-1 rounded-full border border-sage bg-sage-soft/40 text-sage-deep font-mono hover:bg-sage-soft transition flex items-center gap-1.5"
      title="Your balance"
    >
      <Coins className="w-3.5 h-3.5" strokeWidth={1.75} />
      <span>{points == null ? "…" : `${points} pts`}</span>
    </Link>
  );
}
