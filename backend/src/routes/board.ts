import { Router, type Request, type Response } from "express";
import { generateHandle } from "../lib/identity.js";
import { query } from "../db/index.js";

const MAX_BODY = 500;
const MAX_TAG = 64;
const HIDE_AT_REPORTS = 3;
const TTL_MS = 24 * 60 * 60 * 1000;

type DbPostRow = {
  id: string;
  handle: string;
  tag: string;
  body: string;
  created_at: Date;
  expires_at: Date;
  report_count: number;
  hidden: boolean;
};

type ApiPost = {
  id: string;
  handle: string;
  tag: string;
  body: string;
  createdAt: number;
  expiresAt: number;
  reportCount: number;
};

function rowToApi(r: DbPostRow): ApiPost {
  return {
    id: r.id,
    handle: r.handle,
    tag: r.tag,
    body: r.body,
    createdAt: r.created_at.getTime(),
    expiresAt: r.expires_at.getTime(),
    reportCount: r.report_count,
  };
}

const lastPostByIp = new Map<string, number>();
const POST_COOLDOWN_MS = 10_000;

export function createBoardRouter(): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    const tag = (req.query.tag as string | undefined)?.trim();
    try {
      const params: unknown[] = [];
      let where = "where hidden = false and expires_at > now()";
      if (tag) {
        params.push(tag);
        where += ` and tag = $${params.length}`;
      }
      const { rows } = await query<DbPostRow>(
        `select id, handle, tag, body, created_at, expires_at, report_count, hidden
           from board_posts ${where}
           order by created_at desc
           limit 200`,
        params,
      );
      res.json({ posts: rows.map(rowToApi) });
    } catch (err) {
      console.error("[board] GET failed", (err as Error).message);
      res.status(500).json({ error: "Could not load posts." });
    }
  });

  router.post("/", async (req: Request, res: Response) => {
    const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
    const now = Date.now();
    const last = lastPostByIp.get(ip) || 0;
    if (now - last < POST_COOLDOWN_MS) {
      return res
        .status(429)
        .json({ error: "Slow down — wait a few seconds before posting again." });
    }

    const tag = (req.body?.tag as string | undefined)?.toString().trim();
    const body = (req.body?.body as string | undefined)?.toString();

    if (!tag || tag.length > MAX_TAG) {
      return res.status(400).json({ error: "Missing or invalid tag." });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ error: "Body cannot be empty." });
    }
    if (body.length > MAX_BODY) {
      return res.status(400).json({ error: `Body too long (max ${MAX_BODY}).` });
    }

    lastPostByIp.set(ip, now);

    try {
      const handle = generateHandle();
      const expiresAt = new Date(now + TTL_MS);
      const { rows } = await query<DbPostRow>(
        `insert into board_posts (handle, tag, body, expires_at)
         values ($1, $2, $3, $4)
         returning id, handle, tag, body, created_at, expires_at, report_count, hidden`,
        [handle, tag, body, expiresAt],
      );
      const post = rows[0];
      log("post_created", { id: post.id, tag, len: body.length });
      res.json({ post: rowToApi(post) });
    } catch (err) {
      console.error("[board] POST failed", (err as Error).message);
      res.status(500).json({ error: "Could not save post." });
    }
  });

  router.post("/report", async (req: Request, res: Response) => {
    const id = (req.body?.id as string | undefined)?.toString();
    if (!id) return res.status(400).json({ error: "Missing id." });
    try {
      const { rows } = await query<{ report_count: number; hidden: boolean }>(
        `update board_posts
            set report_count = report_count + 1,
                hidden = (report_count + 1) >= $2
          where id = $1
          returning report_count, hidden`,
        [id, HIDE_AT_REPORTS],
      );
      if (rows.length === 0) return res.status(404).json({ error: "Post not found." });
      log("post_reported", { id, reportCount: rows[0].report_count, hidden: rows[0].hidden });
      res.json({ ok: true, hidden: rows[0].hidden });
    } catch (err) {
      console.error("[board] report failed", (err as Error).message);
      res.status(500).json({ error: "Could not record report." });
    }
  });

  return router;
}

export async function seedWelcomePosts(): Promise<void> {
  // Idempotent: only inserts if the table is empty.
  const { rows } = await query<{ c: string }>(
    "select count(*)::text as c from board_posts where expires_at > now() and hidden = false",
  );
  if (Number(rows[0]?.c || 0) > 0) return;

  const ttl = 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttl);
  const seeds = [
    {
      handle: "quiet-merge-117",
      tag: "Debugging",
      body: "Welcome. Posts vanish in 24h. Keep it short, keep it vague, no secrets.",
    },
    {
      handle: "loop-otter-204",
      tag: "Refactor",
      body: "Tiny win: I deleted three useEffects today. Still alive.",
    },
  ];
  for (const s of seeds) {
    await query(
      `insert into board_posts (handle, tag, body, expires_at) values ($1,$2,$3,$4)`,
      [s.handle, s.tag, s.body, expiresAt],
    );
  }
  log("board_seeded", { count: seeds.length });
}

function log(event: string, data: Record<string, unknown>) {
  console.log(`[${new Date().toISOString()}] ${event}`, JSON.stringify(data));
}
