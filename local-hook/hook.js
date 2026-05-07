#!/usr/bin/env node

// PRIVACY CONTRACT — see docs/decisions.md.
//
// 1. Claude Code pipes its raw hook JSON (which can include prompt text, code,
//    file paths, transcript paths, tool I/O, working directory, etc.) into our
//    stdin. We drain it and DISCARD it. We never parse it, log it, or send it.
// 2. The only outbound network call this script makes contains exactly four
//    fields:
//        anonymousDeviceId  — a UUID generated and stored locally
//        status             — one of "waiting" | "needs_attention" | "done"
//        client             — the literal string "claude-code"
//        timestamp          — Date.now() integer
//    The backend route at POST /api/agent-event REJECTS payloads with any
//    other keys, so this is enforced from both sides.
// 3. All errors are swallowed. The hook script must never block Claude Code
//    or print anything to its stdout/stderr (except for the explicit `pair`
//    subcommand, which prints a URL and exits cleanly).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const event = process.argv[2] || "unknown";

// --- pair subcommand: print a one-time browser URL and exit ---
if (event === "pair") {
  const deviceId = getOrCreateDeviceId();
  const frontend = process.env.WAITING_LOUNGE_FRONTEND || "http://localhost:3000";
  console.log(`${frontend}/pair?d=${deviceId}`);
  console.log("");
  console.log("Open that URL in your browser once. The browser will remember the device ID");
  console.log("locally; you do not need to run this command again on subsequent sessions.");
  process.exit(0);
}

// --- main hook flow: drain stdin, send sanitized status, never block ---

let drained = false;
process.stdin.on("data", () => {
  // Discard. Never inspect, never store.
});
process.stdin.on("end", () => {
  if (drained) return;
  drained = true;
  finish();
});

// Some shells deliver the EOF differently; if no stdin is connected at all,
// trigger the flow immediately.
if (process.stdin.isTTY) {
  drained = true;
  finish();
}

function finish() {
  const status =
    event === "start" ? "waiting" :
    event === "resume" ? "waiting" :
    event === "attention" ? "needs_attention" :
    event === "stop" ? "done" :
    "unknown";

  // Local debug log (always sanitized).
  const sanitized = { event, status, timestamp: new Date().toISOString() };
  const logPath = path.join(os.homedir(), ".waiting-lounge.log");
  try {
    fs.appendFileSync(logPath, JSON.stringify(sanitized) + "\n");
  } catch {
    // Never block Claude Code.
  }

  // Skip the network for unknown events.
  if (status === "unknown") return process.exit(0);

  const payload = {
    anonymousDeviceId: getOrCreateDeviceId(),
    status,
    client: "claude-code",
    timestamp: Date.now(),
  };

  const backendUrl = readBackendUrl();
  postJson(`${backendUrl}/api/agent-event`, payload, () => process.exit(0));
}

function getOrCreateDeviceId() {
  const dir = path.join(os.homedir(), ".waiting-lounge");
  const file = path.join(dir, "device_id");
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, crypto.randomUUID(), { mode: 0o600 });
    }
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    // Fall back to an in-memory id so we never crash the hook.
    return crypto.randomUUID();
  }
}

function readBackendUrl() {
  // Resolution order:
  //   1. WAITING_LOUNGE_BACKEND env var (override for one-off runs)
  //   2. ~/.waiting-lounge/backend_url file (persistent setting)
  //   3. http://localhost:4000 (local dev fallback)
  if (process.env.WAITING_LOUNGE_BACKEND) {
    return process.env.WAITING_LOUNGE_BACKEND.trim();
  }
  try {
    const file = path.join(os.homedir(), ".waiting-lounge", "backend_url");
    if (fs.existsSync(file)) {
      const v = fs.readFileSync(file, "utf8").trim();
      if (v) return v;
    }
  } catch {}
  return "http://localhost:4000";
}

function postJson(urlString, data, done) {
  let finished = false;
  const finishOnce = () => {
    if (finished) return;
    finished = true;
    done();
  };

  try {
    const url = new URL(urlString);
    const lib = url.protocol === "https:" ? require("https") : require("http");
    const body = JSON.stringify(data);
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 1500,
      },
      (res) => {
        // Drain the response and exit. We don't care about the body.
        res.on("data", () => {});
        res.on("end", finishOnce);
      },
    );
    req.on("error", finishOnce);
    req.on("timeout", () => {
      try { req.destroy(); } catch {}
      finishOnce();
    });
    req.write(body);
    req.end();
  } catch {
    finishOnce();
  }

  // Final safety net: never block the hook for more than ~1.7s.
  setTimeout(finishOnce, 1700).unref();
}
