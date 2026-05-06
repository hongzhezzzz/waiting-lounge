"use client";

import { useState } from "react";
import { FAKE_BOARD, TAGS, type BoardPost } from "@/lib/fakeData";

export function MessageBoard() {
  const [posts, setPosts] = useState<BoardPost[]>(FAKE_BOARD);
  const [filter, setFilter] = useState<string>("All");
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<string>("Debugging");

  const visible = filter === "All" ? posts : posts.filter((p) => p.tag === filter);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosts((p) => [
      {
        id: crypto.randomUUID(),
        handle: "you",
        tag,
        body,
        minutesAgo: 0,
      },
      ...p,
    ]);
    setBody("");
  }

  function hide(id: string) {
    setPosts((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Posting as</span>
          <span className="font-mono text-ink">you</span>
          <span className="text-muted">in</span>
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="rounded-full border border-line bg-bg px-3 py-1 text-sm"
          >
            {TAGS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="One short thought. No code, no secrets. Posts vanish in 24 hours."
          rows={3}
          maxLength={500}
          className="w-full rounded-2xl border border-line bg-bg px-4 py-3 text-sm focus:outline-none focus:border-sage resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">{body.length}/500</span>
          <button type="submit" className="btn-primary text-sm py-2">
            Post
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {["All", ...TAGS].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`chip ${filter === t ? "chip-active" : ""}`}
            type="button"
          >
            {t}
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {visible.length === 0 && (
          <li className="text-sm text-muted text-center py-10">No posts yet for {filter}.</li>
        )}
        {visible.map((p) => (
          <li key={p.id} className="card p-4">
            <div className="flex items-center justify-between text-xs text-muted mb-2">
              <span>
                <span className="font-mono text-ink">{p.handle}</span> · {p.tag}
                {p.mood && <> · {p.mood}</>}
              </span>
              <span>
                {p.minutesAgo === 0 ? "just now" : `${p.minutesAgo}m ago`} ·{" "}
                <button onClick={() => hide(p.id)} className="hover:text-ink">
                  Report
                </button>
              </span>
            </div>
            <p className="text-sm text-ink whitespace-pre-wrap">{p.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
