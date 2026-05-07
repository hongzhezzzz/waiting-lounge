import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./sockets.js";
import { createBoardRouter } from "./routes/board.js";
import { sweepExpiredPosts, boardPosts } from "./state.js";

const PORT = Number(process.env.PORT || 4000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: "8kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now(), boardPosts: boardPosts.size });
});

app.use("/api/board", createBoardRouter());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] },
});

registerSocketHandlers(io);

// Sweep expired posts every 5 minutes.
setInterval(() => {
  const removed = sweepExpiredPosts();
  if (removed > 0) {
    console.log(`[${new Date().toISOString()}] post_sweep`, JSON.stringify({ removed }));
  }
}, 5 * 60 * 1000);

// Seed two welcome posts so the board isn't empty on first visit.
seedBoard();

server.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
  console.log(`[backend] allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});

function seedBoard() {
  const now = Date.now();
  const ttl = 24 * 60 * 60 * 1000;
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
    const id = `seed-${s.tag}-${s.handle}`;
    boardPosts.set(id, {
      id,
      handle: s.handle,
      tag: s.tag,
      body: s.body,
      createdAt: now,
      expiresAt: now + ttl,
      reportCount: 0,
    });
  }
}
