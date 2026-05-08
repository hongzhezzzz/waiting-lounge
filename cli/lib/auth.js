// CLI auth bridge — token storage, refresh, and browser-pair flow.
//
// `getAccessToken({ onPairing, onPaired })` returns a usable Supabase
// access token, doing whichever of these is needed:
//
//   1. Read `~/.waiting-lounge/auth_token`. If access_token is still
//      good for ≥30s, return it.
//   2. If expired but refresh_token + supabase config are present,
//      hit Supabase REST `/auth/v1/token?grant_type=refresh_token` to
//      get a fresh access token. Persist the new tokens.
//   3. If no token on disk (or refresh failed), generate a 32B random
//      `code`, POST it to backend `/api/cli/start`, open the user's
//      browser to `<frontend>/cli-pair?code=<code>`, and poll
//      `/api/cli/poll?code=<code>` every 2s until "authorized" (or 5
//      min). On success, persist tokens + config and return.
//
// The token file is mode 0600 (readable only by the user).
//
// All HTTP is plain http/https (no axios). The CLI's only deps are
// what was added in 4a: ink, react, socket.io-client.

const fs = require("fs");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { exec } = require("child_process");
const config = require("./config");

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const REFRESH_LEEWAY_S = 30; // refresh if <30s left on access token

// ---------- token file I/O ----------

function readTokenFile() {
  if (!fs.existsSync(config.AUTH_TOKEN_PATH)) return null;
  try {
    const raw = fs.readFileSync(config.AUTH_TOKEN_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeTokenFile(obj) {
  config.ensureConfigDir();
  fs.writeFileSync(config.AUTH_TOKEN_PATH, JSON.stringify(obj, null, 2), {
    mode: 0o600,
  });
  // If the file already existed with looser perms, force tighten.
  try { fs.chmodSync(config.AUTH_TOKEN_PATH, 0o600); } catch {}
}

function clearTokenFile() {
  try { fs.unlinkSync(config.AUTH_TOKEN_PATH); } catch {}
}

// ---------- JWT exp extraction (no verification) ----------

function decodeJwtExp(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return 0;
    const padded = parts[1] + "===".slice((parts[1].length + 3) % 4);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(b64, "base64").toString("utf8");
    const payload = JSON.parse(json);
    return Number(payload.exp || 0);
  } catch {
    return 0;
  }
}

function tokenIsValid(accessToken) {
  if (!accessToken) return false;
  const exp = decodeJwtExp(accessToken);
  if (!exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return exp - nowSec > REFRESH_LEEWAY_S;
}

// ---------- HTTP helpers ----------

function httpRequest(method, urlString, { headers, body, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (err, result) => {
      if (finished) return;
      finished = true;
      if (err) reject(err);
      else resolve(result);
    };
    try {
      const url = new URL(urlString);
      const lib = url.protocol === "https:" ? https : http;
      const opts = {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + (url.search || ""),
        method,
        headers: { ...(headers || {}) },
        timeout: timeoutMs,
      };
      if (body != null) {
        opts.headers["Content-Length"] = Buffer.byteLength(body);
      }
      const req = lib.request(opts, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          finish(null, {
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      });
      req.on("error", (err) => finish(err));
      req.on("timeout", () => {
        try { req.destroy(); } catch {}
        finish(new Error("timeout"));
      });
      if (body != null) req.write(body);
      req.end();
    } catch (err) {
      finish(err);
    }
  });
}

// ---------- Supabase refresh ----------

async function refreshTokens(stored) {
  if (!stored.refreshToken || !stored.supabaseUrl || !stored.supabaseAnonKey) {
    return null;
  }
  const url = `${stored.supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`;
  try {
    const r = await httpRequest("POST", url, {
      headers: {
        "Content-Type": "application/json",
        apikey: stored.supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: stored.refreshToken }),
      timeoutMs: 8000,
    });
    if (r.status < 200 || r.status >= 300) return null;
    const j = JSON.parse(r.body);
    if (!j.access_token || !j.refresh_token) return null;
    const next = {
      ...stored,
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresIn: j.expires_in || 3600,
    };
    writeTokenFile(next);
    return next.accessToken;
  } catch {
    return null;
  }
}

// ---------- Browser-pair flow ----------

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? `open "${url}"` :
    platform === "win32" ? `start "" "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, () => {
    // Best-effort. If it fails, the caller already printed the URL so
    // the user can copy-paste manually.
  });
}

async function browserPairFlow({ onPairing }) {
  const code = crypto.randomBytes(32).toString("hex");
  const backendUrl = config.readBackendUrl();
  const frontendUrl = config.readFrontendUrl();

  // Tell the backend a code is pending.
  const startRes = await httpRequest("POST", `${backendUrl}/api/cli/start`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (startRes.status !== 204) {
    throw new Error(`/api/cli/start returned ${startRes.status}: ${startRes.body}`);
  }

  const browserUrl = `${frontendUrl}/cli-pair?code=${code}`;
  if (typeof onPairing === "function") {
    onPairing({ url: browserUrl, codeTail: code.slice(-6).toUpperCase() });
  }
  openBrowser(browserUrl);

  // Poll until authorized or timeout.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let pollRes;
    try {
      pollRes = await httpRequest(
        "GET",
        `${backendUrl}/api/cli/poll?code=${code}`,
        { timeoutMs: 6000 },
      );
    } catch {
      continue;
    }
    if (pollRes.status === 410) {
      throw new Error("Authorization code expired. Re-run `waiting-lounge play`.");
    }
    if (pollRes.status !== 200) continue;
    let parsed;
    try { parsed = JSON.parse(pollRes.body); } catch { continue; }
    if (parsed.status === "pending") continue;
    if (parsed.status === "authorized" && parsed.accessToken && parsed.refreshToken) {
      const stored = {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresIn: parsed.expiresIn || 3600,
        supabaseUrl: parsed.supabaseUrl || "",
        supabaseAnonKey: parsed.supabaseAnonKey || "",
        savedAt: Date.now(),
      };
      writeTokenFile(stored);
      return stored.accessToken;
    }
  }
  throw new Error("Authorization timed out after 5 minutes. Re-run `waiting-lounge play`.");
}

// ---------- public API ----------

/**
 * Returns a usable Supabase access token, prompting browser pair if needed.
 *
 * @param {Object} hooks
 * @param {(info: {url: string, codeTail: string}) => void} [hooks.onPairing]
 *   Called when a browser pair is starting (URL + last-6 of the code).
 *   The TUI uses this to switch the screen to "Authorize in browser…".
 * @returns {Promise<string>} access token (Supabase JWT)
 */
async function getAccessToken(hooks = {}) {
  const stored = readTokenFile();

  if (stored && tokenIsValid(stored.accessToken)) {
    return stored.accessToken;
  }

  if (stored && stored.refreshToken) {
    const refreshed = await refreshTokens(stored);
    if (refreshed) return refreshed;
    // Refresh failed — fall through to browser pair.
    clearTokenFile();
  }

  return browserPairFlow(hooks);
}

/** Exported for testing/inspection. */
module.exports = {
  getAccessToken,
  readTokenFile,
  writeTokenFile,
  clearTokenFile,
  decodeJwtExp,
  tokenIsValid,
};
