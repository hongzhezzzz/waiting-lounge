#!/usr/bin/env node

// Stage 6d — attach lounge pane to an existing tmux session.
//
// `waiting-lounge attach` adds a 1-row lounge strip to the bottom of
// the current tmux window. Unlike `dock`, this works MID-SESSION —
// any time you're already inside tmux running claude, this pops the
// lounge alongside without restarting claude. The kernel sends claude
// a SIGWINCH; claude redraws at the new (smaller) size; the new pane
// runs the lounge.
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

const PLAY_FILE = path.join(__dirname, "play.mjs");
const STATE_FILE = path.join(os.homedir(), ".waiting-lounge", "state.json");
const COLLAPSED_ROWS = Math.max(parseInt(process.env.WL_DOCK_COLLAPSED_ROWS || "1", 10), 1);

function hasTmux() {
  try {
    execFileSync("which", ["tmux"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isInsideTmux() {
  return Boolean(process.env.TMUX);
}

function ensureStateDir() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
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
  const cmd = `node ${shellQuote(PLAY_FILE)} --dock --write-state-to=${shellQuote(STATE_FILE)}`;
  // -v = vertical split (top/bottom). -l = new pane size in rows.
  execFileSync("tmux", ["split-window", "-v", "-l", String(COLLAPSED_ROWS), cmd], { stdio: "inherit" });
  console.log("");
  console.log("  ☕ Lounge attached as a 1-row strip below the current pane.");
  console.log("");
  console.log("  Switch focus    Ctrl-B then ↑   (claude)");
  console.log("                  Ctrl-B then ↓   (lounge)");
  console.log("  Resize lounge   Ctrl-B then Ctrl-↑ / Ctrl-↓   (hold Ctrl, repeat)");
  console.log("  Close lounge    focus the lounge pane FIRST, then Ctrl-B then x");
  console.log("                  (or press Q from inside the lounge)");
  console.log("");
}

// Loaded via `require("./attach.js")` from cli/waiting-lounge.js's
// dispatcher, so we always invoke run() at module load time. (dock.js
// follows the same pattern; multiplexer.js does NOT — it's loaded as a
// dependency module by dock.js, which calls .start() explicitly.)
run();

module.exports = { run };
