"use client";

import { useEffect } from "react";

export function ClaudeNeedsYouOverlay({
  open,
  onClose,
  onSnooze,
}: {
  open: boolean;
  onClose: () => void;
  onSnooze: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const original = document.title;
    document.title = "● Claude needs you";
    return () => {
      document.title = original;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
      <div className="card max-w-md w-full p-8 text-center border-amber">
        <div className="text-5xl mb-4">●</div>
        <h2 className="text-2xl font-semibold text-ink mb-2">Claude needs your attention.</h2>
        <p className="text-muted mb-6">Return to terminal.</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button onClick={onClose} className="btn-primary">
            Return to terminal
          </button>
          <button onClick={onSnooze} className="btn-secondary">
            Give me 30 seconds
          </button>
        </div>
      </div>
    </div>
  );
}
