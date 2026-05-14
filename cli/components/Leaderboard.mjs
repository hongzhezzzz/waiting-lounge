// Waiting Lounge — leaderboard scene (Stage 11b).
//
// Fetches GET /api/leaderboard?limit=10 and renders the ranked table.
// The signed-in user's own row is highlighted. Q or Esc returns to the
// lobby; R retries on error.

import { createElement as h, useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { C, B, Footer } from "../lib/theme.mjs";
import api from "../lib/api.js";

function truncate(s, max) {
  const str = String(s ?? "");
  return str.length <= max ? str : str.slice(0, max - 1) + "…";
}

export function Leaderboard({ backendUrl, myHandle, onBack }) {
  const [state, setState] = useState({ loading: true, entries: null, error: null });

  const load = useCallback(async () => {
    setState({ loading: true, entries: null, error: null });
    const r = await api.fetchJson(`${backendUrl}/api/leaderboard?limit=10`);
    if (!r.ok) {
      setState({ loading: false, entries: null, error: r.error });
      return;
    }
    const entries = Array.isArray(r.data?.entries) ? r.data.entries : [];
    setState({ loading: false, entries, error: null });
  }, [backendUrl]);

  useEffect(() => { load(); }, [load]);

  useInput((input, key) => {
    if (input === "q" || input === "Q" || key.escape) {
      onBack();
      return;
    }
    if (input === "r" || input === "R") load();
  });

  if (state.loading) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "Leaderboard — Top 10"),
      h(Text, { color: C.warning }, "Loading rankings…"),
      h(Footer, { items: [["Q", " back to lobby"]] }),
    );
  }

  if (state.error) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "Leaderboard — Top 10"),
      h(Box, { borderStyle: B.strong, borderColor: C.danger, paddingX: 1 },
        h(Text, { color: C.danger }, state.error),
      ),
      h(Footer, { items: [["R", " retry"], ["Q", " back to lobby"]] }),
    );
  }

  const entries = state.entries || [];
  if (entries.length === 0) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "Leaderboard — Top 10"),
      h(Text, { dimColor: true }, "No ranked players yet. Win a pool match to get on the board."),
      h(Footer, { items: [["R", " refresh"], ["Q", " back to lobby"]] }),
    );
  }

  return h(Box, { flexDirection: "column" },
    h(Text, { bold: true, color: C.brand }, "Leaderboard — Top 10"),
    h(Box, { marginTop: 1, flexDirection: "column" },
      // Header row.
      h(Box, null,
        h(Text, { dimColor: true }, "  #   "),
        h(Text, { dimColor: true }, "handle".padEnd(24)),
        h(Text, { dimColor: true }, "points"),
      ),
      ...entries.map((e, i) => {
        const mine = myHandle && e.handle === myHandle;
        const rankStr = String(e.rank ?? i + 1).padStart(2, " ");
        const medal = (e.rank === 1) ? "🥇" : (e.rank === 2) ? "🥈" : (e.rank === 3) ? "🥉" : "  ";
        return h(Box, { key: e.handle || i },
          h(Text, { color: mine ? C.success : undefined }, `${medal} ${rankStr}  `),
          h(Text, {
            color: mine ? C.success : C.peer,
            bold: mine,
          }, truncate(e.handle, 22).padEnd(24)),
          h(Text, { color: mine ? C.success : undefined }, String(e.points)),
          mine ? h(Text, { color: C.success, dimColor: true }, "  ← you") : null,
        );
      }),
    ),
    h(Footer, { items: [["R", " refresh"], ["Q", " back to lobby"]] }),
  );
}

export default Leaderboard;
