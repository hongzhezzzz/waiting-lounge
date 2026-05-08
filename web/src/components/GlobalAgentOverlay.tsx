"use client";

import { useEffect, useRef, useState } from "react";
import { ClaudeNeedsYouOverlay } from "./ClaudeNeedsYouOverlay";
import { useAgentStatus } from "@/lib/agentStatus";

export function GlobalAgentOverlay() {
  const { meta, acknowledge } = useAgentStatus();
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

  // "Return to terminal" → close the modal AND clear the underlying
  // status. The provider also suppresses incoming needs_attention
  // updates for a few seconds, so a burst of duplicate Notifications
  // doesn't immediately re-pop the modal.
  function handleClose() {
    setOpen(false);
    acknowledge();
  }

  return (
    <ClaudeNeedsYouOverlay
      open={open}
      onClose={handleClose}
      onSnooze={() => {
        setOpen(false);
        // Snooze does not acknowledge — the user explicitly wants to
        // be re-shown. If status is still needs_attention 30s later,
        // re-open.
        setTimeout(() => {
          if (meta.status === "needs_attention") setOpen(true);
        }, 30_000);
      }}
    />
  );
}
