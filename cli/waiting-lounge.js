#!/usr/bin/env node

// waiting-lounge CLI — installs and configures the local hook.
//
// Subcommands:
//   install      copy hook script + device id, print settings JSON to paste
//   pair         print the one-time browser pairing URL
//   status       show what's installed and reachable
//   test         POST a fake waiting event to the backend and report
//   uninstall    remove ~/.waiting-lounge/ and print the settings to delete
//
// The CLI never silently edits ~/.claude/settings.json. We print the JSON
// block; the user pastes it themselves. (Roadmap §9: "Prefer not to silently
// modify Claude Code settings.")

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const https = require("https");

const DEFAULT_BACKEND = "https://waiting-lounge.onrender.com";
const DEFAULT_FRONTEND = "https://waiting-lounge.vercel.app";
const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, ".waiting-lounge");
const HOOK_PATH = path.join(CONFIG_DIR, "hook.js");
const DEVICE_ID_PATH = path.join(CONFIG_DIR, "device_id");
const BACKEND_URL_PATH = path.join(CONFIG_DIR, "backend_url");
const FRONTEND_URL_PATH = path.join(CONFIG_DIR, "frontend_url");

function locateHookSource() {
  // The CLI ships with the hook script at `local-hook/hook.js` (relative
  // to the package root). When run via `node cli/waiting-lounge.js`, the
  // package root is one level up from this file.
  const candidates = [
    path.join(__dirname, "..", "local-hook", "hook.js"),
    path.join(__dirname, "hook.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function readOrCreateDeviceId() {
  ensureConfigDir();
  if (fs.existsSync(DEVICE_ID_PATH)) {
    return fs.readFileSync(DEVICE_ID_PATH, "utf8").trim();
  }
  const id = crypto.randomUUID();
  fs.writeFileSync(DEVICE_ID_PATH, id, { mode: 0o600 });
  return id;
}

function readBackendUrl() {
  if (fs.existsSync(BACKEND_URL_PATH)) {
    return fs.readFileSync(BACKEND_URL_PATH, "utf8").trim();
  }
  return DEFAULT_BACKEND;
}

function readFrontendUrl() {
  if (fs.existsSync(FRONTEND_URL_PATH)) {
    return fs.readFileSync(FRONTEND_URL_PATH, "utf8").trim();
  }
  return DEFAULT_FRONTEND;
}

function writeBackendUrlIfMissing(url) {
  if (!fs.existsSync(BACKEND_URL_PATH)) {
    fs.writeFileSync(BACKEND_URL_PATH, url, { mode: 0o600 });
  }
}

function writeFrontendUrlIfMissing(url) {
  if (!fs.existsSync(FRONTEND_URL_PATH)) {
    fs.writeFileSync(FRONTEND_URL_PATH, url, { mode: 0o600 });
  }
}

function settingsBlock(hookPath) {
  return {
    hooks: {
      UserPromptSubmit: [
        { matcher: "", hooks: [{ type: "command", command: `node ${hookPath} start` }] },
      ],
      Notification: [
        { matcher: "", hooks: [{ type: "command", command: `node ${hookPath} attention` }] },
      ],
      PostToolUse: [
        { matcher: "", hooks: [{ type: "command", command: `node ${hookPath} resume` }] },
      ],
      Stop: [
        { matcher: "", hooks: [{ type: "command", command: `node ${hookPath} stop` }] },
      ],
    },
  };
}

function postJson(urlString, data, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      resolve(result);
    };
    try {
      const url = new URL(urlString);
      const lib = url.protocol === "https:" ? https : http;
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
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            finish({
              ok: res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      req.on("error", (err) => finish({ ok: false, error: err.message }));
      req.on("timeout", () => {
        try { req.destroy(); } catch {}
        finish({ ok: false, error: "timeout" });
      });
      req.write(body);
      req.end();
    } catch (err) {
      finish({ ok: false, error: err.message });
    }
  });
}

function getJson(urlString, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      resolve(result);
    };
    try {
      const url = new URL(urlString);
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname,
          method: "GET",
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            finish({
              ok: res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      req.on("error", (err) => finish({ ok: false, error: err.message }));
      req.on("timeout", () => {
        try { req.destroy(); } catch {}
        finish({ ok: false, error: "timeout" });
      });
      req.end();
    } catch (err) {
      finish({ ok: false, error: err.message });
    }
  });
}

// --- subcommands ---

function cmdInstall(args) {
  const wantsWriteSettings = args.includes("--write-settings");
  if (wantsWriteSettings) {
    console.error("--write-settings is not implemented yet. Falling back to print mode.");
  }

  const hookSrc = locateHookSource();
  if (!hookSrc) {
    console.error("Couldn't find local-hook/hook.js next to this CLI. Reinstall the package.");
    process.exit(1);
  }

  ensureConfigDir();
  const hookContent = fs.readFileSync(hookSrc, "utf8");
  fs.writeFileSync(HOOK_PATH, hookContent, { mode: 0o755 });

  const deviceId = readOrCreateDeviceId();
  writeBackendUrlIfMissing(DEFAULT_BACKEND);
  writeFrontendUrlIfMissing(DEFAULT_FRONTEND);

  const backendUrl = readBackendUrl();
  const frontendUrl = readFrontendUrl();

  console.log("");
  console.log("Waiting Lounge installed.");
  console.log("");
  console.log(`  Hook script:  ${HOOK_PATH}`);
  console.log(`  Device ID:    ${deviceId.slice(0, 8)}…  (kept private at ${DEVICE_ID_PATH})`);
  console.log(`  Backend:      ${backendUrl}`);
  console.log(`  Frontend:     ${frontendUrl}`);
  console.log("");
  console.log("---");
  console.log("");
  console.log("Step 1 — Paste this into ~/.claude/settings.json (under the top-level object):");
  console.log("");
  console.log(JSON.stringify(settingsBlock(HOOK_PATH), null, 2));
  console.log("");
  console.log("If your settings.json already has other top-level keys, merge the `hooks` field.");
  console.log("If `hooks` already has entries, add ours alongside (don't overwrite).");
  console.log("");
  console.log("Step 2 — Pair your browser (one click, one time):");
  console.log("");
  console.log(`  ${frontendUrl}/pair?d=${deviceId}`);
  console.log("");
  console.log("Step 3 — Verify the connection:");
  console.log("");
  console.log("  waiting-lounge test");
  console.log("");
  console.log("Then start a Claude Code session as normal. The header badge in the lounge");
  console.log(`should flip through "Claude is working" → "may be done" automatically.`);
}

function cmdPair() {
  const deviceId = readOrCreateDeviceId();
  const frontendUrl = readFrontendUrl();
  console.log(`${frontendUrl}/pair?d=${deviceId}`);
}

async function cmdStatus() {
  const dirExists = fs.existsSync(CONFIG_DIR);
  const hookExists = fs.existsSync(HOOK_PATH);
  const idExists = fs.existsSync(DEVICE_ID_PATH);
  const backendUrl = readBackendUrl();
  const frontendUrl = readFrontendUrl();

  console.log("");
  console.log("Waiting Lounge — status");
  console.log("");
  console.log(`  Config dir:     ${dirExists ? "yes" : "no"}  (${CONFIG_DIR})`);
  console.log(`  Hook script:    ${hookExists ? "yes" : "no"}  (${HOOK_PATH})`);
  console.log(`  Device ID:      ${idExists ? readOrCreateDeviceId().slice(0, 8) + "…" : "no"}`);
  console.log(`  Backend URL:    ${backendUrl}`);
  console.log(`  Frontend URL:   ${frontendUrl}`);

  // Ping the backend.
  const health = await getJson(`${backendUrl}/health`, 4000);
  if (health.ok) {
    console.log(`  Backend reach:  yes  (${health.status})`);
  } else {
    console.log(`  Backend reach:  no   (${health.error || health.status})`);
  }

  // Look at ~/.claude/settings.json for our hook entries.
  const settingsPath = path.join(HOME, ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const txt = fs.readFileSync(settingsPath, "utf8");
      const hookHit = txt.includes(HOOK_PATH);
      console.log(`  Settings.json:  ${hookHit ? "wired up" : "no waiting-lounge hooks found"}  (${settingsPath})`);
    } catch (err) {
      console.log(`  Settings.json:  unreadable (${err.message})`);
    }
  } else {
    console.log(`  Settings.json:  not found (${settingsPath})`);
  }

  console.log("");
}

async function cmdTest() {
  if (!fs.existsSync(DEVICE_ID_PATH)) {
    console.error("Not installed yet. Run `waiting-lounge install` first.");
    process.exit(1);
  }
  const deviceId = readOrCreateDeviceId();
  const backendUrl = readBackendUrl();
  const frontendUrl = readFrontendUrl();

  console.log("");
  console.log(`Sending a test "waiting" event to ${backendUrl} …`);
  const result = await postJson(
    `${backendUrl}/api/agent-event`,
    {
      anonymousDeviceId: deviceId,
      status: "waiting",
      client: "claude-code",
      timestamp: Date.now(),
    },
    5000,
  );

  if (!result.ok) {
    console.log(`  ✗ Couldn't reach the backend (${result.error || result.status}).`);
    console.log("");
    console.log("Things to check:");
    console.log("  - Are you online?");
    console.log(`  - Is the backend URL correct? (${backendUrl})`);
    console.log(`  - Try opening ${backendUrl}/health in your browser.`);
    process.exit(1);
  }

  let parsed;
  try { parsed = JSON.parse(result.body); } catch { parsed = null; }
  const delivered = parsed && typeof parsed.delivered === "number" ? parsed.delivered : null;

  if (delivered === null) {
    console.log(`  ? Backend responded but we couldn't parse it. Status ${result.status}, body: ${result.body.slice(0, 200)}`);
  } else if (delivered === 0) {
    console.log(`  ✓ Backend accepted the event but no browsers are listening yet.`);
    console.log("");
    console.log("Open the lounge to listen, then re-run this test:");
    console.log(`  ${frontendUrl}/pair?d=${deviceId}    (one-time pairing)`);
    console.log(`  ${frontendUrl}                       (any page; keep tab open)`);
    console.log("");
    console.log("After that, when you start a Claude Code session, the header badge");
    console.log(`should show "Claude is working" until Claude stops responding.`);
  } else {
    console.log(`  ✓ Backend delivered the event to ${delivered} listening browser${delivered === 1 ? "" : "s"}.`);
    console.log("");
    console.log(`Open ${frontendUrl} — the header badge should briefly show "Claude is working".`);
  }
  console.log("");
}

function cmdUninstall(args) {
  const force = args.includes("--force") || args.includes("-f");
  if (!fs.existsSync(CONFIG_DIR)) {
    console.log("Nothing to uninstall — ~/.waiting-lounge/ is already gone.");
    return;
  }
  if (!force) {
    console.log("");
    console.log(`This will delete ${CONFIG_DIR} (hook script, device id, backend URL).`);
    console.log("Re-run with --force to confirm:");
    console.log("");
    console.log("  waiting-lounge uninstall --force");
    console.log("");
    console.log("After uninstalling, also remove the waiting-lounge entries from");
    console.log(`${path.join(HOME, ".claude", "settings.json")} — anything where the command path`);
    console.log(`mentions ${HOOK_PATH}.`);
    return;
  }

  fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
  console.log("");
  console.log(`Removed ${CONFIG_DIR}.`);
  console.log("");
  console.log("One last step — open ~/.claude/settings.json and remove any hooks entries");
  console.log(`that reference ${HOOK_PATH}. The path won't exist anymore, so leaving them`);
  console.log("in won't break Claude Code (the hook errors are swallowed) but it'll be noisier.");
  console.log("");
}

function cmdHelp() {
  console.log("");
  console.log("waiting-lounge — companion app for Claude Code");
  console.log("");
  console.log("Usage:");
  console.log("  waiting-lounge install      Install the local hook and print settings to paste");
  console.log("  waiting-lounge pair         Print the one-time browser pairing URL");
  console.log("  waiting-lounge status       Show what's installed and whether the backend is reachable");
  console.log("  waiting-lounge test         Send a fake event to the backend; prints what listeners saw");
  console.log("  waiting-lounge uninstall    Remove ~/.waiting-lounge/ (use --force to confirm)");
  console.log("");
  console.log("Privacy: the hook never sends prompts, code, paths, transcripts, or tool I/O.");
  console.log("Only an anonymous device id and one of {waiting, needs_attention, done}.");
  console.log("");
}

// --- main ---

const cmd = process.argv[2];
const args = process.argv.slice(3);

(async () => {
  switch (cmd) {
    case "install":
      cmdInstall(args);
      break;
    case "pair":
      cmdPair();
      break;
    case "status":
      await cmdStatus();
      break;
    case "test":
      await cmdTest();
      break;
    case "uninstall":
      cmdUninstall(args);
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      cmdHelp();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error('Run "waiting-lounge help" for the list.');
      process.exit(1);
  }
})();
