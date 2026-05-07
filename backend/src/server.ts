import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./sockets.js";
import { createBoardRouter, seedWelcomePosts } from "./routes/board.js";
import { createAgentEventRouter } from "./routes/agentEvent.js";
import { applySchema, pingDb, query } from "./db/index.js";

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

  server.listen(PORT, () => {
    console.log(`[backend] listening on http://localhost:${PORT}`);
    console.log(`[backend] allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  });
}
