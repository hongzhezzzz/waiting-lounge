// In-match chat panel (TUI). Renders a fixed-height box at all times
// so adding a message or toggling chat mode does NOT change the
// frame's total line count — that was the root cause of the terminal
// "shaking" on send.
//
// Constant height is achieved by:
//   - Always rendering exactly MAX_VISIBLE message slots, padded
//     with a single-space line when the conversation has fewer
//     messages than that.
//   - Always rendering the input row, even when chatMode is false.
//
// Long message bodies are truncated to fit on one terminal line so
// they never wrap.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { C, B, Key } from "../lib/theme.mjs";

const MAX_VISIBLE = 5;
const BODY_MAX = 60;

function truncate(s, max = BODY_MAX) {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function ChatPanel({ messages, chatMode, chatInput, myHandle, peerHandle }) {
  const all = messages || [];
  const recent = all.slice(-MAX_VISIBLE);
  const hidden = Math.max(0, all.length - MAX_VISIBLE);

  const slots = [];
  for (let i = 0; i < MAX_VISIBLE; i++) {
    slots.push(recent[i] || null);
  }

  return h(Box, {
    flexDirection: "column",
    borderStyle: B.panel,
    borderColor: chatMode ? C.brand : "gray",
    paddingX: 1,
    paddingY: 0,
    marginTop: 1,
  },
    // Header: "💬 chat · vs <peer> · N earlier  [T] chat" or "[Esc] exit chat"
    h(Box, null,
      h(Text, { dimColor: true }, "💬 chat"),
      peerHandle ? h(Text, { dimColor: true }, `  ·  vs ${peerHandle}`) : null,
      hidden > 0 ? h(Text, { dimColor: true }, `  ·  ${hidden} earlier`) : null,
      h(Text, { dimColor: true }, "  ·  "),
      chatMode
        ? h(Box, null, h(Key, { label: "Esc", color: C.brand }), h(Text, { dimColor: true }, " exit"))
        : h(Box, null, h(Key, { label: "T", color: C.brand }), h(Text, { dimColor: true }, " chat")),
    ),

    // Five message slots, padded so panel height is invariant.
    ...slots.map((m, i) => {
      if (!m) {
        return h(Box, { key: i }, h(Text, null, " "));
      }
      const tag = m.from === "me" ? (myHandle || "you") : (peerHandle || "peer");
      const tagColor = m.from === "me" ? C.brand : C.peer;
      return h(Box, { key: i },
        h(Text, { color: tagColor, bold: true }, tag),
        h(Text, { dimColor: true }, "  "),
        h(Text, null, truncate(m.body)),
      );
    }),

    // Input row — always present; empty placeholder when not in chat mode.
    h(Box, null,
      chatMode
        ? h(Box, null,
            h(Text, { color: C.warning, bold: true }, "› "),
            h(Text, null, chatInput || ""),
            h(Text, { color: C.warning }, "_"),
          )
        : h(Text, null, " "),
    ),
  );
}
