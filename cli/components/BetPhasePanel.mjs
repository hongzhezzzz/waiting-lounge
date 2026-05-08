// BetPhasePanel — shows the six bet actions during the bet phase.
//
// Key bindings handled in play.mjs (useInput sees the global key
// stream); this component is purely visual. Disabled tiers (when the
// player can't afford the raise) are dimmed.

import { Box, Text } from "ink";
import { createElement as h } from "react";

const TIERS = [
  { key: "C", label: "Check", choice: "check", cost: 0 },
  { key: "1", label: "+25",   choice: "raise_25", cost: 25 },
  { key: "2", label: "+50",   choice: "raise_50", cost: 50 },
  { key: "3", label: "+100",  choice: "raise_100", cost: 100 },
  { key: "A", label: "All-in", choice: "all_in", cost: -1 },
  { key: "F", label: "Fold",  choice: "fold", cost: 0 },
];

export function BetPhasePanel({ myStack, pot, myBet, secondsLeft }) {
  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Box, null,
      h(Text, { color: "yellow", bold: true }, "Bet phase"),
      h(Text, null, "  "),
      h(Text, { dimColor: true }, `· ${secondsLeft != null ? `${secondsLeft}s left` : "8s window"}`),
    ),
    h(Box, { marginTop: 1 },
      ...TIERS.map((t) => {
        const disabled = t.cost > 0 && myStack < t.cost;
        const isMine = myBet && myBet.type === t.choice;
        const color = isMine ? "green" : disabled ? undefined : "cyan";
        return h(Box, { key: t.key, marginRight: 2 },
          h(Text, { color, dimColor: disabled, bold: isMine },
            `[${t.key}] ${t.label}${isMine ? " ✓" : ""}`,
          ),
        );
      }),
    ),
    myBet ? h(Box, { marginTop: 1 },
      h(Text, { color: "green" }, `Locked: ${myBet.type}${myBet.raise ? ` (${myBet.raise})` : ""}. Waiting for opponent…`),
    ) : null,
  );
}
