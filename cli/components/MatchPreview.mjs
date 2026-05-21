// Waiting Lounge — MatchPreview (Stage 12b).
//
// Shown after the backend pairs two players (random pool match OR
// hosted-room join). Both sides see the stakes + peer handle and have
// MATCH_PREVIEW_TTL_MS (15 s) to accept or pass. Either side declining
// or timing out returns both to the lobby; a hosted room re-opens.
//
// State machine:
//   "waiting_self" → I haven't accepted yet
//   "waiting_peer" → I accepted, waiting on opponent
//   (terminal states are owned by parent — on game_started or
//    match_preview_cancelled, parent unmounts this scene)

import { createElement as h, useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { C, B, Footer, Key } from "../lib/theme.mjs";

function formatPoints(n) {
  return Number(n).toLocaleString();
}

function gameTypeLabel(t) {
  if (t === "brain_bet") return "Brain Bet";
  if (t === "spot_the_bug") return "Spot the Bug";
  return t;
}

function sourceLabel(source) {
  if (source === "pool") return "matched from the find-match pool";
  if (source === "hosted_room") return "joined via room code";
  if (source === "invite") return "direct invite";
  return source || "";
}

export function MatchPreview({
  preview,            // { previewId, peerHandle, gameType, durationMin, ante, source, expiresAt }
  peerAccepted,       // bool — backend told us they're already in
  selfAccepted,       // bool — we already hit Y
  onAccept,
  onDecline,
}) {
  // Re-render every 250ms while the countdown is ticking. We display
  // whole seconds so the visible value changes once per second, but the
  // higher tick rate avoids feeling stale right at the rollover.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useInput((input, key) => {
    if (selfAccepted) return; // can't change mind after accepting
    if (input === "y" || input === "Y" || key.return) {
      onAccept();
      return;
    }
    if (input === "n" || input === "N" || key.escape) {
      onDecline();
      return;
    }
  });

  const msLeft = Math.max(0, preview.expiresAt - Date.now());
  const secLeft = Math.ceil(msLeft / 1000);
  const urgent = secLeft <= 5;

  const status = selfAccepted
    ? (peerAccepted ? "Starting the match…" : "Waiting on opponent to accept…")
    : (peerAccepted ? "Opponent accepted — your move." : "Pick a side.");

  return h(Box, { flexDirection: "column" },
    h(Box, {
      borderStyle: B.strong,
      borderColor: urgent ? C.danger : C.brand,
      paddingX: 2,
      paddingY: 0,
      flexDirection: "column",
    },
      h(Text, { color: C.brand, bold: true }, "Match found"),
      h(Text, { dimColor: true }, `  ${sourceLabel(preview.source)}`),

      h(Box, { marginTop: 1, flexDirection: "column" },
        h(Text, null,
          h(Text, { dimColor: true }, "vs    "),
          h(Text, { color: C.peer, bold: true }, preview.peerHandle),
        ),
        h(Text, null,
          h(Text, { dimColor: true }, "game  "),
          h(Text, { color: C.brand, bold: true }, gameTypeLabel(preview.gameType)),
        ),
        h(Text, null,
          h(Text, { dimColor: true }, "stake "),
          h(Text, { color: C.success, bold: true }, `${formatPoints(preview.ante)} pts`),
          h(Text, { dimColor: true }, " per round  ·  "),
          h(Text, null, `${preview.durationMin} min match`),
        ),
      ),

      h(Box, { marginTop: 1 },
        h(Text, { color: urgent ? C.danger : C.warning, bold: urgent },
          `${secLeft}s `),
        h(Text, { dimColor: true }, "left to choose"),
      ),

      h(Box, { marginTop: 1 },
        h(Text, null, status),
      ),
    ),

    h(Box, { marginTop: 1 },
      selfAccepted
        ? h(Footer, { items: ["accepted", ["N", " withdraw"]] })
        : h(Footer, { items: [["Y", " accept"], ["N", " pass"]] }),
    ),
  );
}
