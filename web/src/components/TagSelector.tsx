"use client";

import { TAGS, type Tag } from "@/lib/fakeData";

export function TagSelector({
  value,
  onChange,
}: {
  value: Tag | null;
  onChange: (t: Tag) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TAGS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`chip ${value === t ? "chip-active" : ""}`}
          type="button"
        >
          {t}
        </button>
      ))}
    </div>
  );
}
