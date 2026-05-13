// Placeholder for round types that don't yet have a TUI renderer.
// Shows the round-type name + payload-dependent prompt so the user
// has SOMETHING to look at, but they can't input an answer in this
// fallback path — the bet phase still works.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { C, B, ROUND_META } from "../../lib/theme.mjs";

export function PlaceholderRound({ roundType, payload, phase }) {
  const meta = ROUND_META[roundType] || { icon: "?", title: roundType };
  const prompt = pickPrompt(roundType, payload);

  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: C.brand, bold: true }, `${meta.icon} ${meta.title}`),
    prompt ? h(Box, {
      marginTop: 1,
      borderStyle: B.panel,
      borderColor: "gray",
      paddingX: 1,
      paddingY: 0,
    },
      h(Text, null, prompt),
    ) : null,
    h(Box, { marginTop: 1 },
      h(Text, { color: C.warning },
        phase === "answer"
          ? "Answer-phase input not yet wired for this round type. The round will time out for you."
          : phase === "bet"
          ? "Bet phase open above — pick a tier."
          : "Reveal in progress — bet phase opens shortly.",
      ),
    ),
  );
}

function pickPrompt(roundType, payload) {
  if (!payload) return null;
  if (roundType === "estimation") return payload.question || null;
  if (roundType === "monty_mirage") return payload.prompt || null;
  if (roundType === "geo_trivia") {
    const choices = (payload.choices || []).map((c, i) => `  [${i + 1}] ${c}`).join("\n");
    return `${payload.prompt || ""}\n${choices}`;
  }
  if (roundType === "big_o") {
    const lang = payload.language ? `(${payload.language}) ` : "";
    const head = `${lang}Pick a complexity:`;
    const choices = (payload.choices || []).map((c, i) => `  [${i + 1}] ${c}`).join("\n");
    const code = (payload.code || []).join("\n");
    return `${head}\n\n${code}\n\n${choices}`;
  }
  if (roundType === "chicken") {
    return "Pick 1–10. Both ≥8 → both bust. Otherwise highest wins.";
  }
  if (roundType === "stock_direction") {
    return "Predict the next 30 minutes — direction (Up/Down) and magnitude (%).";
  }
  return null;
}
