// ChipBar — three-column header showing my chips, the pot, and the
// opponent's chips. Mirrors web/src/components/games/BrainBetRound.tsx.

import { Box, Text } from "ink";
import { createElement as h } from "react";

export function ChipBar({ myHandle, myChips, peerHandle, peerChips, pot }) {
  return h(Box, {
    borderStyle: "round",
    borderColor: "gray",
    paddingX: 1,
    justifyContent: "space-between",
  },
    h(Box, { flexDirection: "column" },
      h(Text, { dimColor: true }, "you"),
      h(Text, { color: "cyan", bold: true }, `${myHandle}  ${myChips}`),
    ),
    h(Box, { flexDirection: "column", alignItems: "center" },
      h(Text, { dimColor: true }, "pot"),
      h(Text, { color: "yellow", bold: true }, String(pot)),
    ),
    h(Box, { flexDirection: "column", alignItems: "flex-end" },
      h(Text, { dimColor: true }, "opponent"),
      h(Text, { color: "magenta", bold: true }, `${peerHandle}  ${peerChips}`),
    ),
  );
}
