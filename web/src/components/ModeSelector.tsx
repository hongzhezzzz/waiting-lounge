"use client";

import { MODES } from "@/lib/fakeData";

export function ModeSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (m: string) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          type="button"
          className={`text-left p-4 rounded-2xl border transition ${
            value === m.id
              ? "border-sage bg-sage-soft"
              : "border-line bg-surface hover:border-sage hover:bg-sage-soft/40"
          }`}
        >
          <div className="font-medium text-ink">{m.label}</div>
          <div className="text-sm text-muted mt-1">{m.description}</div>
        </button>
      ))}
    </div>
  );
}
