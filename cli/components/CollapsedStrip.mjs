// Single-row indicator used when the lounge is in dock mode AND the
// pane is collapsed (or any terminal smaller than COLLAPSED_THRESHOLD
// rows). Designed to fit in one row so adding/removing it doesn't
// reflow the host terminal.
//
// Format: ☕ <handle> · <phase status> · ^L expand
//
// `state` is the same useReducer state the full App receives — this
// component just renders a tiny subset of it.

import { Box, Text } from "ink";
import { createElement as h } from "react";

export function CollapsedStrip({ state }) {
  const handle = state.myHandle ?? "…";
  const phase = state.appPhase;

  let middle;
  if (phase === "auth" || phase === "pairing" || phase === "connecting") {
    middle = h(Text, { color: "yellow" }, "connecting…");
  } else if (phase === "lobby") {
    middle = h(Text, { color: "cyan" }, "lobby · F=find · B=bot");
  } else if (phase === "searching") {
    middle = h(Text, { color: "yellow" }, "searching…");
  } else if (phase === "in_match") {
    const round = state.round ? `R${state.round.round}/${state.round.total}` : "starting…";
    const peer = state.match?.peerHandle ?? "?";
    const sec = state.betSecondsLeft != null ? ` · ${state.betSecondsLeft}s` : "";
    middle = h(Text, { color: "magenta" }, `vs ${peer} · ${round}${sec}`);
  } else if (phase === "match_end") {
    middle = h(Text, { color: "green" }, "match end");
  } else if (phase === "error") {
    middle = h(Text, { color: "red" }, `error: ${state.error ?? "?"}`);
  } else {
    middle = h(Text, null, phase);
  }

  return h(Box, { flexDirection: "row" },
    h(Text, { color: "cyan", bold: true }, "☕ "),
    h(Text, { color: "green" }, handle),
    h(Text, { dimColor: true }, " · "),
    middle,
    state.reconnecting ? h(Text, { color: "yellow" }, "  ⟳") : null,
    h(Text, { dimColor: true }, "  ^L expand"),
  );
}
