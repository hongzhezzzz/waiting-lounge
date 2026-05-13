// MatchEndScreen — winner banner + payout summary, shown after
// game_resolved. Press any key to return to the lobby.
//
// Three flavors:
//   1. Pending: end is null (race between game_resolved socket event
//      and reducer apply). Show "Finalizing match…" so the screen is
//      never blank.
//   2. Resolved: winner banner color-coded (green win, red loss,
//      yellow tie), final chip stacks, settlement line.
//   3. Aborted (end.aborted=true): yellow warning, plain reason,
//      antes-refunded note.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { C, B } from "../lib/theme.mjs";

const ABORT_REASONS = {
  user_requeued: "You or your opponent left the match.",
  settle_failed: "Couldn't settle on the server. Antes refunded.",
  forfeit: "Opponent forfeited (or disconnected).",
};

const RESOLVED_REASONS = {
  rounds_complete: "All rounds played out.",
  bust: "Someone busted (chip stack hit zero).",
  bust_tie: "Both players busted on the same round.",
  forfeit: "Opponent forfeited.",
};

export function MatchEndScreen({ end, mySocketId, myHandle, peerHandle }) {
  if (!end) {
    // Transient state — the resolve event has fired but the reducer
    // hasn't applied state.end yet. Render a placeholder so the
    // screen never goes blank between phases.
    return h(Box, {
      flexDirection: "column",
      borderStyle: B.primary,
      borderColor: "gray",
      paddingX: 2,
      paddingY: 0,
      marginTop: 1,
    },
      h(Text, { color: C.warning, bold: true }, "Finalizing match…"),
      h(Text, { dimColor: true }, "Settling chip flow on the server."),
    );
  }

  // Aborted path — different shape, no chip stacks, antes refunded.
  if (end.aborted) {
    const reason = ABORT_REASONS[end.reason] || end.reason || "Match ended unexpectedly.";
    return h(Box, {
      flexDirection: "column",
      borderStyle: B.strong,
      borderColor: C.warning,
      paddingX: 2,
      paddingY: 0,
      marginTop: 1,
    },
      h(Text, { bold: true, color: C.warning }, "⚠ Match aborted"),
      h(Text, null, reason),
      h(Text, { dimColor: true }, "Antes refunded. No chips at stake."),
    );
  }

  const isWinner = end.winnerSocketId === mySocketId;
  const isTie = end.outcome === "tie";
  const myStack = end.chipStacks?.[mySocketId] ?? 0;
  const peerSocketId = Object.keys(end.chipStacks || {}).find((s) => s !== mySocketId);
  const peerStack = end.chipStacks?.[peerSocketId] ?? 0;

  const titleColor = isWinner ? C.success : isTie ? C.warning : C.danger;
  const titleIcon = isWinner ? "🏆" : isTie ? "🤝" : "🥈";
  const titleText = isWinner ? "You won!" : isTie ? "It's a tie." : `${peerHandle} won.`;

  const payoutLine =
    isWinner ? `+${end.payout} points to your bank` :
    isTie ? "Antes refunded — no points moved" :
    `−${Math.round((end.payout || 0) / 2)} points from your bank`;

  const reasonLabel = RESOLVED_REASONS[end.reason] || end.reason || "";

  return h(Box, {
    flexDirection: "column",
    borderStyle: B.strong,
    borderColor: titleColor,
    paddingX: 2,
    paddingY: 0,
    marginTop: 1,
  },
    h(Text, { bold: true, color: titleColor }, `${titleIcon} ${titleText}`),
    reasonLabel ? h(Text, { dimColor: true }, reasonLabel) : null,
    h(Box, { marginTop: 1, flexDirection: "column" },
      h(Box, null,
        h(Text, { dimColor: true }, "final chips  "),
        h(Text, { color: C.brand, bold: true }, `${myHandle || "you"} ${myStack.toLocaleString("en-US")}`),
        h(Text, { dimColor: true }, "   ·   "),
        h(Text, { color: C.peer, bold: true }, `${peerHandle} ${peerStack.toLocaleString("en-US")}`),
      ),
      h(Text, { color: titleColor }, payoutLine),
    ),
  );
}
