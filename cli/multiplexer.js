#!/usr/bin/env node

// Stage 6c — zero-dep PTY multiplexer.
//
// `waiting-lounge dock` (when tmux is absent or --no-tmux is set) uses
// this to deliver the same dock UX without tmux: claude on top, the
// interactive lounge on the bottom, in a single terminal window. No
// extra install required beyond the npm install that brings in
// node-pty.
//
// Architecture:
//   - Two PTY children spawned via node-pty:
//       top    = `claude`               sized (cols, topHeight)
//       bottom = `node cli/play.mjs --dock --write-state-to=…`
//                                        sized (cols, bottomHeight)
//   - Parent (this process) sets DECSTBM scrolling region to
//     1..topHeight and paints into the full terminal.
//   - claude's output bytes are written verbatim — claude only knows
//     about its (cols, topHeight) world, so its CUP/scroll commands
//     stay in the top region.
//   - lounge's output bytes are translated: CUP/HVP/VPA escape codes
//     have their row coordinates shifted by topHeight so the lounge
//     renders into the bottom region. We split lounge's stream on
//     escape boundaries so partial escapes across chunks don't break.
//   - Stdin is multiplexed: Ctrl-L (configurable) toggles between
//     "claude focused" (collapsed bottom, ~1 row strip) and "lounge
//     focused" (expanded bottom, ~30% of terminal). All other input
//     goes to whichever pane is focused.
//   - Resize: SIGWINCH proportionally resizes both PTYs and updates
//     DECSTBM.
//   - Cleanup on exit: reset DECSTBM, clear screen, restore cursor.
//
// Privacy: claude's PTY bytes are forwarded to our stdout verbatim. We
// never read, parse, log, or transmit them. Lounge's bytes are
// minimally regex-rewritten (CUP/HVP/VPA row offsets) to position
// rendering — never read for content. The lounge socket payloads
// remain game-actions-only; the hook payload (4 sanitized fields) is
// unchanged. The state.json file the lounge child writes is unchanged
// from Stage 6a.

"use strict";

const pty = require("node-pty");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const STATE_FILE = path.join(os.homedir(), ".waiting-lounge", "state.json");
const PLAY_FILE = path.join(__dirname, "play.mjs");
const COLLAPSED_ROWS = Math.max(parseInt(process.env.WL_DOCK_COLLAPSED_ROWS || "1", 10), 1);
const EXPANDED_PCT = Math.max(parseInt(process.env.WL_DOCK_EXPANDED_PCT || "30", 10), 10);
const MIN_EXPANDED_ROWS = 10;
const TOGGLE_KEY_BYTE = 0x0c; // Ctrl-L

const TERM = process.env.TERM || "xterm-256color";

let expanded = false;
let claudeProc = null;
let loungeProc = null;
let loungeBuf = ""; // partial-escape buffer for lounge bytes

function getCols() { return process.stdout.columns || 80; }
function getRows() { return process.stdout.rows || 24; }

function bottomHeight() {
  if (expanded) {
    return Math.max(MIN_EXPANDED_ROWS, Math.floor(getRows() * EXPANDED_PCT / 100));
  }
  return COLLAPSED_ROWS;
}

function topHeight() {
  return Math.max(1, getRows() - bottomHeight());
}

function setScrollRegion(top, bottom) {
  process.stdout.write(`\x1B[${top};${bottom}r`);
}

function clearScreen() {
  process.stdout.write("\x1B[2J\x1B[H");
}

function ensureStateDir() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
}

// ---- Lounge output translation ----
// Shift CUP/HVP/VPA row coordinates by `offset` so lounge bytes render
// into the bottom region instead of starting at terminal row 1. Other
// escapes (color, cursor save/restore, attribute, etc.) pass through.
//
// Buffering: ANSI escapes can span chunk boundaries (e.g. `\x1B[5` then
// `;1H`). We hold any trailing partial escape until the next chunk.
function translateLoungeChunk(chunk, offset) {
  const combined = loungeBuf + chunk;
  // Find the last unfinished escape: scan back from the end. If the
  // tail starts with ESC and isn't terminated by an alpha (CSI final
  // byte) yet, hold it.
  const lastEsc = combined.lastIndexOf("\x1B");
  let safe = combined;
  let pending = "";
  if (lastEsc !== -1) {
    const tail = combined.slice(lastEsc);
    // Terminated escapes end with alpha or `~` (CSI/OSC) — heuristic.
    if (!/[a-zA-Z~]/.test(tail.slice(1))) {
      safe = combined.slice(0, lastEsc);
      pending = tail;
    }
  }
  loungeBuf = pending;

  // CUP: ESC [ <row> ; <col> H   →   shift row
  // HVP: ESC [ <row> ; <col> f   →   shift row (HVP is rare; same syntax as CUP)
  // CUP-row-only: ESC [ <row> H  (col defaults to 1)
  // Home: ESC [ H                →   shift row to offset+1
  // VPA: ESC [ <row> d           →   shift row
  let out = safe;
  out = out.replace(/\x1B\[(\d+);(\d+)([Hf])/g, (_, r, c, t) =>
    `\x1B[${parseInt(r, 10) + offset};${c}${t}`
  );
  out = out.replace(/\x1B\[(\d+)d/g, (_, r) =>
    `\x1B[${parseInt(r, 10) + offset}d`
  );
  // CUP-row-only and Home: only match when not preceded by digit/semicolon
  // (already handled above) — match `ESC [ <num> H` where num is row only.
  out = out.replace(/\x1B\[(\d+)H/g, (_, r) =>
    `\x1B[${parseInt(r, 10) + offset};1H`
  );
  out = out.replace(/\x1B\[H/g, () =>
    `\x1B[${offset + 1};1H`
  );
  // Block lounge's attempt to set its OWN scroll region — that would
  // clobber ours.
  out = out.replace(/\x1B\[\d*;?\d*r/g, "");
  // Block lounge's alt-screen entry/exit — multiplexer owns the
  // top-level alt-screen state.
  out = out.replace(/\x1B\[\?(?:1049|47|1047)[hl]/g, "");
  // Block clear-screen (would wipe claude's region).
  out = out.replace(/\x1B\[2J/g, "");
  return out;
}

function spawnClaude() {
  return pty.spawn("claude", [], {
    name: TERM,
    cols: getCols(),
    rows: topHeight(),
    cwd: process.cwd(),
    env: process.env,
  });
}

function spawnLounge() {
  return pty.spawn("node", [PLAY_FILE, "--dock", `--write-state-to=${STATE_FILE}`], {
    name: TERM,
    cols: getCols(),
    rows: bottomHeight(),
    cwd: process.cwd(),
    env: process.env,
  });
}

function applyLayout() {
  setScrollRegion(1, topHeight());
  if (claudeProc) claudeProc.resize(getCols(), topHeight());
  if (loungeProc) loungeProc.resize(getCols(), bottomHeight());
}

function start() {
  ensureStateDir();
  clearScreen();
  setScrollRegion(1, topHeight());

  claudeProc = spawnClaude();
  loungeProc = spawnLounge();

  claudeProc.onData((data) => {
    process.stdout.write(data);
  });

  loungeProc.onData((data) => {
    const translated = translateLoungeChunk(data, topHeight());
    process.stdout.write(translated);
  });

  // Stdin routing: Ctrl-L toggles; otherwise route to focused pane.
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("data", (data) => {
    // Detect Ctrl-L as a single byte (allow it to be in the middle of
    // a chunk too, but only honor a standalone byte for the toggle).
    if (data.length === 1 && data[0] === TOGGLE_KEY_BYTE) {
      toggle();
      return;
    }
    if (expanded) {
      loungeProc.write(data.toString());
    } else {
      claudeProc.write(data.toString());
    }
  });

  // Resize.
  process.stdout.on("resize", () => {
    applyLayout();
  });

  // Cleanup paths.
  function cleanup() {
    process.stdout.write("\x1B[r"); // reset DECSTBM
    process.stdout.write("\x1B[?25h"); // ensure cursor visible
    clearScreen();
    if (process.stdin.isTTY) {
      try { process.stdin.setRawMode(false); } catch {}
    }
  }

  claudeProc.onExit(({ exitCode }) => {
    if (loungeProc) try { loungeProc.kill(); } catch {}
    cleanup();
    process.exit(exitCode || 0);
  });
  loungeProc.onExit(() => {
    // Lounge died — respawn or just exit? For now, log to stderr (which
    // gets buffered, doesn't disturb claude's UI) and don't exit; user
    // can keep using claude.
    // If later this becomes annoying, can show a banner in bottom region.
  });

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    // Forward Ctrl-C to focused pane.
    if (expanded) loungeProc.write("\x03");
    else claudeProc.write("\x03");
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}

function toggle() {
  expanded = !expanded;
  // Re-layout: clear screen, reset DECSTBM, resize children. They'll
  // repaint on receiving SIGWINCH from the resize.
  clearScreen();
  applyLayout();
  // Trigger lounge to re-render into the new region size by nudging it
  // (resize event already does this via SIGWINCH). Same for claude.
}

if (require.main === module) {
  start();
}

module.exports = { start, translateLoungeChunk };
