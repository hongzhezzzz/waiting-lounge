# Project status

The truth about what currently works — not what is planned. Updated whenever a phase or feature changes state.

## Current phase
Phase 2 — **clickable mockup is live, awaiting your sign-off.** Open `http://localhost:3000` in a browser to use it.

## What works
- Phase 1 hook fires live from a real Claude Code session and writes sanitized events to `~/.waiting-lounge.log`. Privacy invariant holds.
- Phase 2 Next.js + Tailwind app at `web/` with seven pages: Home (`/`), Join (`/join`), Chat (`/chat`), Board (`/board`), Lounge (`/lounge`), Settings/About (`/settings`), and a placeholder Pair (`/pair`).
- Reusable components: `AgentStatusBadge`, `TagSelector`, `ModeSelector`, `ChatWindow`, `MessageBoard`, `ClaudeNeedsYouOverlay`, `ReportBlockControls`, `PrivacyPromise`, `InstallInstructions`.
- Fake-but-clearly-fake data only: tag list and mood list from spec §7.2, sample chat with "(demo)" peer replies, six sample board posts.
- "▶ demo Claude-needs-you alert" button on `/chat` and `/board` triggers the full overlay (page title flips, "Return to terminal" / "Give me 30 seconds" buttons).
- Privacy promise present on Home and Settings pages and in every page footer (spec §5).
- Typecheck and route smoke-test pass: all 7 routes return 200, no compile warnings.

## What's in progress
Nothing. Waiting for the user to click through and react before starting Phase 3 (local backend with Socket.IO + real two-window matching).

## What's blocked
Nothing.

## How to use Phase 2
1. The dev server is already running at `http://localhost:3000`.
2. Walk Home → "Join demo lounge" → pick a tag → "1-on-1 quick chat" → Continue → see chat → click the ▶ demo alert button.
3. Try the message board, settings, and lounge pages too. Tell Claude what feels right and what feels off.
4. To restart the dev server later: `cd web && npm run dev`.

## What's next (after Phase 2 passes)
Phase 3 — local Node.js + Express + Socket.IO backend, real tag-based matching between two browser windows, real chat messages.

## Last updated
2026-05-06
