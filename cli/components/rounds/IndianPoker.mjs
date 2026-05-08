// Indian Poker — first fully-rendered round type for terminal play.
//
// Layout: two card boxes side-by-side. Mine is hidden (?), the
// opponent's is shown. During the answer phase, [B]et or [F]old.
//
// Cards are 1–13. Higher card wins (after both bet); both fold = no
// winner; one folds = the other wins.

import { Box, Text } from "ink";
import { createElement as h } from "react";

const CARD_NAMES = {
  1: "A", 11: "J", 12: "Q", 13: "K",
};
function cardLabel(n) {
  if (n == null) return "?";
  return CARD_NAMES[n] || String(n);
}

export function IndianPokerRound({ payload, phase, myDecision, myHandle, peerHandle }) {
  const oppCard = payload?.opponentCard;

  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: "cyan", bold: true }, "🃏 Indian Poker"),
    h(Box, { marginTop: 1 },
      h(CardBox, { label: "you", value: "?", color: "cyan", handle: myHandle }),
      h(Box, { marginX: 2 },
        h(Text, { dimColor: true }, "vs"),
      ),
      h(CardBox, { label: "opponent", value: cardLabel(oppCard), color: "magenta", handle: peerHandle }),
    ),
    phase === "answer" ? h(Box, { marginTop: 1, flexDirection: "column" },
      h(Text, { color: "yellow", bold: true }, "Decide:"),
      h(Box, null,
        h(Text, { color: myDecision === "bet" ? "green" : "cyan", bold: myDecision === "bet" }, `[B] Bet${myDecision === "bet" ? " ✓" : ""}`),
        h(Text, null, "    "),
        h(Text, { color: myDecision === "fold" ? "green" : "cyan", bold: myDecision === "fold" }, `[F] Fold${myDecision === "fold" ? " ✓" : ""}`),
      ),
      myDecision ? h(Text, { color: "green" }, `Locked: ${myDecision}. Waiting for opponent…`) : null,
    ) : phase === "reveal" ? h(Text, { dimColor: true, italic: true }, "Reveal phase — bet phase opens shortly.") : null,
  );
}

function CardBox({ label, value, color, handle }) {
  return h(Box, { flexDirection: "column", alignItems: "center" },
    h(Text, { dimColor: true }, label),
    h(Box, {
      borderStyle: "double",
      borderColor: color,
      paddingX: 2,
      paddingY: 0,
      width: 7,
      justifyContent: "center",
    },
      h(Text, { bold: true, color }, value),
    ),
    h(Text, { dimColor: true }, handle || ""),
  );
}
