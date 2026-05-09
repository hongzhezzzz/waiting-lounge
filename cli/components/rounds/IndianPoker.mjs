// Indian Poker — first fully-rendered round type for terminal play.
//
// Layout: two card boxes side-by-side. Mine is hidden (?), the
// opponent's is shown. During the answer phase, [B]et or [F]old.
//
// Cards are 1–13. Higher card wins (after both bet); both fold = no
// winner; one folds = the other wins.

import { Box, Text } from "ink";
import { createElement as h } from "react";
import { C, B, Key, ROUND_META } from "../../lib/theme.mjs";
import { PhaseHint, LockedLine } from "./_phaseHint.mjs";

const CARD_NAMES = {
  1: "A", 11: "J", 12: "Q", 13: "K",
};
function cardLabel(n) {
  if (n == null) return "?";
  return CARD_NAMES[n] || String(n);
}

export function IndianPokerRound({ payload, phase, myDecision, myHandle, peerHandle }) {
  const meta = ROUND_META.indian_poker;
  const oppCard = payload?.opponentCard;

  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { color: C.brand, bold: true }, `${meta.icon} ${meta.title}`),
    h(Text, { dimColor: true }, "Higher card wins. Both fold → no winner. One folds → the other takes it."),
    h(Box, { marginTop: 1 },
      h(CardBox, { label: "you", value: "?", color: C.brand, handle: myHandle }),
      h(Box, { marginX: 2, justifyContent: "center" },
        h(Text, { dimColor: true }, "vs"),
      ),
      h(CardBox, { label: "opponent", value: cardLabel(oppCard), color: C.peer, handle: peerHandle }),
    ),
    phase === "answer"
      ? (myDecision
          ? h(LockedLine, null, myDecision)
          : h(Box, { marginTop: 1 },
              h(Key, { label: "B" }),
              h(Text, { color: C.brand, bold: true }, " bet"),
              h(Text, { dimColor: true }, "     "),
              h(Key, { label: "F" }),
              h(Text, { color: C.brand, bold: true }, " fold"),
            ))
      : h(PhaseHint, { phase }),
  );
}

function CardBox({ label, value, color, handle }) {
  return h(Box, { flexDirection: "column", alignItems: "center" },
    h(Text, { dimColor: true }, label),
    h(Box, {
      borderStyle: B.strong,
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
