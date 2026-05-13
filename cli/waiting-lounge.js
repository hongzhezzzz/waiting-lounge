#!/usr/bin/env node

// waiting-lounge CLI — installs and configures the local hook.
//
// Subcommands:
//   install      copy hook script + device id, auto-merge settings.json,
//                auto-open the pair URL in the browser. Print-only mode
//                with --print-only.
//   pair         print the one-time browser pairing URL (and try to open it)
//   status       show what's installed and reachable
//   test         POST a fake waiting event to the backend and report
//   uninstall    remove ~/.waiting-lounge/ and print the settings to delete
//
// Stage 9 — frictionless one-line install. The CLI auto-merges its 4 hook
// entries into ~/.claude/settings.json by default (with timestamped backup),
// auto-opens the pair URL, and prints the URL as fallback. Opt out with
// --print-only (no settings write, no browser open) or --no-open (no browser).
// We override the roadmap §9 preference here because:
//   - The privacy invariant is unchanged (hook only ever sends 4 fields).
//   - The user explicitly asked for one-line install with no manual paste.
//   - A timestamped backup is written before any edit, so rollback is one cp.

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const readline = require("readline");
const { spawn, execFileSync } = require("child_process");
const { hasTmux, hasCmd, detectLinuxPackageManager } = require("./lib/tmux.js");

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

async function maybeWriteSettings(hookPath, mode) {
  // mode: "auto" (default) — write without prompting
  //       "ask"            — prompt y/N
  //       "skip"           — don't write
  const settingsPath = path.join(HOME, ".claude", "settings.json");

  if (mode === "skip") {
    return false;
  }

  if (mode === "ask") {
    const answer = await ask(
      `Merge these hooks into ${settingsPath} automatically? [Y/n] `,
    );
    // Default to yes when user just presses Enter.
    const no = /^(n|no)$/i.test(answer);
    if (no) {
      console.log("");
      console.log("OK — paste the JSON above into ~/.claude/settings.json yourself.");
      return false;
    }
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

// True when the machine has no graphical display reachable. We use this to
// suppress auto-opening the browser on SSH / Docker / CI / headless servers,
// where xdg-open either no-ops or emits a confusing "no method available"
// stderr line. The URL is always printed too, so the user copy-pastes it
// into their LOCAL browser.
//
// Rules:
//   - macOS, native Windows: never headless (always has a desktop session).
//   - WSL: never headless (we route through cmd.exe → Windows host browser).
//   - $BROWSER set: never headless (user explicitly wants browser opens).
//   - Linux native: headless when both $DISPLAY (X11) and $WAYLAND_DISPLAY
//     are unset. SSH with X-forwarding sets $DISPLAY automatically, so it
//     is correctly treated as non-headless.
function isHeadless() {
  const platform = process.platform;
  if (platform === "darwin" || platform === "win32") return false;
  const isWSL = Boolean(
    process.env.WSL_DISTRO_NAME ||
      process.env.WSLENV ||
      (process.env.WSL_INTEROP && process.env.WSL_INTEROP.length > 0),
  );
  if (isWSL) return false;
  if (process.env.BROWSER) return false;
  return !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
}

// Try to open a URL in the user's default browser. Never throws — the URL
// is always printed too, so if this no-ops the user can still click the
// printed link. Returns { tried, command, reason } so the caller can vary
// the printed message: when reason === "headless", we explain that we
// skipped on purpose; otherwise we say we tried.
function openBrowser(url) {
  if (isHeadless()) {
    return { tried: false, command: null, reason: "headless" };
  }
  const platform = process.platform;
  let cmd = null;
  let args = [];
  try {
    const isWSL = Boolean(
      process.env.WSL_DISTRO_NAME ||
        process.env.WSLENV ||
        (process.env.WSL_INTEROP && process.env.WSL_INTEROP.length > 0),
    );
    if (platform === "darwin") {
      cmd = "open";
      args = [url];
    } else if (platform === "win32") {
      cmd = "cmd";
      args = ["/c", "start", "", url];
    } else if (isWSL) {
      cmd = "cmd.exe";
      args = ["/c", "start", "", url];
    } else if (process.env.BROWSER) {
      cmd = process.env.BROWSER;
      args = [url];
    } else {
      cmd = "xdg-open";
      args = [url];
    }
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {}); // swallow ENOENT — URL is printed anyway
    child.unref();
    return { tried: true, command: cmd, reason: null };
  } catch {
    return { tried: false, command: null, reason: "spawn-failed" };
  }
}

// Bundle tmux into `waiting-lounge install` (Stage 10a). The dock command
// is much smoother with tmux than with the zero-dep multiplexer fallback,
// so we offer to set it up at install time so users don't have to discover
// the dependency themselves.
//
// Behavior by platform:
//   - macOS + brew: auto-runs `brew install tmux` (no sudo needed for
//     user-owned brew prefix). ~15s on first install; brew detects and
//     skips on subsequent runs.
//   - macOS without brew: prints a one-line "install brew, then this"
//     hint, no shell-out.
//   - Linux/WSL: prints `sudo apt/dnf/pacman/… install tmux` — never
//     auto-runs sudo. The user types/copies the command themselves.
//   - Windows: prints "use WSL"; tmux is unavailable natively.
//
// Skips entirely when tmux is already installed, OR when --no-install-tmux
// is passed.
function ensureTmux(autoInstall) {
  if (!autoInstall) return;
  if (hasTmux()) return;
  const platform = process.platform;
  if (platform === "darwin") {
    if (hasCmd("brew")) {
      console.log("");
      console.log("Installing tmux (used by `waiting-lounge dock` for the polished split-screen)…");
      try {
        execFileSync("brew", ["install", "tmux"], { stdio: "inherit" });
        console.log("✓ tmux installed.");
      } catch {
        console.log("⚠ brew install tmux failed. You can retry manually: brew install tmux");
        console.log("  (The lounge still works without tmux — the dock falls back to a zero-dep multiplexer.)");
      }
    } else {
      console.log("");
      console.log("Optional — install tmux for the smoothest `dock` experience:");
      console.log("   1. Install Homebrew: https://brew.sh");
      console.log("   2. brew install tmux");
      console.log("(The lounge still works without tmux — the dock falls back to a zero-dep multiplexer.)");
    }
    return;
  }
  if (platform === "linux") {
    const pm = detectLinuxPackageManager();
    if (pm) {
      console.log("");
      console.log("Optional — install tmux for the smoothest `dock` experience:");
      console.log(`   ${pm.install}`);
    } else {
      console.log("");
      console.log("Optional — install tmux via your distro's package manager for the smoothest `dock` experience.");
    }
    console.log("(The lounge still works without tmux — the dock falls back to a zero-dep multiplexer.)");
    return;
  }
  if (platform === "win32") {
    console.log("");
    console.log("Heads-up — tmux is not available on native Windows.");
    console.log("For the polished `dock` experience, run inside WSL2: https://learn.microsoft.com/windows/wsl");
    console.log("(`waiting-lounge play` works directly from native Windows in a second terminal tab.)");
  }
}

// --- subcommands ---

async function cmdInstall(args) {
  // Mode for settings.json:
  //   default: auto-merge (no prompt)
  //   --print-only / --no-write: don't touch settings.json
  //   --ask: prompt y/N (legacy behavior for cautious users)
  let settingsMode = "auto";
  if (args.includes("--print-only") || args.includes("--no-write")) {
    settingsMode = "skip";
  } else if (args.includes("--ask")) {
    settingsMode = "ask";
  }
  const openPair = !args.includes("--no-open") && !args.includes("--print-only");
  // `--no-install-tmux` skips the brew-install / sudo-hint step. `--print-only`
  // also implies skip — that mode is for users who want the JSON to paste
  // manually and no other side effects.
  const installTmux = !args.includes("--no-install-tmux") && !args.includes("--print-only");

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
  const pairUrl = `${frontendUrl}/pair?d=${deviceId}`;

  // Best-effort backend warmup. Render's free tier sleeps after ~15 min;
  // firing a /health ping at install start means the backend is usually
  // warm by the time the user clicks the pair URL and runs `test`. Fire
  // and forget — never blocks the install, never reports errors.
  getJson(`${backendUrl}/health`, 30000).catch(() => {});

  console.log("");
  console.log("☕ Waiting Lounge installed.");
  console.log("");
  console.log(`   hook script   ${HOOK_PATH}`);
  console.log(`   device id     ${deviceId.slice(0, 8)}…  (private, at ${DEVICE_ID_PATH})`);
  console.log(`   backend       ${backendUrl}`);
  console.log(`   frontend      ${frontendUrl}`);
  console.log("");
  console.log("─────────────────────────────────────────────────────────────");
  console.log("");

  // Step 1 — settings.json.
  if (settingsMode === "skip") {
    console.log("Step 1 — Hook entries to add to ~/.claude/settings.json:");
    console.log("");
    console.log(JSON.stringify(settingsBlock(HOOK_PATH), null, 2));
    console.log("");
    console.log("(--print-only: not touching your settings.json. Merge the `hooks` field");
    console.log(" yourself; if `hooks` already has entries, add ours alongside.)");
    console.log("");
  } else {
    console.log("Step 1 — Wire the Claude Code hooks");
    console.log("");
    const merged = await maybeWriteSettings(HOOK_PATH, settingsMode);
    if (!merged) {
      // User declined the prompt — print the JSON to paste.
      console.log("Hook entries to add to ~/.claude/settings.json:");
      console.log("");
      console.log(JSON.stringify(settingsBlock(HOOK_PATH), null, 2));
      console.log("");
    }
  }

  // Step 1.5 — optional tmux bundle (Stage 10a). Runs after settings.json
  // so the hook works even if the user CTRL-Cs out of the brew install,
  // and before the pair URL so the printed output flows top-to-bottom.
  ensureTmux(installTmux);

  // Step 2 — pair URL.
  console.log("Step 2 — Pair your browser (one click, one time)");
  console.log("");
  console.log(`   ${pairUrl}`);
  console.log("");

  if (openPair) {
    const { tried, command, reason } = openBrowser(pairUrl);
    if (tried) {
      console.log(`   Opening this URL in your browser (via \`${command}\`)…`);
      console.log("   If nothing opens, copy the link above into any browser.");
      console.log("");
    } else if (reason === "headless") {
      console.log("   No graphical display detected (SSH / container / headless).");
      console.log("   Copy the link above into a browser on your local machine.");
      console.log("");
    }
  }

  // Step 3 — verify.
  console.log("Step 3 — Verify it works");
  console.log("");
  console.log("   waiting-lounge test");
  console.log("");
  console.log("Then start Claude Code as normal — the lounge badge will flip from");
  console.log(`"Claude is working" → "may be done" automatically.`);
  console.log("");
  console.log("Optional next steps:");
  console.log("   ·  waiting-lounge dock      claude on top + lounge below in one window");
  console.log("   ·  waiting-lounge attach    add a lounge strip to an existing tmux session");
  console.log("   ·  waiting-lounge play      full-screen lounge (no claude alongside)");
  console.log("   ·  Statusline integration   see docs/statusline-setup.md");
  console.log("");
}

function cmdPair(args) {
  const deviceId = readOrCreateDeviceId();
  const frontendUrl = readFrontendUrl();
  const pairUrl = `${frontendUrl}/pair?d=${deviceId}`;
  console.log(pairUrl);
  if (!args.includes("--no-open")) {
    openBrowser(pairUrl);
  }
}

async function cmdStatus() {
  const dirExists = fs.existsSync(CONFIG_DIR);
  const hookExists = fs.existsSync(HOOK_PATH);
  const idExists = fs.existsSync(DEVICE_ID_PATH);
  const backendUrl = readBackendUrl();
  const frontendUrl = readFrontendUrl();

  console.log("");
  console.log("☕ Waiting Lounge — status");
  console.log("");
  console.log(`   config dir     ${dirExists ? "✓" : "✗"}   ${CONFIG_DIR}`);
  console.log(`   hook script    ${hookExists ? "✓" : "✗"}   ${HOOK_PATH}`);
  console.log(`   device id      ${idExists ? "✓ " + readOrCreateDeviceId().slice(0, 8) + "…" : "✗ not found"}`);
  console.log(`   backend        ${backendUrl}`);
  console.log(`   frontend       ${frontendUrl}`);

  // Ping the backend. Free-tier cold-start retry: fast attempt first,
  // then a longer one if the first looked like a wake-up timeout.
  let health = await getJson(`${backendUrl}/health`, 4000);
  if (!health.ok && looksLikeColdStart(health)) {
    console.log(`   backend reach  · waking from sleep (this can take up to 45s)…`);
    health = await getJson(`${backendUrl}/health`, 45000);
  }
  if (health.ok) {
    console.log(`   backend reach  ✓   ${health.status} OK`);
  } else {
    console.log(`   backend reach  ✗   ${health.error || health.status}`);
  }

  // Look at ~/.claude/settings.json for our hook entries.
  const settingsPath = path.join(HOME, ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const txt = fs.readFileSync(settingsPath, "utf8");
      const hookHit = txt.includes(HOOK_PATH);
      console.log(`   settings.json  ${hookHit ? "✓ hooks wired" : "✗ no waiting-lounge hooks"}   ${settingsPath}`);
    } catch (err) {
      console.log(`   settings.json  ✗ unreadable (${err.message})`);
    }
  } else {
    console.log(`   settings.json  ✗ not found   ${settingsPath}`);
  }

  console.log("");
}

// The backend (currently Render free tier) sleeps after ~15 minutes of
// inactivity. The first request after sleep takes 30–50 seconds for the
// container to wake. Without handling this, a brand-new user's first
// `waiting-lounge test` looks like a broken install. We do a fast attempt
// (5s) for the warm-backend case, then print a clear "warming up" message
// and retry once with a generous timeout.
function looksLikeColdStart(result) {
  if (result.ok) return false;
  if (result.error === "timeout") return true;
  if (typeof result.status === "number" && result.status >= 502 && result.status <= 504) return true;
  // ECONNRESET / ECONNREFUSED also happen during the wake window.
  if (typeof result.error === "string" && /ECONNRESET|ECONNREFUSED|socket hang up/.test(result.error)) return true;
  return false;
}

async function postWithColdStartHandling(url, payload) {
  const fast = await postJson(url, payload, 5000);
  if (fast.ok || !looksLikeColdStart(fast)) return fast;
  console.log("  · Backend may be waking up from sleep (free tier sleeps after ~15 min idle).");
  console.log("  · Retrying with a longer timeout — this can take up to 45 seconds…");
  return postJson(url, payload, 45000);
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
  const result = await postWithColdStartHandling(
    `${backendUrl}/api/agent-event`,
    {
      anonymousDeviceId: deviceId,
      status: "waiting",
      client: "claude-code",
      timestamp: Date.now(),
    },
  );

  if (!result.ok) {
    console.log(`  ✗ Couldn't reach the backend (${result.error || result.status}).`);
    console.log("");
    console.log("Things to check:");
    console.log("  - Are you online?");
    console.log(`  - Is the backend URL correct? (${backendUrl})`);
    console.log(`  - Try opening ${backendUrl}/health in your browser.`);
    console.log("  - If you just installed, wait ~60s and retry — the free-tier backend");
    console.log("    sometimes takes longer to wake from sleep.");
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
  console.log("☕ Waiting Lounge — companion app for Claude Code");
  console.log("   play while your agent works");
  console.log("");
  console.log("Get started");
  console.log("   waiting-lounge install         wire hooks into ~/.claude/settings.json + open pair URL");
  console.log("   waiting-lounge dock            claude on top + lounge below in one terminal window");
  console.log("");
  console.log("Open the lounge");
  console.log("   waiting-lounge play            full-screen lounge (no claude alongside)");
  console.log("   waiting-lounge dock            new terminal session, claude top + lounge bottom");
  console.log("                                  Ctrl-L toggles strip ↔ ~30% pane");
  console.log("                                  Uses tmux if available; otherwise zero-dep PTY mux.");
  console.log("                                  --no-tmux forces the multiplexer.");
  console.log("   waiting-lounge attach          add a lounge strip to the CURRENT tmux session");
  console.log("                                  (run from `! waiting-lounge attach` inside claude)");
  console.log("");
  console.log("Integrations");
  console.log("   waiting-lounge statusline      one-line lounge state for Claude Code's statusline");
  console.log("                                  (see docs/statusline-setup.md to wire it in)");
  console.log("");
  console.log("Diagnostics");
  console.log("   waiting-lounge status          show what's installed + check backend reachability");
  console.log("   waiting-lounge test            send a fake event; print what backend received");
  console.log("   waiting-lounge pair            print the one-time browser pairing URL");
  console.log("");
  console.log("Maintenance");
  console.log("   waiting-lounge install         default: auto-wire settings.json (with backup) + open browser");
  console.log("   waiting-lounge install --ask         prompt before touching settings.json");
  console.log("   waiting-lounge install --no-open     skip auto-opening the pair URL");
  console.log("                                        (also skipped automatically on headless boxes)");
  console.log("   waiting-lounge install --no-install-tmux  skip the optional brew install tmux step");
  console.log("   waiting-lounge install --print-only  print JSON only, never touch settings.json");
  console.log("   waiting-lounge uninstall       remove ~/.waiting-lounge/   (--force to skip prompt)");
  console.log("   waiting-lounge --version       print package version");
  console.log("");
  console.log("Privacy promise");
  console.log("   The hook never sends prompts, code, paths, transcripts, or tool I/O.");
  console.log("   It only sends an anonymous device id and one of: waiting · needs_attention · done.");
  console.log("   Read it yourself: cli/lib/config.js · local-hook/hook.js (~80 lines, no obfuscation).");
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
    case "attach":
      // Stage 6d — add a lounge pane to the CURRENT tmux session. Works
      // mid-session, no claude restart. Run via `! waiting-lounge attach`
      // from inside claude (if claude is inside tmux) or from any other
      // pane in the same tmux session.
      require("./attach.js");
      break;
    case "statusline":
      // Stage 6b — print one-line lounge state for Claude Code's
      // statusline (paste settings.json block from
      // docs/statusline-setup.md to wire it in).
      require("./statusline.js");
      break;
    case "pair":
      cmdPair(args);
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
    case "version":
    case "--version":
    case "-v":
      console.log(require("../package.json").version);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error('Run "waiting-lounge help" for the list.');
      process.exit(1);
  }
})();
