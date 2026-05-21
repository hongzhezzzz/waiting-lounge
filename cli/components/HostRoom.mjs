// Waiting Lounge — HostRoom (Stage 12b).
//
// Two-phase component:
//
//   1. configure — pick ante (preset list), duration (1/5/10 min),
//                  visibility (public/private). Enter opens the room.
//   2. hosting   — show the 6-char code (big), waiting line, settings
//                  summary, and a hint to share the code. [C] cancels
//                  the room and returns to the lobby. [Q]/Esc also.
//
// The parent (play.mjs) drives the transition by setting `hostedRoom`
// once the backend echoes `room_created`. If the parent receives a
// `match_preview` it switches the entire app phase out to "preview" —
// HostRoom unmounts cleanly.

import { createElement as h, useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { C, B, Footer, Key } from "../lib/theme.mjs";

const ANTE_PRESETS = [25, 50, 100, 250, 500];
const DURATION_OPTIONS = [1, 5, 10];

function formatPoints(n) {
  return n.toLocaleString();
}

export function HostRoom({ hostedRoom, onCreate, onCancel, onCancelRoom, onBack }) {
  const [phase, setPhase] = useState(hostedRoom ? "hosting" : "configure");
  const [anteIdx, setAnteIdx] = useState(2); // default 100
  const [durationIdx, setDurationIdx] = useState(1); // default 5 min
  const [visibility, setVisibility] = useState("public");
  // Allow either the configure or hosting "row" to be focused. In
  // configure mode, the user moves between ante / duration / visibility
  // rows with up/down; left/right adjusts the focused row. Default to
  // ante (row 0).
  const [focusRow, setFocusRow] = useState(0); // 0 ante · 1 duration · 2 visibility

  // Parent flips us into "hosting" once room_created lands. We also
  // immediately reflect a parent-side cancel by going back to configure.
  useEffect(() => {
    if (hostedRoom) setPhase("hosting");
    else if (phase === "hosting") setPhase("configure");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostedRoom?.code]);

  useInput((input, key) => {
    if (phase === "hosting") {
      if (input === "c" || input === "C") {
        onCancelRoom();
        return;
      }
      if (input === "q" || input === "Q" || key.escape) {
        onCancelRoom();
        // onCancelRoom triggers a backend round-trip; the parent will
        // eventually navigate. For snappier UX we also pop back now.
        onBack();
        return;
      }
      return;
    }
    // configure phase
    if (input === "q" || input === "Q" || key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onCreate({
        gameType: "brain_bet",
        ante: ANTE_PRESETS[anteIdx],
        durationMin: DURATION_OPTIONS[durationIdx],
        visibility,
      });
      return;
    }
    if (key.upArrow) {
      setFocusRow((r) => (r + 2) % 3); // wrap up
      return;
    }
    if (key.downArrow) {
      setFocusRow((r) => (r + 1) % 3);
      return;
    }
    if (key.leftArrow) {
      if (focusRow === 0) setAnteIdx((i) => (i + ANTE_PRESETS.length - 1) % ANTE_PRESETS.length);
      else if (focusRow === 1) setDurationIdx((i) => (i + DURATION_OPTIONS.length - 1) % DURATION_OPTIONS.length);
      else setVisibility((v) => (v === "public" ? "private" : "public"));
      return;
    }
    if (key.rightArrow) {
      if (focusRow === 0) setAnteIdx((i) => (i + 1) % ANTE_PRESETS.length);
      else if (focusRow === 1) setDurationIdx((i) => (i + 1) % DURATION_OPTIONS.length);
      else setVisibility((v) => (v === "public" ? "private" : "public"));
      return;
    }
    if (input === "v" || input === "V") {
      setVisibility((v) => (v === "public" ? "private" : "public"));
      return;
    }
  });

  if (phase === "hosting" && hostedRoom) {
    return renderHosting(hostedRoom);
  }
  return renderConfigure({ anteIdx, durationIdx, visibility, focusRow });
}

function renderConfigure({ anteIdx, durationIdx, visibility, focusRow }) {
  const ante = ANTE_PRESETS[anteIdx];
  const duration = DURATION_OPTIONS[durationIdx];

  function row(rowIdx, label, value, note) {
    const focused = focusRow === rowIdx;
    return h(Box, { marginTop: 1 },
      h(Text, { color: focused ? C.brand : C.peer, bold: focused }, focused ? "▸ " : "  "),
      h(Text, { color: focused ? C.brand : null, bold: focused }, label),
      h(Text, null, "  "),
      h(Text, { color: C.success, bold: true }, value),
      note ? h(Text, { dimColor: true }, `   ${note}`) : null,
    );
  }

  return h(Box, { flexDirection: "column" },
    h(Text, { color: C.brand, bold: true }, "Host a new room"),
    h(Text, { dimColor: true }, "  Pick your stakes — your room will get a code you can share."),

    row(0, "Ante per round", `${formatPoints(ante)} pts`,
      "← →  cycle  ·  presets 25 / 50 / 100 / 250 / 500"),
    row(1, "Match length", `${duration} min`,
      "← →  cycle  ·  1 / 5 / 10 min"),
    row(2, "Visibility", visibility,
      "← →  toggle  ·  public is in the browse list  ·  private is code-only"),

    h(Box, { marginTop: 1, borderStyle: B.panel, borderColor: C.peer, paddingX: 1, flexDirection: "column" },
      h(Text, { dimColor: true }, "Summary"),
      h(Text, null,
        h(Text, { color: C.brand, bold: true }, "Brain Bet"),
        h(Text, { dimColor: true }, "  ·  "),
        h(Text, null, `${formatPoints(ante)}-pt ante`),
        h(Text, { dimColor: true }, "  ·  "),
        h(Text, null, `${duration} min`),
        h(Text, { dimColor: true }, "  ·  "),
        h(Text, { color: visibility === "public" ? C.success : C.warning }, visibility),
      ),
    ),

    h(Box, { marginTop: 1 },
      h(Footer, { items: [
        ["↑↓", " row"],
        ["← →", " value"],
        ["V", " toggle visibility"],
        ["Enter", " open room"],
        ["Esc", " back"],
      ] }),
    ),
  );
}

function renderHosting(room) {
  return h(Box, { flexDirection: "column" },
    h(Text, { color: C.brand, bold: true }, "Room is open"),
    h(Text, { dimColor: true }, "  Share this code — the first joiner to accept the preview starts the match."),

    h(Box, { marginTop: 1, borderStyle: B.strong, borderColor: C.brand, paddingX: 2, paddingY: 0 },
      h(Text, { color: C.brand, bold: true }, room.code),
    ),

    h(Box, { marginTop: 1, flexDirection: "column" },
      h(Text, null,
        h(Text, { dimColor: true }, "Stakes:  "),
        h(Text, { color: C.success, bold: true }, `${formatPoints(room.ante)} pts`),
        h(Text, { dimColor: true }, " per round"),
      ),
      h(Text, null,
        h(Text, { dimColor: true }, "Length:  "),
        h(Text, null, `${room.durationMin} min`),
      ),
      h(Text, null,
        h(Text, { dimColor: true }, "Visible: "),
        h(Text, { color: room.visibility === "public" ? C.success : C.warning },
          room.visibility === "public"
            ? "public — in the browse list AND eligible for find-match"
            : "private — only joinable with this code"),
      ),
    ),

    h(Box, { marginTop: 1 },
      h(Text, { color: C.warning }, "⌛ Waiting for someone to join…"),
    ),

    h(Box, { marginTop: 1 },
      h(Footer, { items: [["C", " cancel room"], ["Q", " back to lobby"]] }),
    ),
  );
}
