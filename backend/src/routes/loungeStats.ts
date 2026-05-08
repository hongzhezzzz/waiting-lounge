// Lightweight rollup endpoint for the homepage's live status cards
// and the lounge's recent-activity ticker. No auth required — counts
// of anonymous handles + public points + public board posts + game
// outcomes (already public via /api/leaderboard / /api/me).

import express, { type Request, type Response } from "express";
import { users, games } from "../state.js";
import { query } from "../db/index.js";

type GameEvent = {
  kind: "game";
  ts: number;
  gameType: string;
  outcome: "win" | "tie";
  winnerHandle: string | null;
  loserHandle: string | null;
};
type PostEvent = {
  kind: "post";
  ts: number;
  handle: string;
  tag: string;
  snippet: string;
};
type RecentEvent = GameEvent | PostEvent;

const POST_SNIPPET_MAX = 80;

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

    let recentEvents: RecentEvent[] = [];
    try {
      const recentGames = await query<{
        outcome: "win" | "tie";
        game_type: string;
        ended_at: Date;
        winner_id: string | null;
        player_a_id: string;
        player_a_handle: string;
        player_b_handle: string;
      }>(
        `select gr.outcome, gr.game_type, gr.ended_at, gr.winner_id,
                gr.player_a_id, a.handle as player_a_handle, b.handle as player_b_handle
           from game_rounds gr
           join users a on a.id = gr.player_a_id
           join users b on b.id = gr.player_b_id
          where gr.outcome in ('win', 'tie') and gr.ended_at is not null
          order by gr.ended_at desc
          limit 5`,
      );
      const recentPosts = await query<{
        handle: string;
        tag: string;
        body: string;
        created_at: Date;
      }>(
        `select handle, tag, body, created_at
           from board_posts
          where hidden = false and expires_at > now()
          order by created_at desc
          limit 3`,
      );
      const games: GameEvent[] = recentGames.rows.map((row) => {
        const winnerIsA = row.winner_id === row.player_a_id;
        return {
          kind: "game",
          ts: new Date(row.ended_at).getTime(),
          gameType: row.game_type,
          outcome: row.outcome,
          winnerHandle:
            row.outcome === "tie"
              ? null
              : winnerIsA
                ? row.player_a_handle
                : row.player_b_handle,
          loserHandle:
            row.outcome === "tie"
              ? null
              : winnerIsA
                ? row.player_b_handle
                : row.player_a_handle,
        };
      });
      const posts: PostEvent[] = recentPosts.rows.map((row) => ({
        kind: "post",
        ts: new Date(row.created_at).getTime(),
        handle: row.handle,
        tag: row.tag,
        snippet:
          row.body.length > POST_SNIPPET_MAX
            ? row.body.slice(0, POST_SNIPPET_MAX - 3) + "..."
            : row.body,
      }));
      recentEvents = [...games, ...posts].sort((a, b) => b.ts - a.ts).slice(0, 8);
    } catch (err) {
      console.error("[lounge_stats] recent events query failed", (err as Error).message);
    }

    res.json({ idleCount, inGameCount, postsLastHour, topThree, recentEvents });
  });

  return router;
}
