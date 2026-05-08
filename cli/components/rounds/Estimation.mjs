// Estimation round — text question, integer/float guess via numeric
// input. Lower distance-to-truth wins (server-side scoring).

import { Box, Text } from "ink";
import { createElement as h } from "react";

export function EstimationRound({ payload, phase, numericInput, myAnswer }) {
  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: "cyan", bold: true }, "📊 Estimation"),
    payload?.question
      ? h(Box, {
          marginTop: 1,
          borderStyle: "single",
          borderColor: "gray",
          paddingX: 1,
          paddingY: 0,
        },
          h(Text, null, payload.question),
        )
      : null,

    phase === "answer"
      ? (myAnswer != null
          ? h(Box, { marginTop: 1 },
              h(Text, { color: "green" }, `Locked: ${myAnswer}. Waiting for opponent…`),
            )
          : h(Box, { marginTop: 1 },
              h(Text, null, "Your guess: "),
              h(Text, { color: "yellow", bold: true }, numericInput || "_"),
              h(Text, { dimColor: true }, "  (digits + Enter)"),
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
