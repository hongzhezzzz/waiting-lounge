// Single-row indicator used when the lounge is in dock mode AND the
// pane is collapsed (or any terminal smaller than COLLAPSED_THRESHOLD
// rows). Designed to fit in one row so adding/removing it doesn't
// reflow the host terminal.
//
// Format examples (all single-row, brand-icon prefix, key affordance suffix):
//   ☕ blue-cursor-241  ·  lobby  ·  [F] find  [B] bot       ·  [^L] open
//   ☕ blue-cursor-241  ·  searching the pool…              ·  [^L] open
//   ☕ blue-cursor-241  ·  vs lilac-stacktrace-782 R2/5 18s  ·  [^L] enter
//   ☕ blue-cursor-241  ·  match end                         ·  [^L] open
//   ☕ blue-cursor-241  ·  connecting…                       ·  [^L] open

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { BRAND, C, Key } from "../lib/theme.mjs";

export function CollapsedStrip({ state }) {
  const handle = state.myHandle ?? "…";
  const phase = state.appPhase;

  // Middle: phase-specific status and inline mini-keys for the most
  // common in-pane action (find/bot when in lobby).
  let middle;
  if (phase === "auth" || phase === "pairing" || phase === "connecting") {
    middle = h(Text, { color: C.warning }, "connecting…");
  } else if (phase === "lobby") {
    middle = h(Box, null,
      h(Text, { color: C.brand }, "lobby  "),
      h(Key, { label: "F" }), h(Text, { dimColor: true }, " find  "),
      h(Key, { label: "B", color: C.peer }), h(Text, { dimColor: true }, " bot"),
    );
  } else if (phase === "searching") {
    middle = h(Text, { color: C.warning }, "searching the pool…");
  } else if (phase === "in_match") {
    const round = state.round ? `R${state.round.round}/${state.round.total}` : "starting…";
    const peer = state.match?.peerHandle ?? "?";
    const sec = state.betSecondsLeft != null ? `  ${state.betSecondsLeft}s` : "";
    middle = h(Text, { color: C.peer }, `vs ${peer}  ${round}${sec}`);
  } else if (phase === "match_end") {
    middle = h(Text, { color: C.success }, "match end");
  } else if (phase === "error") {
    middle = h(Text, { color: C.danger }, `error: ${state.error ?? "?"}`);
  } else {
    middle = h(Text, null, phase);
  }

  const enterLabel = phase === "in_match" ? " enter" : " open";

  return h(Box, { flexDirection: "row" },
    h(Text, { color: C.brand, bold: true }, `${BRAND.icon} `),
    h(Text, { color: C.success }, handle),
    h(Text, { dimColor: true }, "  ·  "),
    middle,
    state.reconnecting ? h(Text, { color: C.warning }, "  ⟳") : null,
    h(Text, { dimColor: true }, "  ·  "),
    h(Key, { label: "^L" }),
    h(Text, { dimColor: true }, enterLabel),
  );
}
