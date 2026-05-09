#!/usr/bin/env node

// Stage 6b — Claude Code statusline integration.
//
// Prints a single-line summary of the current lounge state, suitable
// for Claude Code's statusline contract (a custom command in
// ~/.claude/settings.json that runs frequently to refresh the bottom
// status bar).
//
// Reads ~/.waiting-lounge/state.json — written atomically by
// `cli/play.mjs` whenever it's running with --write-state-to=<path>
// (which `waiting-lounge dock` passes by default). When the file is
// missing OR older than STALE_AFTER_MS, prints "Lounge: idle" so the
// statusline degrades gracefully when the dock isn't running.
//
// Privacy: this script does no network I/O. It only reads a local
// JSON file containing lounge-only state (handle, match phase, round
// label, time remaining, timestamp). Never reads or transmits Claude
// Code prompts, paths, transcripts, or tool I/O.

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const STATE_FILE = path.join(os.homedir(), ".waiting-lounge", "state.json");
const STALE_AFTER_MS = 30_000;

function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function format(state) {
  if (!state || !state.ts) return "☕ Lounge: idle";
  if (Date.now() - state.ts > STALE_AFTER_MS) return "☕ Lounge: idle";

  const handle = state.handle || "?";

  switch (state.appPhase) {
    case "auth":
    case "pairing":
    case "connecting":
      return "☕ Lounge · connecting…";
    case "lobby":
      return `☕ Lounge · ${handle} · idle`;
    case "searching":
      return `☕ Lounge · ${handle} · searching…`;
    case "in_match": {
      const peer = state.peerHandle || "?";
      const round = state.roundLabel || "?";
      const sec = state.betSecondsLeft != null ? ` · ${state.betSecondsLeft}s` : "";
      const reconnecting = state.reconnecting ? " ⟳" : "";
      return `☕ vs ${peer} · ${round}${sec}${reconnecting}`;
    }
    case "match_end":
      return "☕ Lounge · match end";
    case "error":
      return "☕ Lounge · error";
    default:
      return `☕ Lounge · ${state.appPhase || "?"}`;
  }
}

function main() {
  const state = readState();
  process.stdout.write(format(state));
}

main();

module.exports = { format, readState };
