"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatWindow } from "@/components/ChatWindow";
import { ClaudeNeedsYouOverlay } from "@/components/ClaudeNeedsYouOverlay";
import { AgentStatusBadge, type AgentStatus } from "@/components/AgentStatusBadge";

export default function ChatPage() {
  const [alertOpen, setAlertOpen] = useState(false);
  const [status, setStatus] = useState<AgentStatus>("waiting");

  function fireDemoAlert() {
    setStatus("needs_attention");
    setAlertOpen(true);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted">
          <Link href="/join" className="hover:text-ink">← Back to lounge</Link>
        </div>
        <AgentStatusBadge status={status} />
      </div>

      <ChatWindow />

      <button
        onClick={fireDemoAlert}
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
        onSnooze={() => {
          setAlertOpen(false);
          setTimeout(() => {
            setAlertOpen(true);
          }, 30_000);
        }}
      />
    </div>
  );
}
