# Project status

The truth about what currently works — not what is planned. Updated whenever a phase or feature changes state.

## Current phase
**Stage 5.1 complete; Stage 6a (tmux dock beta) shipping.** Chat-while-playing works in both the TUI and the web app. Stage 6a opens Claude Code + the lounge in one tmux window — bottom strip is a 1-row indicator, Ctrl-L expands to ~30%. Auto-scroll regression in `play` is fixed; "Play a bot now" is one keystroke (TUI) / one button (web).

Live at https://waiting-lounge.vercel.app (browser) and via `node cli/waiting-lounge.js {play,dock}` (terminal).

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

### Stage 4 (terminal play)
- **4a** — TUI skeleton (ink + react + socket.io-client). `cli/play.mjs` connects anonymously, shows the device-id prefix, exits cleanly on Q.
- **4b** — Auth bridge. Browser code-exchange flow at `/cli-pair?code=…`. Token + Supabase config persisted at `~/.waiting-lounge/auth_token` (mode 0600). Auto-refresh against Supabase REST keeps the user authenticated for ~30 days without browser.
- **4c** — Match flow + Indian Poker. `useReducer` state machine (lobby → searching → in_match → match_end). All Brain Bet 2.0 socket events wired. Indian Poker fully playable; bot fill from 3b.3 carries the rest.
- **4d** — Remaining 6 round renderers. Estimation/Monty (numeric input), Chicken (1–0), Big-O / Geo (1–N choice keys), Stock Direction (U/D + magnitude with a Unicode-block sparkline at `cli/lib/sparkline.mjs`).
- **4e** — Polish. Forfeit confirm dialog (Q during in_match → "Forfeit? Y/N"). Reconnect overlay on socket drop. `game_aborted` distinguished on the match-end screen. `/cli-pair` page shows the code tail in a large amber-bordered box.

### Stage 5.1 (chat-while-playing)
- **TUI** — input multiplexing in `useInput`: T enters chat mode (during in_match only), ESC exits, Enter sends. ChatPanel renders constant 7-line height (5 padded slots + always-present input row) — fixes terminal-shake regression that ink produced when the panel grew/shrunk on send. Bodies truncated to 60 chars to prevent wrapping.
- **Web** — ChatPanel moved from floating bottom-right popup to inline collapsible card below the game; default open=true, localStorage-persisted, unread badge when collapsed.
- **Lost-fix re-apply** — the SEARCH_TICK elapsed counter that was supposed to ship in 4e never reached origin (silently dropped by `git push` without upstream tracking, then by squash-merge); re-applied on this branch and verified per Ground Rule #10.

### Stage 6a (tmux dock — internal beta)
- **Auto-scroll fix** — top-level Box gets `height: process.stdout.rows` + `overflow: "hidden"` so ink clips instead of letting the layout grow past visible area. Round transitions no longer scroll the terminal.
- **Bot-now** — new `start_bot_match_now` socket event reuses `startBotMatchFor`; TUI lobby has [B] key, web lobby has "Play a bot now" button. Skips the 30 s pool wait. Bot games still skip chargeAntes/settleGame per 3b.3 design.
- **`--dock` and `--write-state-to=<path>` flags** — render switches to the 1-row CollapsedStrip when `process.stdout.rows <= WL_DOCK_COLLAPSED_THRESHOLD` (default 6); state.json snapshot written atomically on every state change for Stage 6b's statusline.
- **`cli/dock.js`** — tmux orchestrator. `waiting-lounge dock` opens a `wl` tmux session with claude top + lounge bottom. Ctrl-L (configurable) toggles between collapsed and expanded. `WL_DOCK_COLLAPSED_ROWS`, `WL_DOCK_EXPANDED_PCT`, `WL_DOCK_TOGGLE_KEY` are env-driven.
- **Ground Rule #11** — frictionless-first, locked into CLAUDE.md. Stage 6c (zero-dep PTY multiplexer) is the firm production ship target; Stage 6a is internal beta only.

## Deferred to Stage 6b/6c/7
- **6b — Statusline strip.** Push lounge state into Claude Code's existing statusline via `waiting-lounge status` script reading `~/.waiting-lounge/state.json`. ~2 days. Works alongside any host (tmux dock, future multiplexer, or no dock at all).
- **6c — Zero-dep PTY multiplexer.** Replaces tmux requirement; same dock UX without any setup. Adds `node-pty` dep. ~3 weeks. Production ship target per Ground Rule #11.
- **5.2 — Spot the Bug in TUI.** Needs cli-highlight for syntax. ~2 days.
- **5.4 — Lounge member list + invites in TUI.** Polled list, k/j navigation, Enter to invite.
- **5.5 — Solo Brain Bet Storm** (Lichess-style timed solo run). Carryover from Stage 4 deferral.
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
2026-05-08 (Stage 5.1 chat-while-playing merged; Stage 6a tmux dock + auto-scroll fix + bot-now in flight as a single PR).
