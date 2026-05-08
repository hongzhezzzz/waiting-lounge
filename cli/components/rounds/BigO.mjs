// Big-O Showdown — language label, multi-line code listing, multiple-
// choice complexity buttons. First correct lock wins.
//
// Code is rendered plain (no syntax highlighting) — see Stage 4e if
// the user wants colorized keywords.

import { Box, Text } from "ink";
import { createElement as h } from "react";

export function BigORound({ payload, phase, myAnswer }) {
  const code = payload?.code || [];
  const choices = payload?.choices || [];
  const lang = payload?.language || "";

  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Box, null,
      h(Text, { color: "cyan", bold: true }, "⚙ Big-O"),
      lang ? h(Text, { dimColor: true }, `  · ${lang}`) : null,
    ),
    h(Box, {
      marginTop: 1,
      borderStyle: "single",
      borderColor: "gray",
      paddingX: 1,
      paddingY: 0,
      flexDirection: "column",
    },
      ...code.map((line, i) =>
        h(Text, { key: i, color: "white" }, line || " "),
      ),
    ),

    phase === "answer"
      ? h(Box, { marginTop: 1, flexDirection: "column" },
          h(Text, { color: "yellow", bold: true }, "Pick complexity:"),
          h(Box, { marginTop: 1, flexWrap: "wrap" },
            ...choices.map((c, i) => {
              const isMine = myAnswer === c;
              return h(Box, { key: c, marginRight: 2 },
                h(Text, { color: isMine ? "green" : "cyan", bold: isMine },
                  `[${i + 1}] ${c}${isMine ? " ✓" : ""}`,
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
