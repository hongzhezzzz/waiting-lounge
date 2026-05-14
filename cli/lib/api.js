"use strict";

// Tiny JSON fetch helper for the read-only TUI scenes (board, leaderboard,
// profile — Stage 11b). Node 18+ ships global `fetch` + `AbortController`,
// so there's no dependency here. Returns a uniform { ok, status, data,
// error } shape so callers don't have to try/catch.
//
// The backend (Render free tier) sleeps after ~15 min idle; the first
// request can take 30-50s. We use a generous timeout and let the caller
// show a "waking up" hint if the first attempt is slow.

async function fetchJson(url, { token, timeoutMs = 40000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers, signal: controller.signal });
    let data = null;
    try {
      data = await res.json();
    } catch {
      // Non-JSON body — leave data null, surface the status.
    }
    if (!res.ok) {
      const msg =
        (data && (data.error || data.message)) || `Request failed (${res.status})`;
      return { ok: false, status: res.status, data, error: msg };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: null,
      error: aborted ? "Timed out — the backend may be waking up. Press R to retry." : (err && err.message) || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchJson };
