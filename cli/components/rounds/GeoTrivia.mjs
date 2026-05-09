// Geo Trivia — text question, 2–4 multiple-choice answers. First
// correct lock wins.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { C, B, Key, ROUND_META } from "../../lib/theme.mjs";
import { PhaseHint, LockedLine } from "./_phaseHint.mjs";

export function GeoTriviaRound({ payload, phase, myAnswer }) {
  const meta = ROUND_META.geo_trivia;
  const choices = payload?.choices || [];
  const prompt = payload?.prompt || "";

  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: C.brand, bold: true }, `${meta.icon} ${meta.title}`),
    h(Text, { dimColor: true }, "First correct lock wins."),

    prompt ? h(Box, {
      marginTop: 1,
      borderStyle: B.panel,
      borderColor: "gray",
      paddingX: 1,
      paddingY: 0,
    },
      h(Text, null, prompt),
    ) : null,

    phase === "answer"
      ? (myAnswer
          ? h(LockedLine, null, myAnswer)
          : h(Box, { marginTop: 1, flexDirection: "column" },
              ...choices.map((c, i) => h(Box, { key: c },
                h(Text, null, "  "),
                h(Key, { label: String(i + 1) }),
                h(Text, null, ` ${c}`),
              )),
            ))
      : h(PhaseHint, { phase }),
  );
}
