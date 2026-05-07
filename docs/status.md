# Project status

The truth about what currently works — not what is planned. Updated whenever a phase or feature changes state.

## Current phase
**Stage 3 in progress.** Stages 1 & 2 are live in prod (https://waiting-lounge.vercel.app). Stage 3 is the polish + game-theory pass — see the canonical plan and `docs/research/engineering-plan.md` for the full breakdown.

Stage 3 sub-phases:
- **3a (quick wins)** — leaderboard nav, homepage live cards, lounge ticker, Lucide icons, pool matchmaking.
- **3b (medium)** — Brain Bet 2.0 iterative betting, Daily Brain Bet, bot fill.
- **3c (Stage 4 candidates, deferred)** — terminal play (`waiting-lounge play`), Solo Brain Bet Storm.

## What works today (live in prod)
- Hook → backend privacy firewall (4-field sanitized payload only).
- Pair / browser-as-client / live agent badge.
- Anonymous handles (e.g. `blue-cursor-241`); auth via Supabase 6-digit OTP for points persistence.
- Chat-while-gaming (singleton socket, room-agnostic `chat_message`).
- Message board (24h TTL, report/hide-at-3, 10s/IP cooldown, 8s polling).
- Game framework: registry-driven runners + room reuse.
- **Spot the Bug** — ~30 buggy snippets, 3/6/10 rounds.
- **Brain Bet** — 7 random round types: Indian Poker, Estimation Battle, Chicken Numbers, Big-O Showdown, Monty Mirage, Geo Trivia, Stock Direction. Equal-ante per game (the model Stage 3b.1 will replace).
- **Atomic points** — `chargeAntes`/`settleGame` in a transaction; `pending_refunds` cold-start recovery.
- **Daily +100 refill** (lazy, on `/api/me`).
- **Leaderboard page** at `/leaderboard` (orphan — Stage 3a.1 wires nav link).
- **Game history** on `/me`.
- **Invite-from-lounge** + 30s expiry timer + layout-level incoming banner.
- **Auto-deploy on `main` push** to Vercel (frontend) + Render (backend) + Supabase (DB).

## What's in progress
**Stage 3a.1** — header nav update (add Leaderboard link, rename Join→Lounge).

## What's planned
- Stage 3a.2 (homepage live status cards) — gated on 3a.1 ship.
- Stage 3a.3 (lounge live ticker).
- Stage 3a.4 (Lucide icon pass + slim copy).
- Stage 3a.5 (pool matchmaking — "Find a match").
- Stage 3b.1 (Brain Bet 2.0 iterative betting).
- Stage 3b.2 (Daily Brain Bet).
- Stage 3b.3 (bot fill).
- Stage 4 candidates: terminal play, Solo Brain Bet Storm.

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
2026-05-07 (Stage 3 kickoff — research persisted, plan written, 3a.1 in progress)
