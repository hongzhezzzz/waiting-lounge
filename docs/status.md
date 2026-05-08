# Project status

The truth about what currently works — not what is planned. Updated whenever a phase or feature changes state.

## Current phase
**Stage 3 complete.** All planned 3a + 3b items shipped to prod. 3c (terminal play, solo Storm) deferred to a Stage 4 decision.

Live at https://waiting-lounge.vercel.app.

## What's live (Stage 1–3)

### Phase 1–14 (Stage 1 + 2)
- Hook → backend privacy firewall (4-field sanitized payload only).
- Pair / browser-as-client / live agent badge.
- Anonymous handles (e.g. `blue-cursor-241`); auth via Supabase 6-digit OTP for points persistence.
- Chat-while-gaming (singleton socket, room-agnostic `chat_message`).
- Message board (24h TTL, report/hide-at-3, 10s/IP cooldown, 8s polling).
- Game framework: registry-driven runners + room reuse + replay-on-mount (`request_round_state`).
- **Spot the Bug** — ~30 buggy snippets, 3/6/10 rounds.
- Atomic points — `chargeAntes`/`settleGame` in a transaction; `pending_refunds` cold-start recovery.
- Daily +100 refill (lazy, on `/api/me`).
- Game history on `/me`.
- Invite-from-lounge + 30s expiry timer + layout-level incoming banner.
- Auto-deploy on `main` push to Vercel + Render + Supabase.

### Stage 3a (polish)
- **3a.1** — Leaderboard link in header nav; Join→Lounge rename.
- **3a.2** — Homepage live-status cards (Lounge / Board / Leaderboard top-3) replacing marketing copy. Polls `/api/lounge/stats` every 12 s.
- **3a.3** — Lounge live ticker (last 5 game results + 3 board posts) + leaderboard top-3 mini-card + warmer empty state.
- **3a.4** — Lucide icons in header, balance chip, homepage cards. Stops using emoji to avoid per-OS render breakage.
- **3a.5** — Pool matchmaking ("Find a match"). New `queue_for_pool` socket event with fixed defaults (5 min, 100 ante).

### Stage 3b (game-theory + retention)
- **3b.1** — **Brain Bet 2.0 iterative betting.** Each match has a running 1000-chip table stack. Each round runs reveal → bet (8 s simultaneous) → answer → showdown. Bet tiers: Check / Raise +25/+50/+100 / All-in / Fold. Forced 50-chip ante per round. Pot allocation: both fold → house keeps; one fold → opponent; else round winner takes (or split on tie). Match ends on bust or rounds-complete; winner = chip leader. Platform 100-pt ante / 200-pt pot pipeline unchanged.
- **3b.2** — **Daily Brain Bet.** One curated 3-round puzzle per UTC day, same for everyone. Solo (no opponent). Streak counter with flame chip in header next to the balance. Schema: `daily_brain_bet_attempts`, `daily_streaks`. Routes: `/api/daily/{today,submit,status}`.
- **3b.3** — **Bot fill.** When `queue_for_pool` doesn't pair within 30 s, an honestly-labeled `lounge-bot-NNN` joins. Bot games skip `chargeAntes`/`settleGame` entirely — no platform points move, no leaderboard pollution. Bot strategy is "honest amateur": ~55% correct on objective rounds, info-aware on Indian Poker, always-switch on Monty Hall.

### Stage 3 fixes
- **PR #17** — game-start delay for round-start race (insufficient).
- **PR #18** — proper fix: client emits `request_round_state` on game-page mount; runner replays current state. Robust against any timing.
- **PR #17 / #22** — `acknowledge()` clears the needs-attention overlay on Return-to-terminal click; 5-second suppression window for duplicate Notification bursts.

## Deferred to Stage 4 candidate
- **3c.1 — Terminal play** (`waiting-lounge play`). Estimated ~200–400 LOC. Reason: matching wait is solved by 3a.5 + 3b.3, so TUI is delight, not bottleneck.
- **3c.2 — Solo Brain Bet Storm** (Lichess pattern). Off-hours solo timed run.
- **Task #44 — Calibrate forfeit penalty.** Today voluntary leave refunds both antes; future fix should scale by progress + chip lead.

## Deployment
- **Frontend:** `https://waiting-lounge.vercel.app` (Vercel, auto-deploys from `main`).
- **Backend:** `https://waiting-lounge.onrender.com` (Render, auto-deploys from `main`).
- **DB:** Supabase Postgres (pooler).
- **Local hook:** points at Render via `~/.waiting-lounge/backend_url`.

## How a friend installs (the one-liner)
```
npx --yes github:hongzhezzzz/waiting-lounge install
```
Paste the printed JSON into `~/.claude/settings.json`, click the printed pair URL once, then `npx --yes github:hongzhezzzz/waiting-lounge test` to confirm.

## Last updated
2026-05-08 (Stage 3 complete — all planned 3a + 3b items shipped; 3c deferred).
