// MatchEndScreen — winner banner + payout summary, shown after
// game_resolved. Press any key to return to the lobby.
//
// Two flavors:
//   - Normal end (game_resolved): winner banner, chip totals,
//     settlement (+/− points or refunded antes for bot match).
//   - Aborted (game_aborted, marked with end.aborted=true): yellow
//     warning, plain reason, antes-refunded note. Antes are always
//     refunded on abort (server-side); chip stacks aren't included
//     in the abort payload, so we only show the reason.

import { Box, Text } from "ink";
import { createElement as h } from "react";

const ABORT_REASONS = {
  user_requeued: "You or your opponent left the match.",
  settle_failed: "Couldn't settle on the server. Antes refunded.",
  forfeit: "Opponent forfeited (or disconnected).",
};

const RESOLVED_REASONS = {
  rounds_complete: "Rounds complete.",
  bust: "Someone busted (chip stack hit zero).",
  bust_tie: "Both busted on the same round.",
  forfeit: "Opponent forfeited.",
};

export function MatchEndScreen({ end, mySocketId, myHandle, peerHandle }) {
  if (!end) return null;

  // Aborted path — different shape, no chip stacks, antes refunded.
  if (end.aborted) {
    const reason = ABORT_REASONS[end.reason] || end.reason || "Match ended unexpectedly.";
    return h(Box, {
      flexDirection: "column",
      borderStyle: "double",
      borderColor: "yellow",
      paddingX: 2,
      paddingY: 0,
      marginTop: 1,
    },
      h(Text, { bold: true, color: "yellow" }, "Match aborted"),
      h(Text, null, reason),
      h(Text, { dimColor: true }, "Antes refunded. No chips at stake."),
      h(Box, { marginTop: 1 },
        h(Text, { dimColor: true }, "Press any key to return to the lobby."),
      ),
    );
  }

  const isWinner = end.winnerSocketId === mySocketId;
  const isTie = end.outcome === "tie";
  const myStack = end.chipStacks?.[mySocketId] ?? 0;
  const peerSocketId = Object.keys(end.chipStacks || {}).find((s) => s !== mySocketId);
  const peerStack = end.chipStacks?.[peerSocketId] ?? 0;

  const titleColor = isWinner ? "green" : isTie ? "yellow" : "red";
  const titleText = isWinner ? "You won!" : isTie ? "Tie." : `${peerHandle} won.`;

  const payoutLine =
    isWinner ? `+${end.payout} points` :
    isTie ? "Antes refunded." :
    `−${Math.round((end.payout || 0) / 2)} points`;

  const reasonLabel = RESOLVED_REASONS[end.reason] || end.reason;

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
