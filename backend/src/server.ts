import "dotenv/config";
// jose's webapi needs globalThis.crypto, missing in Node 18. Harmless on Node 20+.
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./sockets.js";
import { createBoardRouter, seedWelcomePosts } from "./routes/board.js";
import { createAgentEventRouter } from "./routes/agentEvent.js";
import { applySchema, pingDb, query } from "./db/index.js";
import { processStalePendingRefunds } from "./games/transferPoints.js";
import { createMeRouter } from "./routes/me.js";
import { createLeaderboardRouter } from "./routes/leaderboard.js";
import { createLoungeStatsRouter } from "./routes/loungeStats.js";
import { createDailyRouter } from "./routes/daily.js";
// Importing games/index registers all game types into the runner registry.
import "./games/index.js";

const PORT = Number(process.env.PORT || 4000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: "8kb" }));

app.get("/health", async (_req, res) => {
  const db = await pingDb();
  res.json({ ok: true, db, ts: Date.now() });
});

app.use("/api/board", createBoardRouter());
app.use("/api/me", createMeRouter());
app.use("/api/leaderboard", createLeaderboardRouter());
app.use("/api/lounge", createLoungeStatsRouter());
app.use("/api/daily", createDailyRouter());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] },
});

app.use("/api/agent-event", createAgentEventRouter(io));

registerSocketHandlers(io);

// Periodically delete expired board posts so the table doesn't grow forever.
setInterval(async () => {
  try {
    const { rows } = await query<{ deleted: string }>(
      "with d as (delete from board_posts where expires_at <= now() returning 1) select count(*)::text as deleted from d",
    );
    const n = Number(rows[0]?.deleted || 0);
    if (n > 0) console.log(`[${new Date().toISOString()}] post_sweep`, JSON.stringify({ deleted: n }));
  } catch (err) {
    console.error("[sweep] failed", (err as Error).message);
  }
}, 15 * 60 * 1000);

bootstrap();

async function bootstrap() {
  try {
    await applySchema();
    await seedWelcomePosts();
  } catch (err) {
    console.error("[bootstrap] db setup failed:", (err as Error).message);
    console.error("[bootstrap] starting anyway — board endpoints will return 500 until the db is reachable.");
  }

  try {
    const refunded = await processStalePendingRefunds();
    if (refunded > 0) {
      console.log(`[bootstrap] cold-start refunds processed: ${refunded}`);
    }
  } catch (err) {
    console.error("[bootstrap] refund processor failed:", (err as Error).message);
  }

  server.listen(PORT, () => {
    console.log(`[backend] listening on http://localhost:${PORT}`);
    console.log(`[backend] allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  });
}
