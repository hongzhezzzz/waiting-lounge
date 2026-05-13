// BetPhasePanel — the six bet actions during the bet phase. Layout:
//   Section header line: "🎰 Bet phase  ·  <Ns left>"
//   Action row:           [C] check   [1] +25   [2] +50   [3] +100   [A] all-in   [F] fold
//   Lock confirmation:    "✓ Locked: …  Waiting for opponent."
//
// Disabled tiers (player's stack < tier cost) are dimmed so the eye
// doesn't land on unaffordable choices.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { C } from "../lib/theme.mjs";
import { Key } from "../lib/theme.mjs";

const TIERS = [
  { key: "C", label: "check",   choice: "check",     cost: 0 },
  { key: "1", label: "+25",     choice: "raise_25",  cost: 25 },
  { key: "2", label: "+50",     choice: "raise_50",  cost: 50 },
  { key: "3", label: "+100",    choice: "raise_100", cost: 100 },
  { key: "A", label: "all-in",  choice: "all_in",    cost: -1 },
  { key: "F", label: "fold",    choice: "fold",      cost: 0 },
];

export function BetPhasePanel({ myStack, myBet, secondsLeft }) {
  const urgent = typeof secondsLeft === "number" && secondsLeft <= 3;
  const timerColor = urgent ? C.danger : C.warning;

  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Box, null,
      h(Text, { color: C.warning, bold: true }, "🎰 Bet phase"),
      h(Text, { dimColor: true }, "  ·  "),
      h(Text, { color: timerColor, bold: urgent },
        secondsLeft != null ? `${secondsLeft}s left` : "8s window",
      ),
    ),
    h(Box, { marginTop: 1 },
      ...TIERS.map((t) => {
        const disabled = t.cost > 0 && myStack < t.cost;
        const isMine = myBet && myBet.type === t.choice;
        return h(Box, { key: t.key, marginRight: 3 },
          h(Key, { label: t.key, disabled, locked: isMine }),
          h(Text, {
            color: isMine ? C.success : disabled ? undefined : undefined,
            dimColor: disabled,
            bold: isMine,
          }, ` ${t.label}${isMine ? " ✓" : ""}`),
        );
      }),
    ),
    myBet ? h(Box, { marginTop: 1 },
      h(Text, { color: C.success },
        `✓ Locked: ${formatBet(myBet)}.  Waiting for opponent.`,
      ),
    ) : null,
  );
}

function formatBet(myBet) {
  if (!myBet) return "—";
  const tier = TIERS.find((t) => t.choice === myBet.type);
  if (tier) return tier.label;
  if (myBet.raise) return `raise ${myBet.raise}`;
  return myBet.type;
}
