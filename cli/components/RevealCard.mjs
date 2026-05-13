// RevealCard — post-resolve display. Shows the round's truth, both
// players' submissions, and a chip-flow line. Border color matches
// outcome (green win, red loss, yellow tie).

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { sparkline } from "../lib/sparkline.mjs";
import { C, B } from "../lib/theme.mjs";

export function RevealCard({ resolved, mySocketId, peerSocketId, myHandle, peerHandle }) {
  if (!resolved) return null;
  const { roundType, reveal, chipDelta, winnerSocketId } = resolved;

  const myDelta = chipDelta?.[mySocketId] ?? 0;
  const peerDelta = chipDelta?.[peerSocketId] ?? 0;

  let header;
  let borderColor;
  if (winnerSocketId === mySocketId) {
    borderColor = C.success;
    header = h(Text, { color: C.success, bold: true }, `🏆 You won  ${fmtDelta(myDelta)} chips`);
  } else if (winnerSocketId === peerSocketId) {
    borderColor = C.danger;
    header = h(Text, { color: C.danger, bold: true }, `🥈 ${peerHandle || "opponent"} won  ${fmtDelta(peerDelta)} chips`);
  } else {
    borderColor = C.warning;
    header = h(Text, { color: C.warning, bold: true }, "🤝 No winner this round");
  }

  const body = renderReveal(roundType, reveal, mySocketId, peerSocketId, myHandle, peerHandle);

  return h(Box, {
    flexDirection: "column",
    borderStyle: B.primary,
    borderColor,
    paddingX: 2,
    paddingY: 0,
    marginTop: 1,
  },
    header,
    body,
  );
}

function fmtDelta(d) {
  if (d > 0) return `+${d}`;
  if (d < 0) return String(d);
  return "±0";
}

function renderReveal(roundType, reveal, mySocketId, peerSocketId, myHandle, peerHandle) {
  if (!reveal) return null;
  const me = myHandle || "you";
  const opp = peerHandle || "opponent";

  if (roundType === "indian_poker") {
    const myCard = reveal.cards?.[mySocketId];
    const peerCard = reveal.cards?.[peerSocketId];
    const myDecision = reveal.decisions?.[mySocketId];
    const peerDecision = reveal.decisions?.[peerSocketId];
    return h(Box, { flexDirection: "column" },
      h(Box, null,
        h(Text, { dimColor: true }, "cards  "),
        h(Text, { color: C.brand, bold: true }, `${me} ${myCard ?? "?"}`),
        h(Text, { dimColor: true }, "   ·   "),
        h(Text, { color: C.peer, bold: true }, `${opp} ${peerCard ?? "?"}`),
      ),
      h(Box, null,
        h(Text, { dimColor: true }, `decisions  ${me} ${myDecision || "—"}   ·   ${opp} ${peerDecision || "—"}`),
      ),
    );
  }

  if (roundType === "estimation" || roundType === "monty_mirage") {
    const mySub = reveal.submissions?.[mySocketId];
    const peerSub = reveal.submissions?.[peerSocketId];
    const suffix = roundType === "monty_mirage" ? "%" : "";
    return h(Box, { flexDirection: "column" },
      h(Box, null,
        h(Text, { dimColor: true }, "truth  "),
        h(Text, { color: C.warning, bold: true }, `${reveal.answer}${suffix}`),
      ),
      h(Box, null,
        h(Text, { dimColor: true }, "guesses  "),
        h(Text, { color: C.brand }, `${me} ${mySub ?? "—"}${suffix}`),
        h(Text, { dimColor: true }, "   ·   "),
        h(Text, { color: C.peer }, `${opp} ${peerSub ?? "—"}${suffix}`),
      ),
      reveal.explanation ? h(Text, { dimColor: true }, reveal.explanation) : null,
    );
  }

  if (roundType === "chicken") {
    const myPick = reveal.picks?.[mySocketId];
    const peerPick = reveal.picks?.[peerSocketId];
    return h(Box, { flexDirection: "column" },
      h(Box, null,
        h(Text, { dimColor: true }, "picks  "),
        h(Text, { color: C.brand, bold: true }, `${me} ${myPick ?? "—"}`),
        h(Text, { dimColor: true }, "   ·   "),
        h(Text, { color: C.peer, bold: true }, `${opp} ${peerPick ?? "—"}`),
      ),
      reveal.bust ? h(Text, { color: C.danger }, "Both bust (≥8 each)") : null,
    );
  }

  if (roundType === "big_o" || roundType === "geo_trivia") {
    const mLock = reveal.locks?.[mySocketId];
    const pLock = reveal.locks?.[peerSocketId];
    return h(Box, { flexDirection: "column" },
      h(Box, null,
        h(Text, { dimColor: true }, "answer  "),
        h(Text, { color: C.warning, bold: true }, String(reveal.answer)),
      ),
      h(Box, null,
        h(Text, { dimColor: true }, "locks  "),
        h(Text, { color: C.brand }, `${me} ${mLock ?? "—"}`),
        h(Text, { dimColor: true }, "   ·   "),
        h(Text, { color: C.peer }, `${opp} ${pLock ?? "—"}`),
      ),
      reveal.explanation ? h(Text, { dimColor: true }, reveal.explanation) : null,
    );
  }

  if (roundType === "stock_direction") {
    const mySub = reveal.submissions?.[mySocketId];
    const peerSub = reveal.submissions?.[peerSocketId];
    const fmtSub = (s) => s ? `${s.direction === "up" ? "↑" : "↓"} ${s.magnitude}%` : "—";
    const fullLine = sparkline(reveal.hiddenPrices || []);
    return h(Box, { flexDirection: "column" },
      fullLine ? h(Box, null,
        h(Text, { dimColor: true }, "next 30 min  "),
        h(Text, { color: C.warning }, fullLine),
      ) : null,
      h(Box, null,
        h(Text, { dimColor: true }, "truth  "),
        h(Text, { color: C.warning, bold: true },
          `${reveal.answerDirection === "up" ? "↑" : "↓"} ${reveal.answerMagnitude}%`,
        ),
      ),
      h(Box, null,
        h(Text, { dimColor: true }, "guesses  "),
        h(Text, { color: C.brand }, `${me} ${fmtSub(mySub)}`),
        h(Text, { dimColor: true }, "   ·   "),
        h(Text, { color: C.peer }, `${opp} ${fmtSub(peerSub)}`),
      ),
      reveal.explanation ? h(Text, { dimColor: true }, reveal.explanation) : null,
    );
  }

  return null;
}
