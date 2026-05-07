# Project status

The truth about what currently works — not what is planned. Updated whenever a phase or feature changes state.

## Current phase
Phase 4 — **real cross-window message board is live, plus the peer-left "Find a new match" bug from Phase 3 is fixed.** Awaiting your sign-off.

## What works
- Phase 1 hook fires live from a real Claude Code session and writes sanitized events to `~/.waiting-lounge.log`. Privacy invariant holds.
- Phase 2 Next.js + Tailwind app at `web/` (seven pages, nine components, fake-data path available via `/chat?tag=...&demo=1`).
- Phase 3 backend at `backend/` — Express + Socket.IO + uuid, TypeScript. Real two-window matching: `welcome / waiting / matched / chat_message / peer_left` events all verified end-to-end with both the user and a programmatic two-client smoke test.
- **Phase 3 fix:** "Find a new match" on the peer-left screen now genuinely re-joins the queue (was a no-op `<Link>` to the same URL). Implemented via a `searchNonce` state in `LiveChatWindow` whose change forces the join effect to re-run.
- Phase 4 board API at the same backend on `http://localhost:4000`:
  - `GET /api/board?tag=` returns non-expired, non-hidden posts (newest first).
  - `POST /api/board` validates length (≤500), tag, applies a 10-second per-IP cooldown, returns the created post with a freshly generated handle.
  - `POST /api/board/report` increments `reportCount`; ≥3 reports auto-hides a post.
  - Backend seeds two welcome posts on start; expired-post sweeper runs every 5 minutes.
- Frontend `/board` page reads `?tag=` from the URL and passes it as the initial filter and post tag. The `MessageBoard` component fetches on mount, polls every 8 seconds for cross-window updates, and prepends new posts you submit.
- Server **still never logs message bodies** (chat). Board logs metadata only: post id, tag, length, report counts.

## What's in progress
Nothing. Waiting for the user to test the board (post in one window, see it appear in another) before starting Phase 5.

## What's blocked
Nothing.

## How to use Phase 4
1. Both dev servers run: frontend at `http://localhost:3000`, backend at `http://localhost:4000`.
2. From the homepage → **Join demo lounge** → pick a tag → choose **Message board** → Continue.
3. You'll land on `/board?tag=...`. Type a short post and click **Post**. It appears at the top.
4. Open a second browser window on `http://localhost:3000/board` (no filter, or same tag) — within ~8 seconds the new post shows up there too.
5. Click **Report** on a post — it disappears from your view immediately. Three reports across windows hides it for everyone.
6. Two seeded welcome posts are pre-loaded so the board isn't empty on a fresh server start.

## What's next (after Phase 4 passes)
Phase 5 — connect the local Claude Code hook to the backend so your real Claude activity drives the browser status badge and triggers the **Claude needs your attention** overlay automatically. This is the "spec §13 success criterion" milestone: full local end-to-end with real Claude Code events.

## Last updated
2026-05-06
