// RevealCard — post-resolve display. Shows the round's truth, both
// players' submissions, and a chip-flow line. Mirrors the browser's
// per-round-type reveal blocks in BrainBetRound.tsx.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { sparkline } from "../lib/sparkline.mjs";

export function RevealCard({ resolved, mySocketId, peerSocketId, myHandle, peerHandle }) {
  if (!resolved) return null;
  const { roundType, reveal, chipDelta, winnerSocketId } = resolved;

  const myDelta = chipDelta?.[mySocketId] ?? 0;
  const peerDelta = chipDelta?.[peerSocketId] ?? 0;

  let header;
  if (winnerSocketId === mySocketId) {
    header = h(Text, { color: "green", bold: true }, `You won ${myDelta > 0 ? `+${myDelta}` : myDelta}`);
  } else if (winnerSocketId === peerSocketId) {
    header = h(Text, { color: "red" }, `${peerHandle} won (${peerDelta > 0 ? `+${peerDelta}` : peerDelta})`);
  } else {
    header = h(Text, { color: "yellow" }, "No winner this round.");
  }

  const body = renderReveal(roundType, reveal, mySocketId, peerSocketId);

  return h(Box, {
    flexDirection: "column",
    borderStyle: "round",
    borderColor: winnerSocketId === mySocketId ? "green" : winnerSocketId === peerSocketId ? "red" : "yellow",
    paddingX: 1,
    marginTop: 1,
  },
    header,
    body,
  );
}

function renderReveal(roundType, reveal, mySocketId, peerSocketId) {
  if (!reveal) return null;

  if (roundType === "indian_poker") {
    const myCard = reveal.cards?.[mySocketId];
    const peerCard = reveal.cards?.[peerSocketId];
    const myDecision = reveal.decisions?.[mySocketId];
    const peerDecision = reveal.decisions?.[peerSocketId];
    return h(Box, { flexDirection: "column" },
      h(Text, null, `Cards — yours: ${myCard ?? "?"}, opponent's: ${peerCard ?? "?"}`),
      h(Text, { dimColor: true }, `Decisions — you: ${myDecision || "—"}, opponent: ${peerDecision || "—"}`),
    );
  }

  if (roundType === "estimation" || roundType === "monty_mirage") {
    const mySub = reveal.submissions?.[mySocketId];
    const peerSub = reveal.submissions?.[peerSocketId];
    return h(Box, { flexDirection: "column" },
      h(Text, null, `Truth: ${reveal.answer}`),
      h(Text, null, `You: ${mySub ?? "—"}  ·  Opponent: ${peerSub ?? "—"}`),
      reveal.explanation ? h(Text, { dimColor: true }, reveal.explanation) : null,
    );
  }

  if (roundType === "chicken") {
    const myPick = reveal.picks?.[mySocketId];
    const peerPick = reveal.picks?.[peerSocketId];
    return h(Box, { flexDirection: "column" },
      h(Text, null, `Picks — you: ${myPick ?? "—"}, opponent: ${peerPick ?? "—"}`),
      reveal.bust ? h(Text, { color: "red" }, "Both bust (≥8 each).") : null,
    );
  }

  if (roundType === "big_o" || roundType === "geo_trivia") {
    const mLock = reveal.locks?.[mySocketId];
    const pLock = reveal.locks?.[peerSocketId];
    return h(Box, { flexDirection: "column" },
      h(Text, null, `Answer: ${reveal.answer}`),
      h(Text, null, `Your lock: ${mLock ?? "—"}  ·  Opponent: ${pLock ?? "—"}`),
      reveal.explanation ? h(Text, { dimColor: true }, reveal.explanation) : null,
    );
  }

  if (roundType === "stock_direction") {
    const mySub = reveal.submissions?.[mySocketId];
    const peerSub = reveal.submissions?.[peerSocketId];
    const fmtSub = (s) => s ? `${s.direction === "up" ? "↑" : "↓"} ${s.magnitude}%` : "—";
    // Concatenate visible + hidden prices into the full 60-bar line.
    // visiblePrices isn't on the reveal payload — only hiddenPrices is.
    // The full line still works with just hidden prices (the "next 30 min").
    const fullLine = sparkline(reveal.hiddenPrices || []);
    return h(Box, { flexDirection: "column" },
      fullLine
        ? h(Text, { color: "yellow" }, `Next 30 min: ${fullLine}`)
        : null,
      h(Text, null,
        `Truth: ${reveal.answerDirection === "up" ? "↑" : "↓"} ${reveal.answerMagnitude}%`,
      ),
      h(Text, null, `You: ${fmtSub(mySub)}  ·  Opponent: ${fmtSub(peerSub)}`),
      reveal.explanation ? h(Text, { dimColor: true }, reveal.explanation) : null,
    );
  }

  return null;
}
