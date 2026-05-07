# Project status

The truth about what currently works — not what is planned. Updated whenever a phase or feature changes state.

## Current phase
**Phase 11 — code complete locally.** Auth + points + the first competitive game are wired end-to-end. Pending production deploy until the user supplies Supabase Auth keys and enables email OTP in the Supabase dashboard (see "What's blocked" below).

Pilot (Phase 10) concluded — moving on. Next stage is the competitive-games arc (11→14, see plan in `~/.claude/plans/magical-frolicking-glade.md`).

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
- **Phase 11 (code complete, local):**
  - **Schema:** `users`, `device_account_bindings`, `game_rounds`, `point_transactions`, `pending_refunds` tables exist on Supabase. Idempotent — applies on backend startup.
  - **Atomic points:** `chargeAntes` deducts both players in a single transaction with `SELECT … FOR UPDATE`, writes `pending_refunds` rows. `settleGame` clears those rows + credits winner. `processStalePendingRefunds()` runs at backend startup to recover antes from games that died mid-flight. **Smoke-tested against live DB:** ante 100 → 900, win → 1100, tie → 1000, abort → 1000.
  - **Auth:** Supabase OTP-email sign-in. Backend verifies the JWT with the project's `SUPABASE_JWT_SECRET` (HS256, via `jose`). Anonymous sockets still work for chat/board/lounge; only game events require auth.
  - **Spot the Bug:** ~30 hand-curated buggy snippets in `backend/src/games/spotTheBug/snippets.json`. 3/6/10 rounds for 1/5/10-min games. 45-second round timer, 2.5-second post-round pause. **End-to-end test passing:** two clients with locally-signed JWTs queue, match, alice always clicks the correct line, after 3 rounds alice = 1100 / bob = 900.
  - **Frontend:** `/login` (OTP two-step), `/me` (profile + balance + bind device), `/games/[gameType]/[roomId]` (game shell), `BalanceChip` in header, `Game` mode added to `/join` with game-type / duration / ante picker.
  - **Anti-abuse:** self-match rejected; device-account binding 409s on conflict; 10 s disconnect grace before forfeit; cold-start refund covers mid-game backend deaths.

## What's in progress
Nothing — Phase 11 local code is settled. End-to-end script tests (`backend/test-game-e2e.mjs`, `backend/test-refund.mjs`) PASS.

## What's blocked
**Production deploy of Phase 11** is blocked on three things only the user / Supabase dashboard can do:
1. Enable **email OTP** in Supabase: dashboard → Authentication → Providers → Email → toggle "Enable Email Provider" + "Email OTP."
2. Copy these values from Supabase dashboard → Settings → API:
   - **Project URL** (e.g. `https://aapjsnfzhwsvhueyclgq.supabase.co`)
   - **anon / public key** (for the frontend)
   - **JWT Secret** (under "JWT Settings" — for the backend)
3. Set them on the deploy targets:
   - **Render** (backend service `waiting-lounge`): add env var `SUPABASE_JWT_SECRET=<jwt secret>`. Trigger redeploy.
   - **Vercel** (project `waiting-lounge`): add `NEXT_PUBLIC_SUPABASE_URL=<project url>` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>`. Trigger redeploy.
   - **Local `backend/.env`** already has a placeholder; replace with the real JWT secret.
   - **Local `web/.env.local`** does not exist yet — create with the same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Until then, the lounge runs as before in prod (chat / board / lounge / install all unaffected) and the new `/login`, `/me`, and Game-mode UI show "Sign-in is not configured yet."

## How a friend installs (the one-liner)

```
npx --yes github:hongzhezzzz/waiting-lounge install
```

Paste the printed JSON into `~/.claude/settings.json`, click the printed pair URL once, then `npx --yes github:hongzhezzzz/waiting-lounge test` to confirm. Hooks fire on every Claude Code session after that.

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

## What's next
- **Phase 11 prod deploy** (blocked on Supabase keys, see above).
- **Phase 12:** Brain Bet — mixed-bag gambling game with 3 starter round types (Indian Poker, Estimation Battle, Chicken Numbers). Same framework as Spot the Bug; small per-round resolver classes.
- **Phase 13:** more Brain Bet round types (Stock Direction, Big-O Showdown, Pixel Reveal, Monty Mirage, Geo Trivia).
- **Phase 14:** leaderboard, lazy daily +100 refill on first sign-in of the day, chat-while-gaming, invite-from-lounge, game history.

## Deployment in flight (2026-05-06 evening)

Public deploy is wired end-to-end. CORS env var has been updated on Render and the redeploy is live:
- **Frontend:** `https://waiting-lounge.vercel.app` (Vercel, auto-deploys from `main`)
- **Backend:** `https://waiting-lounge.onrender.com` (Render web service `waiting-lounge`, id `srv-d7u05ovavr4c73d5h1t0`, auto-deploys on push)
- **Database:** Supabase Postgres (`aws-1-us-west-2.pooler.supabase.com`), pooler connection
- **Local hook:** points at Render via `~/.waiting-lounge/backend_url`
- **Render env:** `ALLOWED_ORIGINS=http://localhost:3000,https://waiting-lounge.vercel.app` (deploy `dep-d7u0r0lckfvc73eg72hg` went live 2026-05-07 03:57 UTC).

Awaiting the user's manual round-trip test:
1. Open `https://waiting-lounge.vercel.app/pair?d=<device id from ~/.waiting-lounge/device_id>` to pair the browser with their local Claude Code device.
2. Send a prompt to a Claude Code session in this folder; verify the header badge flips through "Claude is working" → "Claude needs your attention" → "Claude may be done".

Once that confirms, proceed to **Phase 9: CLI installer**.

## Last updated
2026-05-07 (Phase 11 local)
