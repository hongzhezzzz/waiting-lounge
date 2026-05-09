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

### Stage 6b (Claude Code statusline integration)
- **`cli/statusline.js`** — reads `~/.waiting-lounge/state.json` (written by `play.mjs --write-state-to=<path>`) and prints a one-line summary suitable for Claude Code's statusline contract. Falls back to `☕ Lounge: idle` if the file is missing or older than 30 s.
- **`docs/statusline-setup.md`** — paste-able settings.json block + how to compose with existing statuslines.
- **Install flow update** — `waiting-lounge install` ends with optional-next-steps lines pointing to `dock` and the statusline doc.
- **Privacy** — script does no network I/O. Only reads the local lounge state file. No Claude Code content ever touched.
- Works alongside Stage 6a (the dock writes state) AND alongside Stage 6c (the multiplexer will write the same file).

### Stage 6c.1 (zero-dep PTY multiplexer — first cut)
- **`cli/multiplexer.js`** (CJS) — spawns claude as a PTY child sized to (cols, topHeight) and play.mjs --dock as a second PTY sized to (cols, bottomHeight). Sets DECSTBM scrolling region for the top region; lounge bytes are regex-translated (CUP/HVP/VPA row coordinates shifted by topHeight, dangerous escapes blocked: scroll-region, alt-screen, clear-screen).
- **`cli/__tests__/multiplexer.test.js`** — 12 unit tests (CJS + node:test) covering CUP/HVP/VPA shifts, Home translation, multi-escape chunks, color preservation, defensive blocks. All passing.
- **`cli/dock.js`** — `shouldUseMultiplexer()` selects path: opt-in via `--no-tmux` flag or `WL_DOCK_NO_TMUX=1` env, OR implicit fallback when tmux is missing. Default behavior unchanged for users with tmux installed.
- **Stdin multiplexing** — Ctrl-L (byte 0x0c) toggles between "claude focused" (collapsed bottom, ~1 row) and "lounge focused" (expanded bottom, ~30%). All other input goes to the focused pane.
- **Focus indicator** — `flashFocusIndicator()` paints a one-line yellow banner in the bottom region's first row at startup and on every toggle ("▶ Focus: claude — press Ctrl-L to switch to the lounge and play"). The lounge re-renders within a frame and overwrites it; the flash is brief but visible at the moment focus changes.
- Loaded lazily only when chosen, so tmux users don't pay node-pty's native-import cost.

### Stage 6d (attach to existing tmux session)
- **`cli/attach.js`** (CJS) — `waiting-lounge attach` adds a 1-row lounge strip to the CURRENT tmux session via `tmux split-window -v -l 1 …`. Works mid-session: claude keeps running, the kernel sends it SIGWINCH, claude redraws at smaller size, the lounge appears below.
- **Frictionless path:** install tmux once → run `tmux` → start claude inside it. From then on, `waiting-lounge attach` (or `! waiting-lounge attach` from inside claude) opens the lounge anytime.
- **Limitation:** "open anytime" requires tmux. If claude is running outside tmux on a system without tmux, attach can't help — those users use `waiting-lounge dock` for new sessions.

## Deferred to 6c.2/7
- **6c.2 — Multiplexer polish.** Real-claude integration testing: alt-screen handling if claude uses it, edge cases on resize, lounge-child crash banner, "design phase" UX issues raised in 6c.1 testing (deferred per user). Validate against macOS Terminal, iTerm2, Linux gnome-terminal, WSL Windows Terminal, ssh into each.
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
Paste the printed JSON into `~/.claude/settings.json`, click the printed pair URL once, then `npx --yes github:hongzhezzzz/waiting-lounge test` to confirm. The `npx` form auto-registers `waiting-lounge` on the user's PATH for the duration of the command; for repeated use, the binary lives in their npm global bin once npm caches it.

## Dev setup (one-time, when working from a clone)

After `git clone` + `npm install` in the repo root, run:
```
npm link
```
This registers the local clone's `waiting-lounge` binary on your PATH (no sudo needed if your npm prefix points at `~/.npm-global` or similar). Without this, you'd type `node cli/waiting-lounge.js <cmd>` instead of `waiting-lounge <cmd>` — both work.

## Last updated
2026-05-08 (Stage 6a + 6b + 6c.1 merged; Stage 6d attach-to-existing-tmux in flight — opens the lounge anytime mid-claude).
