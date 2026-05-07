"use client";

import { useCallback, useEffect, useState } from "react";
import { TAGS } from "@/lib/fakeData";
import { getBackendUrl } from "@/lib/backend";

type ApiPost = {
  id: string;
  handle: string;
  tag: string;
  body: string;
  createdAt: number;
  expiresAt: number;
  reportCount: number;
};

function minutesAgo(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function MessageBoard({ initialTag }: { initialTag?: string }) {
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [filter, setFilter] = useState<string>(initialTag && (TAGS as readonly string[]).includes(initialTag) ? initialTag : "All");
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<string>(
    initialTag && (TAGS as readonly string[]).includes(initialTag) ? initialTag : "Debugging",
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const url = new URL("/api/board", getBackendUrl());
      if (filter !== "All") url.searchParams.set("tag", filter);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = (await res.json()) as { posts: ApiPost[] };
      setPosts(data.posts || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load posts.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Light auto-refresh so cross-window posts appear without a manual reload.
  useEffect(() => {
    const id = setInterval(fetchPosts, 8_000);
    return () => clearInterval(id);
  }, [fetchPosts]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(new URL("/api/board", getBackendUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag, body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Server returned ${res.status}`);
      }
      const data = (await res.json()) as { post: ApiPost };
      setPosts((p) => [data.post, ...p]);
      setBody("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not post.");
    } finally {
      setSubmitting(false);
    }
  }

  async function report(id: string) {
    setHidden((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
    try {
      await fetch(new URL("/api/board/report", getBackendUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // best-effort; client-side hide stays
    }
  }

  const visible = posts.filter((p) => !hidden.has(p.id));

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Posting as</span>
          <span className="font-mono text-ink">anonymous</span>
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
          <button type="submit" className="btn-primary text-sm py-2 disabled:opacity-50" disabled={submitting || !body.trim()}>
            {submitting ? "Posting…" : "Post"}
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

      {err && <div className="text-sm text-amber">{err}</div>}

      <ul className="space-y-3">
        {loading && posts.length === 0 && (
          <li className="text-sm text-muted text-center py-10">Loading posts…</li>
        )}
        {!loading && visible.length === 0 && (
          <li className="text-sm text-muted text-center py-10">
            No posts yet for {filter}. Be the first.
          </li>
        )}
        {visible.map((p) => (
          <li key={p.id} className="card p-4">
            <div className="flex items-center justify-between text-xs text-muted mb-2">
              <span>
                <span className="font-mono text-ink">{p.handle}</span> · {p.tag}
              </span>
              <span>
                {minutesAgo(p.createdAt)} ·{" "}
                <button onClick={() => report(p.id)} className="hover:text-ink">
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
