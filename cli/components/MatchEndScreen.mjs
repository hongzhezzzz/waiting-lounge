// MatchEndScreen — winner banner + payout summary, shown after
// game_resolved. Press any key to return to the lobby.

import { Box, Text } from "ink";
import { createElement as h } from "react";

export function MatchEndScreen({ end, mySocketId, myHandle, peerHandle }) {
  if (!end) return null;

  const isWinner = end.winnerSocketId === mySocketId;
  const isTie = end.outcome === "tie";
  const myStack = end.chipStacks?.[mySocketId] ?? 0;
  const peerSocketId = Object.keys(end.chipStacks || {}).find((s) => s !== mySocketId);
  const peerStack = end.chipStacks?.[peerSocketId] ?? 0;

  const titleColor = isWinner ? "green" : isTie ? "yellow" : "red";
  const titleText = isWinner ? "You won!" : isTie ? "Tie." : `${peerHandle} won.`;

  const payoutLine =
    isWinner ? `+${end.payout} points` :
    isTie ? `Antes refunded.` :
    `−${end.payout / 2} points`;

  const reasonLabel = {
    rounds_complete: "Rounds complete.",
    bust: "Opponent busted (or you did).",
    bust_tie: "Both busted.",
    forfeit: "Opponent forfeited.",
  }[end.reason] || end.reason;

  return h(Box, {
    flexDirection: "column",
    borderStyle: "double",
    borderColor: titleColor,
    paddingX: 2,
    paddingY: 0,
    marginTop: 1,
  },
    h(Text, { bold: true, color: titleColor }, titleText),
    h(Text, { dimColor: true }, reasonLabel),
    h(Box, { marginTop: 1, flexDirection: "column" },
      h(Text, null, `Final chips — you: ${myStack}, ${peerHandle}: ${peerStack}`),
      h(Text, null, `Settlement: ${payoutLine}`),
    ),
    h(Box, { marginTop: 1 },
      h(Text, { dimColor: true }, "Press any key to return to the lobby."),
    ),
  );
}
