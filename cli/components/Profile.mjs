// Waiting Lounge — profile scene (Stage 11b).
//
// Anonymous users see a "sign in to see your profile" prompt that routes
// back through the lobby's [F] flow. Signed-in users see their identity
// card (email, handle, points) + recent game history.
//
// Fetches GET /api/me and GET /api/me/game-history — both require a
// Bearer token. Q or Esc returns to the lobby; R retries on error.

import { createElement as h, useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { C, B, Footer } from "../lib/theme.mjs";
import api from "../lib/api.js";

function truncate(s, max) {
  const str = String(s ?? "");
  return str.length <= max ? str : str.slice(0, max - 1) + "…";
}

function outcomeLabel(g) {
  if (g.outcome === "in_progress") return { text: "in progress", color: C.warning };
  if (g.outcome === "aborted") return { text: "aborted", color: "gray" };
  if (g.outcome === "tie") return { text: "tie", color: C.warning };
  if (g.didIWin) return { text: "won", color: C.success };
  return { text: "lost", color: C.danger };
}

export function Profile({ backendUrl, token, onBack }) {
  const [state, setState] = useState({ loading: true, me: null, games: null, error: null });

  const load = useCallback(async () => {
    if (!token) return; // anonymous — handled in render, no fetch
    setState({ loading: true, me: null, games: null, error: null });
    const [meRes, histRes] = await Promise.all([
      api.fetchJson(`${backendUrl}/api/me`, { token }),
      api.fetchJson(`${backendUrl}/api/me/game-history?limit=8`, { token }),
    ]);
    if (!meRes.ok) {
      setState({ loading: false, me: null, games: null, error: meRes.error });
      return;
    }
    const games = histRes.ok && Array.isArray(histRes.data?.games) ? histRes.data.games : [];
    setState({ loading: false, me: meRes.data, games, error: null });
  }, [backendUrl, token]);

  useEffect(() => { load(); }, [load]);

  useInput((input, key) => {
    if (input === "q" || input === "Q" || key.escape) {
      onBack();
      return;
    }
    if (token && (input === "r" || input === "R")) load();
  });

  // Anonymous — no token on disk yet.
  if (!token) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "My profile"),
      h(Box, { marginTop: 1, flexDirection: "column" },
        h(Text, null, "You're playing anonymously — no saved profile yet."),
        h(Text, { dimColor: true }, "Pick [F] Find a match from the lobby to sign in; your"),
        h(Text, { dimColor: true }, "points, streak, and game history start saving from there."),
      ),
      h(Footer, { items: [["Q", " back to lobby"]] }),
    );
  }

  if (state.loading) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "My profile"),
      h(Text, { color: C.warning }, "Loading your profile…"),
      h(Footer, { items: [["Q", " back to lobby"]] }),
    );
  }

  if (state.error) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "My profile"),
      h(Box, { borderStyle: B.strong, borderColor: C.danger, paddingX: 1 },
        h(Text, { color: C.danger }, state.error),
      ),
      h(Footer, { items: [["R", " retry"], ["Q", " back to lobby"]] }),
    );
  }

  const me = state.me || {};
  const games = state.games || [];

  return h(Box, { flexDirection: "column" },
    h(Text, { bold: true, color: C.brand }, "My profile"),
    // Identity card.
    h(Box, { marginTop: 1, borderStyle: B.primary, borderColor: "gray", paddingX: 1, flexDirection: "column" },
      h(Box, null,
        h(Text, { dimColor: true }, "handle  "),
        h(Text, { color: C.brand, bold: true }, me.handle || "—"),
      ),
      h(Box, null,
        h(Text, { dimColor: true }, "email   "),
        h(Text, null, me.email || "—"),
      ),
      h(Box, null,
        h(Text, { dimColor: true }, "points  "),
        h(Text, { color: C.success, bold: true }, String(me.points ?? 0)),
        me.refilledAmount > 0
          ? h(Text, { color: C.success, dimColor: true }, `  (+${me.refilledAmount} daily refill)`)
          : null,
      ),
    ),
    // Recent games.
    h(Box, { marginTop: 1, flexDirection: "column" },
      h(Text, { dimColor: true }, games.length > 0 ? "recent games" : "no games played yet"),
      ...games.map((g, i) => {
        const o = outcomeLabel(g);
        return h(Box, { key: g.id || i },
          h(Text, { color: o.color }, o.text.padEnd(12)),
          h(Text, { dimColor: true }, "vs "),
          h(Text, { color: C.peer }, truncate(g.opponentHandle || "—", 20).padEnd(22)),
          h(Text, { dimColor: true }, `ante ${g.ante}`),
        );
      }),
    ),
    h(Footer, { items: [["R", " refresh"], ["Q", " back to lobby"]] }),
  );
}

export default Profile;
