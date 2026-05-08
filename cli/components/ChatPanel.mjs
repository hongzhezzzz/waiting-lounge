// In-match chat panel (TUI). Renders the last N chat messages and an
// input line when chat mode is active. Input handling lives in
// play.mjs's useInput (so the same key stream handles game keys vs
// chat keys based on state.chatMode).
//
// Toggle: T enters chat mode, ESC exits.

import { Box, Text } from "ink";
import { createElement as h } from "react";

const VISIBLE = 5;

export function ChatPanel({ messages, chatMode, chatInput, myHandle, peerHandle }) {
  const recent = (messages || []).slice(-VISIBLE);
  const hidden = Math.max(0, (messages?.length || 0) - VISIBLE);
  const hasMessages = recent.length > 0;

  return h(Box, {
    flexDirection: "column",
    borderStyle: "single",
    borderColor: chatMode ? "cyan" : "gray",
    paddingX: 1,
    paddingY: 0,
    marginTop: 1,
  },
    h(Box, null,
      h(Text, { dimColor: true }, "💬 chat"),
      peerHandle ? h(Text, { dimColor: true }, ` · vs ${peerHandle}`) : null,
      chatMode
        ? h(Text, { color: "cyan" }, "  · typing — ESC to exit")
        : h(Text, { dimColor: true }, "  · T to chat"),
    ),

    hidden > 0 ? h(Text, { dimColor: true }, `…${hidden} earlier`) : null,

    !hasMessages
      ? h(Text, { dimColor: true, italic: true }, "No messages yet.")
      : recent.map((m, i) => {
          const tag = m.from === "me" ? (myHandle || "you") : (peerHandle || "peer");
          return h(Text, { key: i, color: m.from === "me" ? "cyan" : "magenta" },
            `${tag}: `,
            h(Text, { color: "white" }, m.body),
          );
        }),

    chatMode
      ? h(Box, { marginTop: 0 },
          h(Text, { color: "yellow", bold: true }, "› "),
          h(Text, { color: "white" }, chatInput || ""),
          h(Text, { color: "yellow" }, "_"),
        )
      : null,
  );
}
