// Waiting Lounge — message board scene (Stage 11b).
//
// Read-only first cut: fetches GET /api/board and renders the 24h-TTL
// posts. Scroll with ↑/↓ or j/k; Q or Esc returns to the lobby.
// Posting from the TUI is a deferred follow-up (needs a text-input flow).

import { createElement as h, useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { C, B, Footer } from "../lib/theme.mjs";
import api from "../lib/api.js";

const VISIBLE_ROWS = 10; // posts shown at once before scrolling

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function truncate(s, max) {
  const str = String(s ?? "");
  return str.length <= max ? str : str.slice(0, max - 1) + "…";
}

export function Board({ backendUrl, onBack }) {
  const [state, setState] = useState({ loading: true, posts: null, error: null });
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setState({ loading: true, posts: null, error: null });
    setOffset(0);
    const r = await api.fetchJson(`${backendUrl}/api/board`);
    if (!r.ok) {
      setState({ loading: false, posts: null, error: r.error });
      return;
    }
    const posts = Array.isArray(r.data?.posts) ? r.data.posts : [];
    setState({ loading: false, posts, error: null });
  }, [backendUrl]);

  useEffect(() => { load(); }, [load]);

  const posts = state.posts || [];
  const maxOffset = Math.max(0, posts.length - VISIBLE_ROWS);

  useInput((input, key) => {
    if (input === "q" || input === "Q" || key.escape) {
      onBack();
      return;
    }
    if (input === "r" || input === "R") {
      load();
      return;
    }
    if (key.downArrow || input === "j") {
      setOffset((o) => Math.min(maxOffset, o + 1));
      return;
    }
    if (key.upArrow || input === "k") {
      setOffset((o) => Math.max(0, o - 1));
    }
  });

  if (state.loading) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "Message board"),
      h(Text, { color: C.warning }, "Loading posts…"),
      h(Footer, { items: [["Q", " back to lobby"]] }),
    );
  }

  if (state.error) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "Message board"),
      h(Box, { borderStyle: B.strong, borderColor: C.danger, paddingX: 1 },
        h(Text, { color: C.danger }, state.error),
      ),
      h(Footer, { items: [["R", " retry"], ["Q", " back to lobby"]] }),
    );
  }

  if (posts.length === 0) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "Message board"),
      h(Text, { dimColor: true }, "No posts yet. Posts vanish 24h after they're written."),
      h(Footer, { items: [["R", " refresh"], ["Q", " back to lobby"]] }),
    );
  }

  const cols = process.stdout.columns ?? 80;
  const bodyWidth = Math.max(20, cols - 24); // leave room for handle + time
  const slice = posts.slice(offset, offset + VISIBLE_ROWS);
  const more = posts.length - offset - slice.length;

  return h(Box, { flexDirection: "column" },
    h(Box, null,
      h(Text, { bold: true, color: C.brand }, "Message board"),
      h(Text, { dimColor: true }, `  ${posts.length} post${posts.length === 1 ? "" : "s"} · vanish in 24h`),
    ),
    h(Box, { marginTop: 1, flexDirection: "column" },
      ...slice.map((p, i) =>
        h(Box, { key: p.id || i, flexDirection: "column", marginBottom: 1 },
          h(Box, null,
            h(Text, { color: C.peer, bold: true }, truncate(p.handle, 18)),
            h(Text, { dimColor: true }, `  ${relativeTime(p.createdAt)}`),
            p.tag ? h(Text, { color: C.link }, `  #${truncate(p.tag, 16)}`) : null,
          ),
          h(Text, null, truncate(p.body, bodyWidth)),
        ),
      ),
    ),
    offset > 0 || more > 0
      ? h(Text, { dimColor: true },
          `  ${offset > 0 ? "↑ more above  " : ""}${more > 0 ? `↓ ${more} more below` : ""}`)
      : null,
    h(Footer, { items: [["↑↓", " scroll"], ["R", " refresh"], ["Q", " back to lobby"]] }),
  );
}

export default Board;
