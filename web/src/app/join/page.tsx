"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TagSelector } from "@/components/TagSelector";
import { ModeSelector } from "@/components/ModeSelector";
import { MOODS, type Tag, type Mood } from "@/lib/fakeData";

export default function JoinPage() {
  const router = useRouter();
  const [tag, setTag] = useState<Tag | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [mode, setMode] = useState<string | null>(null);

  function go() {
    if (!mode) return;
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (mood) params.set("mood", mood);
    if (mode === "match") router.push(`/chat?${params.toString()}`);
    else if (mode === "board") router.push(`/board?${params.toString()}`);
    else router.push(`/lounge?${params.toString()}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-ink">Claude is working. What kind of wait is this?</h1>
      </div>

      <section className="space-y-3 mb-8">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wider">Tag</h2>
        <TagSelector value={tag} onChange={setTag} />
      </section>

      <section className="space-y-3 mb-8">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wider">Mood (optional)</h2>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(mood === m ? null : m)}
              className={`chip ${mood === m ? "chip-active" : ""}`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 mb-10">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wider">Mode</h2>
        <ModeSelector value={mode} onChange={setMode} />
      </section>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          You can leave any time. Conversations don&apos;t persist.
        </p>
        <button onClick={go} className="btn-primary disabled:opacity-50" disabled={!mode}>
          Continue
        </button>
      </div>
    </div>
  );
}
