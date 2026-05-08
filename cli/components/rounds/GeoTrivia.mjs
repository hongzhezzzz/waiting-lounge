// Geo Trivia — text question, 2–4 multiple-choice answers. First
// correct lock wins.

import { Box, Text } from "ink";
import { createElement as h } from "react";

export function GeoTriviaRound({ payload, phase, myAnswer }) {
  const choices = payload?.choices || [];
  const prompt = payload?.prompt || "";

  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: "cyan", bold: true }, "🌍 Geo Trivia"),
    prompt
      ? h(Box, {
          marginTop: 1,
          borderStyle: "single",
          borderColor: "gray",
          paddingX: 1,
          paddingY: 0,
        },
          h(Text, null, prompt),
        )
      : null,

    phase === "answer"
      ? h(Box, { marginTop: 1, flexDirection: "column" },
          h(Text, { color: "yellow", bold: true }, "Pick:"),
          h(Box, { marginTop: 1, flexDirection: "column" },
            ...choices.map((c, i) => {
              const isMine = myAnswer === c;
              return h(Box, { key: c },
                h(Text, { color: isMine ? "green" : "cyan", bold: isMine },
                  `  [${i + 1}] ${c}${isMine ? " ✓" : ""}`,
                ),
              );
            }),
          ),
          myAnswer
            ? h(Text, { color: "green" }, `Locked: ${myAnswer}. Waiting…`)
            : null,
        )
      : phase === "bet"
      ? h(Box, { marginTop: 1 },
          h(Text, { dimColor: true }, "Bet phase open above; answer phase opens after."),
        )
      : h(Box, { marginTop: 1 },
          h(Text, { dimColor: true }, "Reveal phase — bet phase opens shortly."),
        ),
  );
}
