// CLI auth bridge — short-lived browser code-exchange.
//
// Flow:
//   1. CLI generates a random code (32 bytes hex) and POSTs /api/cli/start.
//   2. CLI opens the user's browser to <frontend>/cli-pair?code=<code>.
//   3. Browser (signed-in user) POSTs /api/cli/finalize with the code +
//      its current Supabase access + refresh tokens.
//   4. CLI polls /api/cli/poll?code=<code> every ~2s until the entry is
//      "authorized" (gets the tokens) or expires.
//
// Codes live in memory only with a 5-minute TTL. Lost on Render
// cold-start, which is fine — the failure mode is "click Authorize again".
//
// Security model:
//   - Codes are 32B hex (256 bits of entropy) — unguessable.
//   - /finalize requires a valid Supabase Bearer JWT; only an authenticated
//     browser session can authorize a code.
//   - Codes are single-use: deleted on successful poll retrieval.
//   - 5-minute TTL prevents abandoned codes from accumulating.
//   - Hard cap (1000) prevents memory exhaustion.

import express, { type Request, type Response, type NextFunction } from "express";
import { verifySupabaseJwt } from "../auth/supabase.js";

const CODE_PATTERN = /^[a-f0-9]{32,128}$/i;
const TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 1000;

type Pending = {
  code: string;
  status: "pending" | "authorized";
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  // Supabase public config — needed by the CLI to refresh the access
  // token after it expires (~1h). Both values are NEXT_PUBLIC_* (truly
  // public), so it's safe to pass them through this exchange.
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  createdAt: number;
};

const exchanges = new Map<string, Pending>();

function gc() {
  const now = Date.now();
  for (const [k, v] of exchanges) {
    if (now - v.createdAt > TTL_MS) exchanges.delete(k);
  }
}

type AuthedRequest = Request & {
  auth?: { userSub: string; email: string };
};

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: "missing_bearer" });
    return;
  }
  try {
    const claims = await verifySupabaseJwt(match[1]);
    req.auth = { userSub: claims.userSub, email: claims.email };
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

export function createCliAuthRouter() {
  const router = express.Router();

  // Stage 10c — terminal OTP. Returns the publicly-safe Supabase URL +
  // anon key so the CLI can hit Supabase's /auth/v1/otp + /auth/v1/verify
  // directly. Both values are intended to be public (same ones embedded
  // in every browser bundle); we centralize them here so the CLI doesn't
  // have to hardcode environment-specific URLs.
  router.get("/auth/config", (_req: Request, res: Response) => {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
    if (!supabaseUrl || !supabaseAnonKey) {
      res.status(503).json({
        error: "supabase_not_configured",
        message: "Server is missing SUPABASE_URL or SUPABASE_ANON_KEY. Use the browser pair flow.",
      });
      return;
    }
    res.json({ supabaseUrl, supabaseAnonKey });
  });

  router.post("/start", (req: Request, res: Response) => {
    const code = String(req.body?.code || "");
    if (!CODE_PATTERN.test(code)) {
      res.status(400).json({ error: "invalid_code_format" });
      return;
    }
    gc();
    if (exchanges.size >= MAX_PENDING) {
      res.status(503).json({ error: "too_many_pending" });
      return;
    }
    if (!exchanges.has(code)) {
      exchanges.set(code, { code, status: "pending", createdAt: Date.now() });
    }
    res.status(204).end();
  });

  router.post("/finalize", requireAuth, (req: AuthedRequest, res: Response) => {
    const code = String(req.body?.code || "");
    const accessToken = String(req.body?.accessToken || "");
    const refreshToken = String(req.body?.refreshToken || "");
    const expiresIn = Number(req.body?.expiresIn || 3600);
    const supabaseUrl = String(req.body?.supabaseUrl || "");
    const supabaseAnonKey = String(req.body?.supabaseAnonKey || "");
    if (!CODE_PATTERN.test(code) || !accessToken || !refreshToken) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    gc();
    const entry = exchanges.get(code);
    if (!entry) {
      res.status(410).json({ error: "code_expired_or_unknown" });
      return;
    }
    if (entry.status === "authorized") {
      res.status(409).json({ error: "already_authorized" });
      return;
    }
    entry.status = "authorized";
    entry.accessToken = accessToken;
    entry.refreshToken = refreshToken;
    entry.expiresIn = expiresIn;
    entry.supabaseUrl = supabaseUrl;
    entry.supabaseAnonKey = supabaseAnonKey;
    res.status(204).end();
  });

  router.get("/poll", (req: Request, res: Response) => {
    const code = String(req.query?.code || "");
    if (!CODE_PATTERN.test(code)) {
      res.status(400).json({ error: "invalid_code_format" });
      return;
    }
    gc();
    const entry = exchanges.get(code);
    if (!entry) {
      res.status(410).json({ error: "code_expired_or_unknown" });
      return;
    }
    if (entry.status === "pending") {
      res.json({ status: "pending" });
      return;
    }
    // Authorized: single-use, delete on retrieval.
    exchanges.delete(code);
    res.json({
      status: "authorized",
      accessToken: entry.accessToken,
      refreshToken: entry.refreshToken,
      expiresIn: entry.expiresIn,
      supabaseUrl: entry.supabaseUrl,
      supabaseAnonKey: entry.supabaseAnonKey,
    });
  });

  return router;
}
