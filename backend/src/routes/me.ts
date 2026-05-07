// REST endpoints for the signed-in user: balance, profile, device bind.
// All endpoints require a valid Supabase JWT in Authorization: Bearer.

import express, { type Request, type Response, type NextFunction } from "express";
import { verifySupabaseJwt } from "../auth/supabase.js";
import { getOrCreateUser, getBalance, bindDevice, getUserById, applyDailyRefill } from "../auth/userStore.js";
import { query } from "../db/index.js";

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
    // Refill is only attempted on this endpoint so the toast on /me sees
    // the credit. Other endpoints just read.
    const refilledAmount = await applyDailyRefill(req.auth!.userId);
    const user = refilledAmount > 0
      ? await getUserById(req.auth!.userId)
      : await getOrCreateUser(req.auth!.email);
    if (!user) {
      res.status(500).json({ error: "User vanished mid-refill" });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      handle: user.handle,
      points: user.points,
      refilledAmount,
    });
  });

  router.get("/game-history", requireAuth, async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const raw = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 100) : 20;

    // Join game_rounds to users twice to resolve both player handles.
    // From the requester's perspective: opponentHandle is "the OTHER player".
    type Row = {
      id: string;
      game_type: string;
      round_subtype: string | null;
      duration_min: number;
      ante: number;
      player_a_id: string;
      player_b_id: string;
      winner_id: string | null;
      outcome: string;
      started_at: string;
      ended_at: string | null;
      a_handle: string;
      b_handle: string;
    };
    const rows = await query<Row>(
      `select gr.id, gr.game_type, gr.round_subtype, gr.duration_min, gr.ante,
              gr.player_a_id, gr.player_b_id, gr.winner_id, gr.outcome,
              gr.started_at, gr.ended_at,
              a.handle as a_handle, b.handle as b_handle
         from game_rounds gr
         join users a on a.id = gr.player_a_id
         join users b on b.id = gr.player_b_id
        where gr.player_a_id = $1 or gr.player_b_id = $1
        order by gr.started_at desc
        limit $2`,
      [userId, limit],
    );

    res.json({
      games: rows.rows.map((r) => {
        const meIsA = r.player_a_id === userId;
        const opponentHandle = meIsA ? r.b_handle : r.a_handle;
        const didIWin = r.outcome === "win" && r.winner_id === userId;
        return {
          id: r.id,
          gameType: r.game_type,
          roundSubtype: r.round_subtype,
          durationMin: r.duration_min,
          ante: r.ante,
          opponentHandle,
          outcome: r.outcome, // "win" | "tie" | "aborted" | "in_progress"
          didIWin,
          startedAt: r.started_at,
          endedAt: r.ended_at,
        };
      }),
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
