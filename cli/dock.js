#!/usr/bin/env node

// Stage 6a — tmux dock orchestrator.
//
// `waiting-lounge dock` opens a tmux session named "wl" with two
// horizontal panes: claude on top, the lounge (`play.mjs --dock`) on
// the bottom. Bottom pane starts at WL_DOCK_COLLAPSED_ROWS rows (1 by
// default) — just a strip showing the current lounge state.
//
// Pressing Ctrl-L (configurable via WL_DOCK_TOGGLE_KEY) anywhere in
// the session toggles the bottom pane between the collapsed strip and
// an expanded WL_DOCK_EXPANDED_PCT (~30%) view, with focus jumping to
// whichever pane just became active.
//
// Stage 6a is a developer-internal beta. Stage 6c is the production
// ship target (zero-dep PTY multiplexer) — this file goes away then.
//
// Privacy: this script does not read any data. It only spawns
// processes (claude, play.mjs) and runs `tmux` commands to lay them
// out. The hook payload (4 sanitized fields) is unchanged. The state.json
// file written by play.mjs (commit 4) contains lounge-only state.

"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const SESSION = "wl";
const DOCK_FILE = __filename;
const PLAY_FILE = path.join(__dirname, "play.mjs");
const STATE_FILE = path.join(os.homedir(), ".waiting-lounge", "state.json");
const COLLAPSED_ROWS = Math.max(parseInt(process.env.WL_DOCK_COLLAPSED_ROWS || "1", 10), 1);
const EXPANDED_PCT = Math.max(parseInt(process.env.WL_DOCK_EXPANDED_PCT || "30", 10), 10);
const TOGGLE_KEY = process.env.WL_DOCK_TOGGLE_KEY || "C-l";
const MIN_EXPANDED_ROWS = 10;

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

function tmuxQuery(args) {
  return execFileSync("tmux", args, { stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim();
}

function tmuxSilent(args) {
  try {
    execFileSync("tmux", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function tmuxRun(args) {
  execFileSync("tmux", args, { stdio: "inherit" });
}

function ensureStateDir() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
}

function shouldUseMultiplexer() {
  // Explicit opt-in (env var or flag) — useful for testing the
  // multiplexer when tmux is also installed.
  if (process.argv.includes("--no-tmux")) return true;
  if (process.env.WL_DOCK_NO_TMUX) return true;
  // Implicit fallback: no tmux on this machine.
  if (!hasTmux()) return true;
  return false;
}

function run() {
  ensureStateDir();

  if (shouldUseMultiplexer()) {
    // Stage 6c — zero-dep PTY multiplexer. Same UX as tmux dock,
    // built on node-pty + DECSTBM scrolling region. Loaded only when
    // needed so users with tmux don't pay the node-pty native-import
    // cost on every `waiting-lounge dock` invocation.
    require("./multiplexer.js").start();
    return;
  }

  if (isInsideTmux()) {
    console.error("Already inside a tmux session.");
    console.error("`waiting-lounge dock` creates its own session — run from a regular terminal.");
    console.error("(Pass --no-tmux to use the zero-dep multiplexer instead.)");
    process.exit(1);
  }

  if (tmuxSilent(["has-session", "-t", SESSION])) {
    spawnSync("tmux", ["attach", "-t", SESSION], { stdio: "inherit" });
    return;
  }

  // Top pane: claude. Bottom pane: lounge in dock mode, writing live
  // state to ~/.waiting-lounge/state.json (Stage 6b's statusline reads
  // from there).
  const playCmd = `node ${shellQuote(PLAY_FILE)} --dock --write-state-to=${shellQuote(STATE_FILE)}`;
  const toggleCmd = `node ${shellQuote(DOCK_FILE)} __toggle`;

  tmuxRun(["new-session", "-d", "-s", SESSION, "claude"]);
  tmuxRun(["split-window", "-v", "-t", SESSION, "-l", String(COLLAPSED_ROWS), playCmd]);
  // Bind toggle key globally (root table), so it fires regardless of
  // which pane has focus. Caveat: in the claude pane, this overrides
  // any other Ctrl-L behavior (e.g. clear-screen). Worth it for the
  // single-keystroke toggle UX.
  tmuxRun(["bind-key", "-T", "root", TOGGLE_KEY, "run-shell", "-b", toggleCmd]);
  // Start with focus on the top pane (claude) — the lounge is just an
  // indicator at this point.
  tmuxRun(["select-pane", "-t", `${SESSION}:.0`]);
  spawnSync("tmux", ["attach", "-t", SESSION], { stdio: "inherit" });
}

function toggle() {
  if (!tmuxSilent(["has-session", "-t", SESSION])) return;
  const bottomHeight = parseInt(
    tmuxQuery(["display-message", "-p", "-t", `${SESSION}:.1`, "#{pane_height}"]),
    10
  );
  const clientHeight = parseInt(
    tmuxQuery(["display-message", "-p", "-t", SESSION, "#{client_height}"]),
    10
  );
  const expanded = Math.max(MIN_EXPANDED_ROWS, Math.floor((clientHeight * EXPANDED_PCT) / 100));
  const isCollapsed = bottomHeight <= COLLAPSED_ROWS + 1;
  const target = isCollapsed ? expanded : COLLAPSED_ROWS;
  tmuxRun(["resize-pane", "-t", `${SESSION}:.1`, "-y", String(target)]);
  // Move focus to whichever pane just became active.
  tmuxRun(["select-pane", "-t", `${SESSION}:.${isCollapsed ? "1" : "0"}`]);
}

function shellQuote(s) {
  // Single-quote and escape any embedded single quotes. Suitable as a
  // /bin/sh argument inside tmux's run-shell / split-window.
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

if (process.argv[2] === "__toggle") {
  toggle();
} else {
  run();
}

module.exports = { run, toggle };
