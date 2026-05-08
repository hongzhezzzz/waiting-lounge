// Shared CLI configuration helpers — used by both waiting-lounge.js (CJS)
// and play.mjs (ESM). ESM imports the default via:
//   import config from "./lib/config.js";
//
// Lifted from cli/waiting-lounge.js so the install/play paths read the
// same on-disk state without duplication.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_BACKEND = "https://waiting-lounge.onrender.com";
const DEFAULT_FRONTEND = "https://waiting-lounge.vercel.app";
const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, ".waiting-lounge");
const HOOK_PATH = path.join(CONFIG_DIR, "hook.js");
const DEVICE_ID_PATH = path.join(CONFIG_DIR, "device_id");
const BACKEND_URL_PATH = path.join(CONFIG_DIR, "backend_url");
const FRONTEND_URL_PATH = path.join(CONFIG_DIR, "frontend_url");
const AUTH_TOKEN_PATH = path.join(CONFIG_DIR, "auth_token");

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

module.exports = {
  DEFAULT_BACKEND,
  DEFAULT_FRONTEND,
  HOME,
  CONFIG_DIR,
  HOOK_PATH,
  DEVICE_ID_PATH,
  BACKEND_URL_PATH,
  FRONTEND_URL_PATH,
  AUTH_TOKEN_PATH,
  ensureConfigDir,
  readOrCreateDeviceId,
  readBackendUrl,
  readFrontendUrl,
  writeBackendUrlIfMissing,
  writeFrontendUrlIfMissing,
};
