"use client";

export type AgentStatus = "waiting" | "needs_attention" | "done" | "disconnected";

const LABELS: Record<AgentStatus, string> = {
  waiting: "Claude is working",
  needs_attention: "Claude needs your attention",
  done: "Claude may be done",
  disconnected: "Not connected",
};

const TONES: Record<AgentStatus, string> = {
  waiting: "bg-sage-soft text-sage-deep border-sage",
  needs_attention: "bg-amber-soft text-amber border-amber",
  done: "bg-line text-ink border-line",
  disconnected: "bg-surface text-muted border-line",
};

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${TONES[status]}`}
      aria-live="polite"
    >
      <span
        className={`w-2 h-2 rounded-full ${
          status === "waiting"
            ? "bg-sage animate-pulse"
            : status === "needs_attention"
            ? "bg-amber animate-pulse"
            : status === "done"
            ? "bg-muted"
            : "bg-line"
        }`}
      />
      {LABELS[status]}
    </span>
  );
}
