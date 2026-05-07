// REST endpoints for the signed-in user: balance, profile, device bind.
// All endpoints require a valid Supabase JWT in Authorization: Bearer.

import express, { type Request, type Response, type NextFunction } from "express";
import { verifySupabaseJwt } from "../auth/supabase.js";
import { getOrCreateUser, getBalance, bindDevice } from "../auth/userStore.js";

const DEVICE_ID_PATTERN = /^[a-f0-9-]{8,64}$/i;

type AuthedRequest = Request & {
  auth?: { userId: string; email: string };
};

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  try {
    const claims = await verifySupabaseJwt(match[1]);
    const user = await getOrCreateUser(claims.email);
    req.auth = { userId: user.id, email: user.email };
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function createMeRouter() {
  const router = express.Router();

  router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
    const user = await getOrCreateUser(req.auth!.email);
    res.json({
      id: user.id,
      email: user.email,
      handle: user.handle,
      points: user.points,
    });
  });

  router.get("/balance", requireAuth, async (req: AuthedRequest, res: Response) => {
    const points = await getBalance(req.auth!.userId);
    res.json({ points: points ?? 0 });
  });

  router.post("/bind-device", requireAuth, async (req: AuthedRequest, res: Response) => {
    const deviceId = String(req.body?.deviceId || "").trim();
    if (!DEVICE_ID_PATTERN.test(deviceId)) {
      res.status(400).json({ error: "Invalid device id" });
      return;
    }
    const result = await bindDevice(req.auth!.userId, deviceId);
    if (!result.ok) {
      res.status(409).json({ error: result.reason });
      return;
    }
    res.json({ ok: true, bound: result.bound });
  });

  return router;
}
