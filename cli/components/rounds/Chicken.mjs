// Chicken Numbers — pick 1–10. Both ≥8 → both bust (no winner).
// Otherwise highest pick wins.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { C, Key, ROUND_META } from "../../lib/theme.mjs";
import { PhaseHint, LockedLine } from "./_phaseHint.mjs";

export function ChickenRound({ phase, myAnswer }) {
  const meta = ROUND_META.chicken;
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: C.brand, bold: true }, `${meta.icon} ${meta.title}`),
    h(Text, { dimColor: true }, "Both pick ≥8 → both bust (no winner). Otherwise highest wins."),

    phase === "answer"
      ? (myAnswer != null
          ? h(LockedLine, null, String(myAnswer))
          : h(Box, { marginTop: 1 },
              ...numbers.map((n) => {
                const keyLabel = n === 10 ? "0" : String(n);
                return h(Box, { key: n, marginRight: 2 },
                  h(Key, { label: keyLabel }),
                  h(Text, null, ` ${n}`),
                );
              }),
            ))
      : h(PhaseHint, { phase }),
  );
}
