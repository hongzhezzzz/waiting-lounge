// Big-O Showdown — language label, multi-line code listing, multiple-
// choice complexity buttons. First correct lock wins.
//
// Code is rendered plain (no syntax highlighting) — see Stage 4e if
// the user wants colorized keywords.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { C, B, Key, ROUND_META } from "../../lib/theme.mjs";
import { PhaseHint, LockedLine } from "./_phaseHint.mjs";

export function BigORound({ payload, phase, myAnswer }) {
  const meta = ROUND_META.big_o;
  const code = payload?.code || [];
  const choices = payload?.choices || [];
  const lang = payload?.language || "";

  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Box, null,
      h(Text, { color: C.brand, bold: true }, `${meta.icon} ${meta.title}`),
      lang ? h(Text, { dimColor: true }, `  ·  ${lang}`) : null,
    ),
    h(Text, { dimColor: true }, "Pick the time complexity. First correct lock wins."),

    h(Box, {
      marginTop: 1,
      borderStyle: B.panel,
      borderColor: "gray",
      paddingX: 1,
      paddingY: 0,
      flexDirection: "column",
    },
      ...code.map((line, i) => h(Text, { key: i }, line || " ")),
    ),

    phase === "answer"
      ? (myAnswer
          ? h(LockedLine, null, myAnswer)
          : h(Box, { marginTop: 1, flexWrap: "wrap" },
              ...choices.map((c, i) => h(Box, { key: c, marginRight: 2 },
                h(Key, { label: String(i + 1) }),
                h(Text, null, ` ${c}`),
              )),
            ))
      : h(PhaseHint, { phase }),
  );
}
