// Monty Mirage round — probability puzzle (often Monty Hall variant).
// Guess 0–100 (%). Lower distance-to-truth wins.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { C, B, ROUND_META } from "../../lib/theme.mjs";
import { PhaseHint, LockedLine } from "./_phaseHint.mjs";

export function MontyMirageRound({ payload, phase, numericInput, myAnswer }) {
  const meta = ROUND_META.monty_mirage;
  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: C.brand, bold: true }, `${meta.icon} ${meta.title}`),
    h(Text, { dimColor: true }, "Probability puzzle. Closer to the truth wins."),

    payload?.prompt ? h(Box, {
      marginTop: 1,
      borderStyle: B.panel,
      borderColor: "gray",
      paddingX: 1,
      paddingY: 0,
    },
      h(Text, null, payload.prompt),
    ) : null,

    phase === "answer"
      ? (myAnswer != null
          ? h(LockedLine, null, `${myAnswer}%`)
          : h(Box, { marginTop: 1 },
              h(Text, null, "probability  "),
              h(Text, { color: C.warning, bold: true }, numericInput || "_"),
              h(Text, { dimColor: true }, "%  digits 0–100 + Enter"),
            ))
      : h(PhaseHint, { phase }),
  );
}
