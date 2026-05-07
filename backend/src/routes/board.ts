import { Router, type Request, type Response } from "express";
import { v4 as uuid } from "uuid";
import { boardPosts, type BoardPost } from "../state.js";
import { generateHandle } from "../lib/identity.js";

const MAX_BODY = 500;
const MAX_TAG = 64;
const HIDE_AT_REPORTS = 3;
const TTL_MS = 24 * 60 * 60 * 1000;

// Per-IP rate limit: 1 post every 10 seconds.
const lastPostByIp = new Map<string, number>();
const POST_COOLDOWN_MS = 10_000;

export function createBoardRouter(): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    const tag = (req.query.tag as string | undefined)?.trim();
    const now = Date.now();
    const posts: BoardPost[] = [];
    for (const post of boardPosts.values()) {
      if (post.expiresAt <= now) continue;
      if (post.reportCount >= HIDE_AT_REPORTS) continue;
      if (tag && post.tag !== tag) continue;
      posts.push(post);
    }
    posts.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ posts });
  });

  router.post("/", (req: Request, res: Response) => {
    const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
    const last = lastPostByIp.get(ip) || 0;
    const now = Date.now();
    if (now - last < POST_COOLDOWN_MS) {
      return res.status(429).json({ error: "Slow down — wait a few seconds before posting again." });
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

    const post: BoardPost = {
      id: uuid(),
      handle: generateHandle(),
      tag,
      body,
      createdAt: now,
      expiresAt: now + TTL_MS,
      reportCount: 0,
    };
    boardPosts.set(post.id, post);
    log("post_created", { id: post.id, tag, len: body.length });
    res.json({ post });
  });

  router.post("/report", (req: Request, res: Response) => {
    const id = (req.body?.id as string | undefined)?.toString();
    if (!id) return res.status(400).json({ error: "Missing id." });
    const post = boardPosts.get(id);
    if (!post) return res.status(404).json({ error: "Post not found." });
    post.reportCount += 1;
    log("post_reported", { id, reportCount: post.reportCount });
    res.json({ ok: true, hidden: post.reportCount >= HIDE_AT_REPORTS });
  });

  return router;
}

function log(event: string, data: Record<string, unknown>) {
  console.log(`[${new Date().toISOString()}] ${event}`, JSON.stringify(data));
}
