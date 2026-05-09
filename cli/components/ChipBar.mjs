// ChipBar — three-column header showing my chips, the pot, and the
// opponent's chips. Visual rhythm: muted column labels above bold,
// colored values. The pot sits between as the focal point in yellow
// (the "money in play" semantic).

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { C, B } from "../lib/theme.mjs";

export function ChipBar({ myHandle, myChips, peerHandle, peerChips, pot }) {
  return h(Box, {
    borderStyle: B.primary,
    borderColor: "gray",
    paddingX: 2,
    paddingY: 0,
    justifyContent: "space-between",
  },
    h(Box, { flexDirection: "column" },
      h(Text, { dimColor: true }, "you"),
      h(Box, null,
        h(Text, { color: C.brand, bold: true }, myHandle || "you"),
        h(Text, { dimColor: true }, "  "),
        h(Text, { color: C.success, bold: true }, formatChips(myChips)),
      ),
    ),
    h(Box, { flexDirection: "column", alignItems: "center" },
      h(Text, { dimColor: true }, "pot"),
      h(Text, { color: C.warning, bold: true }, formatChips(pot)),
    ),
    h(Box, { flexDirection: "column", alignItems: "flex-end" },
      h(Text, { dimColor: true }, "opponent"),
      h(Box, null,
        h(Text, { color: C.peer, bold: true }, peerHandle || "opponent"),
        h(Text, { dimColor: true }, "  "),
        h(Text, { color: C.peer, bold: true }, formatChips(peerChips)),
      ),
    ),
  );
}

// Compact display: 1280 → "1,280" so big stacks scan instantly.
// Falls back to as-is for non-numbers.
function formatChips(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return String(n ?? 0);
  return n.toLocaleString("en-US");
}
