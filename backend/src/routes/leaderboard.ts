// Public leaderboard — top N users by points. No auth required since
// handles are anonymous and points are public-by-design (the lounge has
// no real identity beyond an opaque handle).

import express, { type Request, type Response } from "express";
import { query } from "../db/index.js";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export function createLeaderboardRouter() {
  const router = express.Router();

  router.get("/", async (req: Request, res: Response) => {
    const raw = Number(req.query.limit ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_LIMIT) : DEFAULT_LIMIT;

    const rows = await query<{ handle: string; points: number; rank: number }>(
      `select handle, points,
              row_number() over (order by points desc, handle asc) as rank
         from users
        order by points desc, handle asc
        limit $1`,
      [limit],
    );

    res.json({
      entries: rows.rows.map((r) => ({
        handle: r.handle,
        points: r.points,
        rank: Number(r.rank),
      })),
    });
  });

  return router;
}
