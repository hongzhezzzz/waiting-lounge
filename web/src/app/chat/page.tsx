"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChatWindow } from "@/components/ChatWindow";
import { LiveChatWindow } from "@/components/LiveChatWindow";
import { useAgentStatus } from "@/lib/agentStatus";

function ChatPageInner() {
  const params = useSearchParams();
  const demo = params.get("demo") === "1";
  const tag = params.get("tag") || "Random";
  const { simulate } = useAgentStatus();

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted">
          <Link href="/join" className="hover:text-ink">← Back to lounge</Link>
          {demo && <span className="ml-3 text-amber">demo mode</span>}
        </div>
      </div>

      {demo ? <ChatWindow /> : <LiveChatWindow tag={tag} />}

      <button
        onClick={() => simulate("needs_attention")}
        className="fixed bottom-6 right-6 rounded-full bg-amber text-white shadow-soft px-4 py-2 text-sm font-medium hover:bg-amber/90 transition"
      >
        ▶ demo Claude-needs-you alert
      </button>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-6 py-12 text-muted">Loading…</div>}>
      <ChatPageInner />
    </Suspense>
  );
}
