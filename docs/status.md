# Project status

The truth about what currently works — not what is planned. Updated whenever a phase or feature changes state.

## Current phase
Phase 3 — **real two-window matching is live, awaiting your sign-off.** Two browser windows on the same tag now match into the same chat for real.

## What works
- Phase 1 hook fires live from a real Claude Code session and writes sanitized events to `~/.waiting-lounge.log`. Privacy invariant holds.
- Phase 2 Next.js + Tailwind app at `web/` (seven pages, nine components, fake-data only paths still available via `?demo=1`).
- Phase 3 backend at `backend/` (Node + Express + Socket.IO + uuid, TypeScript). In-memory `users / queues / rooms` state. Server-generated anonymous handles like `gentle-diff-232`.
- Socket events implemented: client → server `join_queue`, `leave_queue`, `chat_message`, `leave_room`, `report_user`, `block_user`; server → client `welcome`, `waiting`, `matched`, `chat_message`, `peer_left`, `error_message`, `report_acknowledged`, `block_acknowledged`.
- `GET /health` returns `{ok:true,ts}` for sanity checks.
- Frontend `/chat` defaults to **live mode**: connects to `ws://localhost:4000`, joins the queue with the chosen tag, shows a "waiting" card until matched, then shows the real chat. Peer disconnect produces a "Your peer left" card with a "find new match" button. `?demo=1` preserves the original fake-data path.
- Two-client smoke test passed: A and B both joined `Debugging`, both got `matched`, exchanged messages both directions, B disconnected, A received `peer_left`.
- Server **never logs message bodies** — only metadata (sender handle, body length).

## What's in progress
Nothing. Waiting for the user to do the two-window test before starting Phase 4.

## What's blocked
Nothing.

## How to use Phase 3
1. Both dev servers run: frontend at `http://localhost:3000`, backend at `http://localhost:4000`.
2. Open **two** browser windows side by side. In each: Home → Join demo lounge → pick the **same tag** (e.g. *Debugging*) → "1-on-1 quick chat" → Continue.
3. The first window shows "Waiting for someone in Debugging…". The second window joining the same tag matches them.
4. Type messages in either window. They appear in the other within a fraction of a second.
5. Close one window — the other shows "Your peer left."
6. To restart later: `cd web && npm run dev` (terminal 1) and `cd backend && npm run dev` (terminal 2).

## What's next (after Phase 3 passes)
Phase 4 — message board fallback. Real per-tag posts with 24-hour expiry, served from the same Express backend.

## Last updated
2026-05-06
