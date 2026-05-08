// Monty Mirage round — probability puzzle (often Monty Hall variant).
// Guess 0–100 (%). Lower distance-to-truth wins.

import { Box, Text } from "ink";
import { createElement as h } from "react";

export function MontyMirageRound({ payload, phase, numericInput, myAnswer }) {
  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: "cyan", bold: true }, "🎲 Monty Mirage"),
    payload?.prompt
      ? h(Box, {
          marginTop: 1,
          borderStyle: "single",
          borderColor: "gray",
          paddingX: 1,
          paddingY: 0,
        },
          h(Text, null, payload.prompt),
        )
      : null,

    phase === "answer"
      ? (myAnswer != null
          ? h(Box, { marginTop: 1 },
              h(Text, { color: "green" }, `Locked: ${myAnswer}%. Waiting for opponent…`),
            )
          : h(Box, { marginTop: 1 },
              h(Text, null, "Probability: "),
              h(Text, { color: "yellow", bold: true }, numericInput || "_"),
              h(Text, { dimColor: true }, "% (digits 0–100 + Enter)"),
            ))
      : phase === "bet"
      ? h(Box, { marginTop: 1 },
          h(Text, { dimColor: true }, "Bet phase open above; answer phase opens after."),
        )
      : h(Box, { marginTop: 1 },
          h(Text, { dimColor: true }, "Reveal phase — bet phase opens shortly."),
        ),
  );
}
