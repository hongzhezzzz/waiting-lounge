"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useBalance } from "@/lib/points";

export function BalanceChip() {
  const { session } = useAuth();
  const { points } = useBalance();

  if (!session) {
    return (
      <Link
        href="/login"
        className="text-xs px-2 py-1 rounded-full border border-line text-muted hover:text-ink hover:border-sage transition"
      >
        Sign in
      </Link>
    );
  }

  return (
    <Link
      href="/me"
      className="text-xs px-2 py-1 rounded-full border border-sage bg-sage-soft/40 text-sage-deep font-mono hover:bg-sage-soft transition"
      title="Your balance"
    >
      {points == null ? "…" : `${points} pts`}
    </Link>
  );
}
