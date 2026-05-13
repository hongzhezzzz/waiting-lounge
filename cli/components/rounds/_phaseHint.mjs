// Shared phase-fallback line shown by every round renderer when the
// active phase isn't the one the renderer's main UI handles.
//
// During the bet phase, the BetPhasePanel handles the "what to press"
// affordance — so the round renderer just shows the question/state
// and a dimmed "answer phase opens after" hint.
//
// During the reveal phase, no input is taken — show "bet phase opens
// shortly" so the user knows a new round is imminent.
//
// During the answer phase, the round renderer's main UI is the input
// widget; this helper isn't used.

import { Box, Text } from "ink";
import { createElement as h } from "react";

export function PhaseHint({ phase }) {
  if (phase === "bet") {
    return h(Box, { marginTop: 1 },
      h(Text, { dimColor: true }, "Place a bet above. Answer phase opens after the bet window closes."),
    );
  }
  if (phase === "reveal") {
    return h(Box, { marginTop: 1 },
      h(Text, { dimColor: true }, "Reveal in progress — the bet phase opens shortly."),
    );
  }
  return null;
}

// LockedLine — consistent "✓ Locked: …" line shown when the player
// has already submitted their answer for this round and is waiting
// for the opponent. Pulled out so every round renderer phrases it
// identically.
export function LockedLine({ children }) {
  return h(Box, { marginTop: 1 },
    h(Text, { color: "green" }, "✓ Locked: ", children, ".  Waiting for opponent."),
  );
}
