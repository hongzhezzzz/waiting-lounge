// Waiting Lounge — BrowseRooms (Stage 12b).
//
// Polled list of open public rooms. Mounts → emits list_open_rooms,
// listens for the open_rooms event, refreshes every 5s. Arrow keys
// navigate; Enter joins the highlighted room (parent emits
// join_room_by_code). R refreshes manually. Q / Esc returns to lobby.
//
// The parent feeds us `rooms` as a prop so we don't have to hold a
// socket listener inside the component — keeps the data flow one-way.

import { createElement as h, useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { C, B, Footer, Key } from "../lib/theme.mjs";

const POLL_INTERVAL_MS = 5000;
const MAX_ROWS_VISIBLE = 8;

function formatPoints(n) {
  return Number(n).toLocaleString();
}

function formatAge(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export function BrowseRooms({ rooms, onRefresh, onJoin, onBack }) {
  const [cursor, setCursor] = useState(0);
  const [tick, setTick] = useState(0); // forces re-render so age strings update

  // Initial fetch + interval polling. Parent's onRefresh just calls
  // sock.emit("list_open_rooms"); the open_rooms event lands in a
  // socket listener and parent updates the rooms prop.
  useEffect(() => {
    onRefresh();
    const id = setInterval(() => {
      onRefresh();
      setTick((t) => t + 1);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep cursor in range as the list shrinks.
  useEffect(() => {
    if (rooms.length === 0) setCursor(0);
    else if (cursor >= rooms.length) setCursor(rooms.length - 1);
  }, [rooms.length, cursor]);

  useInput((input, key) => {
    if (input === "q" || input === "Q" || key.escape) {
      onBack();
      return;
    }
    if (input === "r" || input === "R") {
      onRefresh();
      return;
    }
    if (rooms.length === 0) return;
    if (key.upArrow || input === "k") {
      setCursor((i) => (i + rooms.length - 1) % rooms.length);
      return;
    }
    if (key.downArrow || input === "j") {
      setCursor((i) => (i + 1) % rooms.length);
      return;
    }
    if (key.return) {
      const room = rooms[cursor];
      if (room) onJoin(room.code);
      return;
    }
  });

  const now = Date.now();
  const rowsToShow = rooms.slice(0, MAX_ROWS_VISIBLE);

  return h(Box, { flexDirection: "column" },
    h(Text, { color: C.brand, bold: true }, "Open rooms"),
    h(Text, { dimColor: true },
      rooms.length === 0
        ? "  No public rooms right now — host one with [N] from the lobby."
        : `  ${rooms.length} open  ·  ↑↓ pick  ·  Enter join  ·  R refresh`,
    ),

    rooms.length === 0
      ? null
      : h(Box, { marginTop: 1, flexDirection: "column" },
          ...rowsToShow.map((r, idx) => {
            const focused = idx === cursor;
            const age = formatAge(now - r.createdAt);
            return h(Box, { key: r.code },
              h(Text, { color: focused ? C.brand : C.peer, bold: focused }, focused ? "▸ " : "  "),
              h(Text, { bold: true, color: focused ? C.brand : null }, r.code.padEnd(7)),
              h(Text, { dimColor: true }, "  by "),
              h(Text, { color: focused ? C.brand : null }, r.hostHandle.padEnd(22).slice(0, 22)),
              h(Text, { dimColor: true }, "  "),
              h(Text, { color: C.success }, `${formatPoints(r.ante)} pt ante`),
              h(Text, { dimColor: true }, "  ·  "),
              h(Text, null, `${r.durationMin}m`),
              h(Text, { dimColor: true }, `   ${age}`),
            );
          }),
          rooms.length > MAX_ROWS_VISIBLE
            ? h(Text, { dimColor: true }, `   …and ${rooms.length - MAX_ROWS_VISIBLE} more`)
            : null,
        ),

    h(Box, { marginTop: 1 },
      h(Footer, { items: [
        ["↑↓", " pick"], ["Enter", " join"], ["R", " refresh"], ["Q", " back"],
      ] }),
    ),
  );
}
