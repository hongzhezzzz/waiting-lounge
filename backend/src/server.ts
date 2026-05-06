import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./sockets.js";

const PORT = Number(process.env.PORT || 4000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: "8kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] },
});

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
  console.log(`[backend] allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});
