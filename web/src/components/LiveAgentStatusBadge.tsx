"use client";

import { useAgentStatus } from "@/lib/agentStatus";
import { AgentStatusBadge } from "./AgentStatusBadge";

export function LiveAgentStatusBadge() {
  const { meta } = useAgentStatus();

  if (!meta.isPaired) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
        <span className="w-2 h-2 rounded-full bg-line" />
        Not paired
      </span>
    );
  }

  return <AgentStatusBadge status={meta.status} />;
}
