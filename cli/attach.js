#!/usr/bin/env node

// Stage 6d — attach lounge pane to an existing tmux session.
// Stage 10e — Mac-friendly bindings: bind Ctrl-L in tmux root keytable
// (no prefix needed) for both focus-toggle AND expand/collapse. Removes
// the dependence on Ctrl-B + arrow keys, which macOS Mission Control
// intercepts at the OS level before tmux can see them.
//
// `waiting-lounge attach` adds a 1-row lounge strip to the bottom of
// the current tmux window. Works MID-SESSION — any time you're already
// inside tmux running claude, this pops the lounge alongside without
// restarting claude. The kernel sends claude a SIGWINCH; claude redraws
// at the new (smaller) size; the new pane runs the lounge.
//
// Frictionless path: install tmux once, run `tmux`, then start claude
// inside it. After that, `waiting-lounge attach` works any time —
// either via `!` prefix from inside claude, or from any other terminal
// connected to the same tmux session.
//
// Privacy: this command does not read any data. It only invokes
// `tmux split-window` to add a pane and starts the lounge child in it.
// The hook payload (4 sanitized fields) is unchanged. The state.json
// file the lounge child writes is unchanged from Stage 6a.

"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { hasTmux } = require("./lib/tmux.js");

const PLAY_FILE = path.join(__dirname, "play.mjs");
const ATTACH_FILE = __filename;
const STATE_FILE = path.join(os.homedir(), ".waiting-lounge", "state.json");
const COLLAPSED_ROWS = Math.max(parseInt(process.env.WL_DOCK_COLLAPSED_ROWS || "1", 10), 1);
const EXPANDED_PCT = Math.max(parseInt(process.env.WL_DOCK_EXPANDED_PCT || "30", 10), 10);
const MIN_EXPANDED_ROWS = 10;
const TOGGLE_KEY = process.env.WL_DOCK_TOGGLE_KEY || "C-l";

function isInsideTmux() {
  return Boolean(process.env.TMUX);
}

function ensureStateDir() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function tmuxQuery(args) {
  return execFileSync("tmux", args, { stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim();
}

function tmuxRun(args) {
  execFileSync("tmux", args, { stdio: "inherit" });
}

function run() {
  if (!hasTmux()) {
    console.error("`waiting-lounge attach` requires tmux.");
    console.error("");
    console.error("  macOS:  brew install tmux");
    console.error("  Linux:  sudo apt install tmux  (or sudo dnf install tmux)");
    console.error("");
    console.error("After install: run `tmux`, start claude inside, then `waiting-lounge attach`.");
    console.error("Alternative: `waiting-lounge dock` (zero-dep, but only for new sessions).");
    process.exit(1);
  }
  if (!isInsideTmux()) {
    console.error("`waiting-lounge attach` only works from INSIDE a tmux session.");
    console.error("");
    console.error("If your claude is running inside tmux:");
    console.error("  • From inside the claude chat:  type `! waiting-lounge attach`");
    console.error("  • From another tmux pane:        run `waiting-lounge attach` directly");
    console.error("");
    console.error("If your claude is NOT in tmux: you'll need either");
    console.error("  • `waiting-lounge dock`     — new session, claude on top, lounge on bottom");
    console.error("  • restart claude inside tmux, then `attach` later this session");
    process.exit(1);
  }
  ensureStateDir();

  // 1. Split the current window vertically with a 1-row lounge strip.
  const cmd = `node ${shellQuote(PLAY_FILE)} --dock --write-state-to=${shellQuote(STATE_FILE)}`;
  execFileSync("tmux", ["split-window", "-v", "-l", String(COLLAPSED_ROWS), cmd], { stdio: "inherit" });

  // 2. Capture the lounge pane id (currently active) AND the claude pane
  // id (the one that just lost focus, available as the "last" pane).
  // We bake the ids into the keybinding so __toggle knows which panes
  // to flip between regardless of intervening tmux activity.
  let loungePaneId = "";
  let claudePaneId = "";
  try {
    loungePaneId = tmuxQuery(["display-message", "-p", "#{pane_id}"]);
    claudePaneId = tmuxQuery(["display-message", "-p", "-t", "{last}", "#{pane_id}"]);
  } catch {
    // If pane-id capture failed, fall through — the binding is best-effort.
  }

  // 3. Bind TOGGLE_KEY in the root keytable so users don't have to press
  // tmux's prefix first (Ctrl-B on Mac is intercepted by Mission Control
  // for Space-switching). Single keystroke, works from either pane.
  if (loungePaneId && claudePaneId) {
    const toggleCmd = `node ${shellQuote(ATTACH_FILE)} __toggle ${loungePaneId} ${claudePaneId}`;
    try {
      execFileSync("tmux", ["bind-key", "-T", "root", TOGGLE_KEY, "run-shell", "-b", toggleCmd], {
        stdio: "inherit",
      });
    } catch {
      // Bind failed — print fallback instructions below.
    }
  }

  console.log("");
  console.log("  ☕ Lounge attached as a 1-row strip below the current pane.");
  console.log("");
  if (loungePaneId && claudePaneId) {
    console.log(`  Toggle focus + size   ${TOGGLE_KEY}   (no prefix needed)`);
    console.log("                        First press → expand lounge to ~30% and focus it.");
    console.log("                        Press again → collapse back to 1 row and focus claude.");
    console.log("");
    console.log("  Close lounge          Q from inside the lounge");
    console.log("                        (or kill the tmux pane manually)");
    console.log("");
    console.log("  Note: this binds Ctrl-L globally in your tmux session, which");
    console.log("  overrides shell clear-screen. Remove later with:");
    console.log("    tmux unbind -T root C-l");
  } else {
    console.log("  Couldn't capture pane ids — falling back to vanilla tmux bindings.");
    console.log("    Switch focus  Ctrl-B then ↑/↓");
    console.log("    Close lounge  Q from inside the lounge, or Ctrl-B then x");
  }
  console.log("");
}

// Toggle handler — runs as a fresh node process every time the user
// presses TOGGLE_KEY. Wraps tmux queries in try/catch per Stage 10a
// lesson: any non-zero tmux exit kills the run-shell process and tmux
// surfaces a scary popup. We want graceful no-ops on the unhappy path.
function toggle(loungePaneId, claudePaneId) {
  if (!loungePaneId || !claudePaneId) return;

  // Decide direction by reading the lounge pane's current height.
  let bottomHeight = COLLAPSED_ROWS;
  let clientHeight = 24;
  try {
    bottomHeight = parseInt(
      tmuxQuery(["display-message", "-p", "-t", loungePaneId, "#{pane_height}"]),
      10,
    );
    if (!Number.isFinite(bottomHeight)) bottomHeight = COLLAPSED_ROWS;
  } catch {}
  try {
    clientHeight = parseInt(
      tmuxQuery(["display-message", "-p", "-t", loungePaneId, "#{client_height}"]),
      10,
    );
    if (!Number.isFinite(clientHeight) || clientHeight < 1) clientHeight = 24;
  } catch {}

  const expanded = Math.max(MIN_EXPANDED_ROWS, Math.floor((clientHeight * EXPANDED_PCT) / 100));
  const isCollapsed = bottomHeight <= COLLAPSED_ROWS + 1;
  const target = isCollapsed ? expanded : COLLAPSED_ROWS;
  const focusTarget = isCollapsed ? loungePaneId : claudePaneId;

  try { tmuxRun(["resize-pane", "-t", loungePaneId, "-y", String(target)]); } catch {}
  try { tmuxRun(["select-pane", "-t", focusTarget]); } catch {}
}

if (process.argv[2] === "__toggle") {
  // argv: ["node", "attach.js", "__toggle", loungePaneId, claudePaneId]
  toggle(process.argv[3] || "", process.argv[4] || "");
} else {
  // Loaded via `require("./attach.js")` from cli/waiting-lounge.js's
  // dispatcher, so we always invoke run() at module load time.
  run();
}

module.exports = { run, toggle };
