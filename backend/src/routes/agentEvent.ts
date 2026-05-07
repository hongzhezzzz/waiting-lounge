import { Router, type Request, type Response } from "express";
import type { Server } from "socket.io";
import { getSocketsForDevice, setLastStatus } from "../state.js";

// PRIVACY INVARIANT — see docs/decisions.md.
// This route accepts EXACTLY four fields and rejects payloads with any other
// keys. Even if a future hook bug were to leak prompt/code/path/transcript
// data into the payload, this route refuses to forward or log it.
const ALLOWED_KEYS = new Set(["anonymousDeviceId", "status", "client", "timestamp"]);
const ALLOWED_STATUSES = new Set(["waiting", "needs_attention", "done", "disconnected"]);
const ALLOWED_CLIENTS = new Set(["claude-code"]);
const DEVICE_ID_PATTERN = /^[a-f0-9-]{8,64}$/i;

export function createAgentEventRouter(io: Server): Router {
  const router = Router();

  router.post("/", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Reject any unexpected keys. This is the privacy firewall.
    for (const k of Object.keys(body)) {
      if (!ALLOWED_KEYS.has(k)) {
        return res.status(400).json({ error: `Unexpected field: ${k}` });
      }
    }

    const anonymousDeviceId = body.anonymousDeviceId;
    const status = body.status;
    const client = body.client;
    const timestamp = body.timestamp;

    if (typeof anonymousDeviceId !== "string" || !DEVICE_ID_PATTERN.test(anonymousDeviceId)) {
      return res.status(400).json({ error: "Bad anonymousDeviceId." });
    }
    if (typeof status !== "string" || !ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: "Bad status." });
    }
    if (typeof client !== "string" || !ALLOWED_CLIENTS.has(client)) {
      return res.status(400).json({ error: "Bad client." });
    }
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      return res.status(400).json({ error: "Bad timestamp." });
    }

    setLastStatus(anonymousDeviceId, { status, client, timestamp });

    const ids = getSocketsForDevice(anonymousDeviceId);
    for (const sid of ids) {
      io.to(sid).emit("agent_status_update", { status, client, ts: timestamp });
    }

    // Log only metadata. Never log raw body, never log full deviceId.
    console.log(
      `[${new Date().toISOString()}] agent_event`,
      JSON.stringify({
        deviceIdShort: anonymousDeviceId.slice(0, 8),
        status,
        delivered: ids.length,
      }),
    );

    res.json({ ok: true, delivered: ids.length });
  });

  return router;
}
