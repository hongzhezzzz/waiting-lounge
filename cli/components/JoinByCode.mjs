// Waiting Lounge — JoinByCode (Stage 12b).
//
// A 6-char room-code input. Auto-uppercases as the user types and
// silently strips spaces / dashes so a friend's "K7X-QM4" or "k7xqm4"
// both work. Enter submits; Esc / Q returns to the lobby.
//
// The component itself doesn't await the backend response — it just
// emits `join_room_by_code`. The parent (play.mjs) handles the
// resulting `match_preview` event by transitioning to the preview phase,
// or surfaces `error_message` as a toast if the code was bad.

import { createElement as h, useState } from "react";
import { Box, Text, useInput } from "ink";
import { C, B, Footer, Key } from "../lib/theme.mjs";

const CODE_ALPHABET = "BCDEFGHJKMNPQRSTVWXYZ23456789"; // matches backend/src/lib/roomCode.ts
const CODE_LENGTH = 6;

export function JoinByCode({ onSubmit, onCancel }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);

  useInput((input, key) => {
    if (key.escape || input === "q" || input === "Q") {
      onCancel();
      return;
    }
    if (key.return) {
      if (code.length !== CODE_LENGTH) {
        setError(`Code is ${CODE_LENGTH} characters.`);
        return;
      }
      onSubmit(code);
      return;
    }
    if (key.backspace || key.delete) {
      setError(null);
      setCode((c) => c.slice(0, -1));
      return;
    }
    if (!input || input.length !== 1) return;
    // Silently strip spaces/dashes (allow them in the input stream but
    // don't store them). Then uppercase + validate against alphabet.
    if (input === " " || input === "-") return;
    const upper = input.toUpperCase();
    if (!CODE_ALPHABET.includes(upper)) {
      // Soft-ignore characters that aren't in the no-ambiguity alphabet
      // (0/O/1/I/L), so the user just doesn't see them appear — no
      // jarring error. They'll figure it out from the visible code.
      return;
    }
    if (code.length >= CODE_LENGTH) return;
    setError(null);
    setCode((c) => c + upper);
  });

  // Visual: 6 boxes with one char each + cursor on the next slot.
  const slots = [];
  for (let i = 0; i < CODE_LENGTH; i++) {
    const ch = code[i] || " ";
    const isCursor = i === code.length;
    slots.push(
      h(Box, {
        key: i,
        borderStyle: B.primary,
        borderColor: isCursor ? C.brand : (ch === " " ? C.peer : C.success),
        paddingX: 1,
        marginRight: 1,
      },
        h(Text, { bold: true, color: ch === " " ? C.peer : C.brand }, ch),
      ),
    );
  }

  return h(Box, { flexDirection: "column" },
    h(Text, { color: C.brand, bold: true }, "Join a room by code"),
    h(Text, { dimColor: true }, "  Type the 6-character code a friend shared with you."),
    h(Box, { marginTop: 1 }, ...slots),
    error ? h(Box, { marginTop: 1 },
      h(Text, { color: C.danger }, error),
    ) : null,
    h(Box, { marginTop: 1 },
      h(Footer, { items: [["Enter", " join"], ["Backspace", " edit"], ["Esc", " back"]] }),
    ),
  );
}
