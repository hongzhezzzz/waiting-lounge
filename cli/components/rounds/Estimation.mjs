// Estimation round — text question, integer/float guess via numeric
// input. Lower distance-to-truth wins (server-side scoring).

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { C, B, ROUND_META } from "../../lib/theme.mjs";
import { PhaseHint, LockedLine } from "./_phaseHint.mjs";

export function EstimationRound({ payload, phase, numericInput, myAnswer }) {
  const meta = ROUND_META.estimation;
  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: C.brand, bold: true }, `${meta.icon} ${meta.title}`),
    h(Text, { dimColor: true }, "Closer to the truth wins."),

    payload?.question ? h(Box, {
      marginTop: 1,
      borderStyle: B.panel,
      borderColor: "gray",
      paddingX: 1,
      paddingY: 0,
    },
      h(Text, null, payload.question),
    ) : null,

    phase === "answer"
      ? (myAnswer != null
          ? h(LockedLine, null, String(myAnswer))
          : h(Box, { marginTop: 1 },
              h(Text, null, "your guess  "),
              h(Text, { color: C.warning, bold: true }, numericInput || "_"),
              h(Text, { dimColor: true }, "  digits + Enter"),
            ))
      : h(PhaseHint, { phase }),
  );
}
