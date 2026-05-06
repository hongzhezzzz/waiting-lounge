"use client";

import Link from "next/link";

export function ReportBlockControls() {
  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => alert("(demo) Report submitted. Thanks.")}
        className="text-muted hover:text-ink"
      >
        Report
      </button>
      <span className="text-line">·</span>
      <button
        type="button"
        onClick={() => alert("(demo) Blocked. You won't be matched again.")}
        className="text-muted hover:text-ink"
      >
        Block
      </button>
      <span className="text-line">·</span>
      <Link href="/join" className="text-muted hover:text-ink">
        New match
      </Link>
      <span className="text-line">·</span>
      <Link href="/" className="text-muted hover:text-ink">
        Leave
      </Link>
    </div>
  );
}
