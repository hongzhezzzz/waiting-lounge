"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MessageBoard } from "@/components/MessageBoard";
import { ClaudeNeedsYouOverlay } from "@/components/ClaudeNeedsYouOverlay";
import { AgentStatusBadge, type AgentStatus } from "@/components/AgentStatusBadge";

function BoardPageInner() {
  const params = useSearchParams();
  const initialTag = params.get("tag") || undefined;
  const [alertOpen, setAlertOpen] = useState(false);
  const [status, setStatus] = useState<AgentStatus>("waiting");

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/join" className="text-sm text-muted hover:text-ink">
            ← Back to lounge
          </Link>
          <h1 className="text-2xl font-medium text-ink mt-1">Message board</h1>
          <p className="text-sm text-muted">
            Short, anonymous, vanishes in 24 hours. No code, no secrets.
          </p>
        </div>
        <AgentStatusBadge status={status} />
      </div>

      <MessageBoard initialTag={initialTag} />

      <button
        onClick={() => {
          setStatus("needs_attention");
          setAlertOpen(true);
        }}
        className="fixed bottom-6 right-6 rounded-full bg-amber text-white shadow-soft px-4 py-2 text-sm font-medium hover:bg-amber/90 transition"
      >
        ▶ demo Claude-needs-you alert
      </button>

      <ClaudeNeedsYouOverlay
        open={alertOpen}
        onClose={() => {
          setAlertOpen(false);
          setStatus("done");
        }}
        onSnooze={() => setAlertOpen(false)}
      />
    </div>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-6 py-12 text-muted">Loading…</div>}>
      <BoardPageInner />
    </Suspense>
  );
}
