"use client";

import { useEffect, useRef, useState } from "react";
import { ClaudeNeedsYouOverlay } from "./ClaudeNeedsYouOverlay";
import { useAgentStatus } from "@/lib/agentStatus";

export function GlobalAgentOverlay() {
  const { meta } = useAgentStatus();
  const [open, setOpen] = useState(false);
  const lastShownTsRef = useRef(0);

  // Open the overlay any time a needs_attention update arrives that we haven't
  // already shown. Uses ts so a brand-new event re-opens after a snooze.
  useEffect(() => {
    if (meta.status === "needs_attention" && meta.ts > lastShownTsRef.current) {
      lastShownTsRef.current = meta.ts;
      setOpen(true);
    }
  }, [meta.status, meta.ts]);

  return (
    <ClaudeNeedsYouOverlay
      open={open}
      onClose={() => setOpen(false)}
      onSnooze={() => {
        setOpen(false);
        // If status is still needs_attention 30s later, re-open.
        setTimeout(() => {
          if (meta.status === "needs_attention") setOpen(true);
        }, 30_000);
      }}
    />
  );
}
