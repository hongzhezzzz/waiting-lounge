// Chicken Numbers — pick 1–10. Both ≥8 → both bust (no winner).
// Otherwise highest pick wins.

import { Box, Text } from "ink";
import { createElement as h } from "react";

export function ChickenRound({ phase, myAnswer }) {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: "cyan", bold: true }, "🐔 Chicken Numbers"),
    h(Text, { dimColor: true }, "Both ≥8 = both bust. Otherwise highest wins."),

    phase === "answer"
      ? (myAnswer != null
          ? h(Box, { marginTop: 1 },
              h(Text, { color: "green" }, `Locked: ${myAnswer}. Waiting for opponent…`),
            )
          : h(Box, { marginTop: 1 },
              ...numbers.map((n) => {
                const key = n === 10 ? "0" : String(n);
                return h(Box, { key: n, marginRight: 2 },
                  h(Text, { color: "cyan" }, `[${key}] ${n}`),
                );
              }),
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
