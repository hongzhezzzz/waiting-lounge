// Lightweight rollup endpoint for the homepage's live status cards
// and (later, in 3a.3) the lounge's ticker. No auth required —
// counts of anonymous handles + public points + public board posts.

import express, { type Request, type Response } from "express";
import { users, games } from "../state.js";
import { query } from "../db/index.js";

export function createLoungeStatsRouter() {
  const router = express.Router();

  router.get("/stats", async (_req: Request, res: Response) => {
    // Idle = signed-in user, not currently in a game room. Dedupe by
    // userId so multi-tab same account counts once.
    const idleUserIds = new Set<string>();
    for (const u of users.values()) {
      if (u.userId && !u.roomId) idleUserIds.add(u.userId);
    }
    const idleCount = idleUserIds.size;

    // In-progress games (distinct unresolved games — each has 2 players).
    let inGameCount = 0;
    for (const g of games.values()) {
      if (!g.resolved) inGameCount++;
    }

    let postsLastHour = 0;
    try {
      const r = await query<{ n: string }>(
        `select count(*)::text as n
           from board_posts
          where created_at > now() - interval '1 hour'
            and hidden = false
            and expires_at > now()`,
      );
      postsLastHour = Number(r.rows[0]?.n ?? 0);
    } catch (err) {
      console.error("[lounge_stats] posts query failed", (err as Error).message);
    }

    let topThree: Array<{ handle: string; points: number; rank: number }> = [];
    try {
      const r = await query<{ handle: string; points: number }>(
        `select handle, points
           from users
          order by points desc, handle asc
          limit 3`,
      );
      topThree = r.rows.map((row, i) => ({
        handle: row.handle,
        points: row.points,
        rank: i + 1,
      }));
    } catch (err) {
      console.error("[lounge_stats] leaderboard query failed", (err as Error).message);
    }

    res.json({ idleCount, inGameCount, postsLastHour, topThree });
  });

  return router;
}
