# Project status

The truth about what currently works — not what is planned. Updated whenever a phase or feature changes state.

## Current phase
Phase 5 — **the spec §13 milestone is wired up, awaiting your real-Claude-Code test.** Your local Claude Code activity now drives the browser status badge and the "Claude needs your attention" overlay.

## What works
- Phase 1 hook fires live from a real Claude Code session and writes sanitized events to `~/.waiting-lounge.log`.
- Phase 2 Next.js + Tailwind app at `web/` — seven pages, fake-data demo path preserved at `/chat?tag=...&demo=1`.
- Phase 3 backend at `backend/` — Express + Socket.IO + uuid, real two-window matching with `welcome / waiting / matched / chat_message / peer_left`. "Find a new match" rejoins the queue cleanly.
- Phase 4 message board: `GET/POST /api/board`, report endpoint, 24h TTL, 10s/IP post cooldown, hide-at-3-reports, polling every 8s for cross-window updates, seeded welcome posts.
- **Phase 5 chain (new):**
  - **Local hook** (`local-hook/hook.js`) extended: discards stdin, generates and persists a UUID device id at `~/.waiting-lounge/device_id` (mode 0600), POSTs `{anonymousDeviceId, status, client, timestamp}` to `http://localhost:4000/api/agent-event` with a 1.5s timeout, swallows all errors. New `pair` subcommand prints a one-time browser URL and exits.
  - **Backend route** `POST /api/agent-event` is the privacy firewall: it explicitly *rejects* payloads containing any key other than the four allowed fields (`{"error":"Unexpected field: prompt"}` confirmed). Validates status enum, client enum, deviceId format, timestamp type. Routes valid events to the device's connected sockets via `agent_status_update`.
  - **Frontend provider** `AgentStatusProvider` wraps the whole app. On mount it reads the deviceId from localStorage, registers it with the backend over the existing socket, and listens for `agent_status_update`. A new global `LiveAgentStatusBadge` in the header shows "Not paired" until the browser is paired, then live status. The "Claude needs you" overlay is now layout-level and fires automatically on real `needs_attention` events.
  - **Pair page** `/pair?d=<uuid>` validates the id, stores it in localStorage, and redirects to `/join`. If you visit `/pair` with no param it shows the pairing instructions instead.
  - **Settings** page now shows whether this browser is paired (with a short prefix of the deviceId) and offers an "Unpair" button.
- **Privacy verified end-to-end:** piping `{"prompt":"DO_NOT_LEAK","cwd":"/tmp/secret"}` into `node local-hook/hook.js attention` produced only `agent_event {deviceIdShort, status, delivered}` in the backend log — zero leakage.

## What's in progress
Nothing. Waiting for the user to pair their browser and run a real Claude Code prompt to confirm the round trip.

## What's blocked
Nothing.

## How to use Phase 5
1. Both dev servers are running: frontend `http://localhost:3000`, backend `http://localhost:4000`.
2. **Pair your browser** — open this URL once (it was generated for your machine just now):

   ```
   http://localhost:3000/pair?d=d1b1e2aa-01cc-43af-9266-a795738a0146
   ```

   The page should say "Paired." and redirect to /join. After pairing, the **header badge** should flip from "Not paired" to a status badge.

3. **Trigger real events.** In *this* folder, send any prompt to your Claude Code session. The header badge should:
   - go to **"Claude is working"** (sage, pulsing) on UserPromptSubmit;
   - go to **"Claude needs your attention"** (amber) and pop the overlay when Claude requests permission or sends a Notification;
   - go to **"Claude may be done"** (gray) when Claude stops responding.

4. The "▶ demo Claude-needs-you alert" button on `/chat` and `/board` still works — it now goes through the same provider, so you can preview the overlay without firing a real event.

## What's next (after Phase 5 passes)
Local MVP is complete. Beyond this, everything needs accounts/infra:

- **Phase 6:** swap in-memory state for Postgres + Redis (needs Supabase + Upstash accounts, or Docker locally).
- **Phase 7:** harden safety controls (rate limits, secret-pattern warning, persistent block).
- **Phase 8:** deploy (Vercel + Render/Railway/Fly + Supabase + Upstash + a domain).
- **Phase 9:** CLI installer (`waiting-lounge install|status|test|uninstall`).
- **Phase 10:** small beta with 3-5 trusted users.

## Last updated
2026-05-06
