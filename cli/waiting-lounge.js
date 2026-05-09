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
const path = require("path");
const http = require("http");
const https = require("https");
const readline = require("readline");

// Shared config helpers — also used by cli/play.mjs.
const {
  DEFAULT_BACKEND,
  DEFAULT_FRONTEND,
  HOME,
  CONFIG_DIR,
  HOOK_PATH,
  DEVICE_ID_PATH,
  BACKEND_URL_PATH,
  FRONTEND_URL_PATH,
  ensureConfigDir,
  readOrCreateDeviceId,
  readBackendUrl,
  readFrontendUrl,
  writeBackendUrlIfMissing,
  writeFrontendUrlIfMissing,
} = require("./lib/config");

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

const HOOK_EVENTS = [
  ["UserPromptSubmit", "start"],
  ["Notification", "attention"],
  ["PostToolUse", "resume"],
  ["Stop", "stop"],
];

function settingsBlock(hookPath) {
  const block = { hooks: {} };
  for (const [event, sub] of HOOK_EVENTS) {
    block.hooks[event] = [
      { matcher: "", hooks: [{ type: "command", command: `node ${hookPath} ${sub}` }] },
    ];
  }
  return block;
}

function ask(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      // Non-interactive: default to "no".
      return resolve("");
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || "").trim());
    });
  });
}

function mergeWaitingLoungeHooks(settings, hookPath) {
  // Returns { settings, added, replaced } — caller writes back.
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    settings = {};
  }
  if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) {
    settings.hooks = {};
  }

  let added = 0;
  let replaced = 0;

  for (const [event, sub] of HOOK_EVENTS) {
    const ourCommand = `node ${hookPath} ${sub}`;
    const existing = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];

    // Strip any inner hook entries that point at our hook path. Keep
    // anything else (other tools' hooks) intact.
    const cleaned = [];
    let foundOurs = false;
    for (const block of existing) {
      if (!block || typeof block !== "object" || !Array.isArray(block.hooks)) {
        cleaned.push(block);
        continue;
      }
      const innerCleaned = block.hooks.filter((h) => {
        if (!h || typeof h !== "object" || typeof h.command !== "string") return true;
        const refersToOurs = h.command.includes(hookPath);
        if (refersToOurs) foundOurs = true;
        return !refersToOurs;
      });
      if (innerCleaned.length > 0) {
        cleaned.push({ ...block, hooks: innerCleaned });
      }
    }

    cleaned.push({ matcher: "", hooks: [{ type: "command", command: ourCommand }] });
    settings.hooks[event] = cleaned;
    if (foundOurs) replaced++;
    else added++;
  }

  return { settings, added, replaced };
}

function backupSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${settingsPath}.bak.${stamp}`;
  fs.copyFileSync(settingsPath, backupPath);
  return backupPath;
}

async function maybeWriteSettings(hookPath, autoYes) {
  const settingsPath = path.join(HOME, ".claude", "settings.json");

  let answer = "";
  if (autoYes) {
    answer = "y";
  } else {
    answer = await ask(
      `Merge these hooks into ${settingsPath} automatically? [y/N] `,
    );
  }
  const yes = /^(y|yes)$/i.test(answer);
  if (!yes) {
    console.log("");
    console.log("OK — paste the JSON above into ~/.claude/settings.json yourself.");
    return false;
  }

  // Read existing settings (or treat as empty if missing).
  let existing = {};
  if (fs.existsSync(settingsPath)) {
    let raw;
    try {
      raw = fs.readFileSync(settingsPath, "utf8");
    } catch (err) {
      console.error("");
      console.error(`Couldn't read ${settingsPath}: ${err.message}`);
      console.error("Paste the JSON above into the file by hand instead.");
      return false;
    }
    if (raw.trim().length > 0) {
      try {
        existing = JSON.parse(raw);
      } catch (err) {
        console.error("");
        console.error(`${settingsPath} doesn't parse as JSON (${err.message}).`);
        console.error("Refusing to overwrite — paste the JSON above by hand and fix any syntax issues.");
        return false;
      }
    }
  } else {
    // Make sure ~/.claude exists.
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const backupPath = backupSettings(settingsPath);
  const { settings, added, replaced } = mergeWaitingLoungeHooks(existing, hookPath);
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 });

  console.log("");
  if (backupPath) {
    console.log(`✓ Wrote ${settingsPath}.`);
    console.log(`  Backup of the previous version: ${backupPath}`);
  } else {
    console.log(`✓ Created ${settingsPath} (it didn't exist before).`);
  }
  if (replaced > 0 && added > 0) {
    console.log(`  Added ${added} hook entr${added === 1 ? "y" : "ies"}, replaced ${replaced}.`);
  } else if (replaced > 0) {
    console.log(`  Replaced ${replaced} existing waiting-lounge hook entr${replaced === 1 ? "y" : "ies"}.`);
  } else {
    console.log(`  Added ${added} hook entr${added === 1 ? "y" : "ies"}.`);
  }
  console.log("");
  console.log("If anything goes wrong, restore from the backup above (or just delete the");
  console.log("`hooks` block we added — Claude Code will fall back to its defaults).");
  return true;
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

async function cmdInstall(args) {
  const autoYes = args.includes("--write-settings") || args.includes("-y");
  const printOnly = args.includes("--print-only");

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
  console.log("Hook entries to add to ~/.claude/settings.json:");
  console.log("");
  console.log(JSON.stringify(settingsBlock(HOOK_PATH), null, 2));
  console.log("");

  let merged = false;
  if (!printOnly) {
    merged = await maybeWriteSettings(HOOK_PATH, autoYes);
  }

  if (!merged) {
    console.log("If your settings.json already has other top-level keys, merge the `hooks` field.");
    console.log("If `hooks` already has entries, add ours alongside (don't overwrite).");
    console.log("");
  }

  console.log("Pair your browser (one click, one time):");
  console.log("");
  console.log(`  ${frontendUrl}/pair?d=${deviceId}`);
  console.log("");
  console.log("Then verify with:");
  console.log("");
  console.log("  waiting-lounge test");
  console.log("");
  console.log("Start a Claude Code session as normal. The header badge in the lounge");
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
  console.log("  waiting-lounge install      Install the local hook. Prompts to merge into");
  console.log("                              ~/.claude/settings.json automatically (with backup).");
  console.log("                              Pass -y to skip the prompt, --print-only to never write.");
  console.log("  waiting-lounge play         Open the terminal lounge — find a match and play");
  console.log("                              Brain Bet without leaving your terminal.");
  console.log("  waiting-lounge dock         Open Claude Code on top + lounge strip on bottom in one");
  console.log("                              tmux window. Ctrl-L expands the strip. (Requires tmux.)");
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
      await cmdInstall(args);
      break;
    case "play":
      // Hand off to the ESM TUI entrypoint. The .mjs runs `render()` at
      // top level; ink + the socket connection keep the event loop alive
      // until the user presses Q (which calls useApp().exit()).
      await import("./play.mjs");
      break;
    case "dock":
      // Stage 6a — open a tmux session with claude in the top pane and
      // the lounge (`play.mjs --dock`) in a collapsed strip on the
      // bottom. Press Ctrl-L to expand. cli/dock.js is CJS; loading it
      // runs its dispatcher immediately and blocks until tmux exits.
      require("./dock.js");
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
