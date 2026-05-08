// In-match chat panel (TUI). Renders a fixed-height box at all times
// so adding a message or toggling chat mode does NOT change the
// frame's total line count — that was the root cause of the
// terminal "shaking" on send: when the frame's height changes, ink
// re-flows the whole layout, scrolling the terminal and repainting
// every line, which reads as a visible jitter.
//
// Constant height is achieved by:
//   - Always rendering exactly MAX_VISIBLE message slots, padded
//     with a single-space line when the conversation has fewer
//     messages than that.
//   - Always rendering the input row, even when chatMode is false
//     (it's just an empty placeholder line in that case).
//
// Long message bodies are truncated to fit on one terminal line so
// they never wrap.

import { Box, Text } from "ink";
import { createElement as h } from "react";

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

  // Pad to exactly MAX_VISIBLE slots so the panel height is constant.
  const slots = [];
  for (let i = 0; i < MAX_VISIBLE; i++) {
    slots.push(recent[i] || null);
  }

  return h(Box, {
    flexDirection: "column",
    borderStyle: "single",
    borderColor: chatMode ? "cyan" : "gray",
    paddingX: 1,
    paddingY: 0,
    marginTop: 1,
  },
    // Header (always 1 line)
    h(Box, null,
      h(Text, { dimColor: true }, "💬 chat"),
      peerHandle ? h(Text, { dimColor: true }, ` · vs ${peerHandle}`) : null,
      hidden > 0 ? h(Text, { dimColor: true }, `  · ${hidden} earlier`) : null,
      chatMode
        ? h(Text, { color: "cyan" }, "  · ESC to exit")
        : h(Text, { dimColor: true }, "  · T to chat"),
    ),

    // MAX_VISIBLE message slot lines, padded with empty space lines
    // so the panel height is invariant.
    ...slots.map((m, i) => {
      if (!m) {
        return h(Box, { key: i }, h(Text, null, " "));
      }
      const tag = m.from === "me" ? (myHandle || "you") : (peerHandle || "peer");
      return h(Box, { key: i },
        h(Text, { color: m.from === "me" ? "cyan" : "magenta" },
          `${tag}: ${truncate(m.body)}`,
        ),
      );
    }),

    // Input row (always 1 line — empty placeholder when not in chat mode)
    h(Box, null,
      chatMode
        ? h(Text, null,
            h(Text, { color: "yellow", bold: true }, "› "),
            h(Text, { color: "white" }, chatInput || ""),
            h(Text, { color: "yellow" }, "_"),
          )
        : h(Text, null, " "),
    ),
  );
}
