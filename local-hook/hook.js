#!/usr/bin/env node

// Privacy contract: stdin (Claude Code's raw hook payload) is drained and
// discarded. Only the sanitized { event, status, timestamp } is ever written.
// See local-hook/README.md.

const fs = require("fs");
const os = require("os");
const path = require("path");

const event = process.argv[2] || "unknown";

process.stdin.on("data", () => {});
process.stdin.on("end", () => {
  const status =
    event === "start" ? "waiting" :
    event === "attention" ? "needs_attention" :
    event === "stop" ? "done" :
    "unknown";

  const sanitized = { event, status, timestamp: new Date().toISOString() };
  const logPath = path.join(os.homedir(), ".waiting-lounge.log");

  try {
    fs.appendFileSync(logPath, JSON.stringify(sanitized) + "\n");
  } catch {
    // Never block Claude Code if the log can't be written.
  }

  process.exit(0);
});

if (process.stdin.isTTY) {
  process.stdin.emit("end");
}
