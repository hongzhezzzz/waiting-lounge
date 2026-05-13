# Project status

The truth about what currently works — not what is planned. Updated whenever a phase or feature changes state.

## Current phase
**Stage 9 (frictionless one-line install) in flight.** `waiting-lounge install` now writes the 4 hook entries into `~/.claude/settings.json` automatically (with a timestamped backup) and auto-opens the pair URL in the user's default browser. Pure one-liner: `npm install -g github:hongzhezzzz/waiting-lounge && waiting-lounge install`. Cautious users can pass `--print-only` (no settings write, no browser open) or `--ask` (prompt before merging). Stage 8 (TUI polish) merged on 2026-05-13.

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

### Stage 7 (Distribution — Option A: public GitHub)
- **Public repo** at https://github.com/hongzhezzzz/waiting-lounge.
- **One-liner install:** `npm install -g github:hongzhezzzz/waiting-lounge` then `waiting-lounge install`.
- **Path-leak fix:** sanitized `local-hook/README.md` example paths (`/path/to/waiting-lounge`); untracked `.claude/settings.json` (now per-user, gitignored). Verified clean by `git grep`.
- **Public-facing README** at the repo root: tagline, ASCII dock mockup, install one-liner, quick start, privacy section quoting the actual 4-field hook payload, architecture overview, what's playable, doc pointers.
- **package.json metadata:** description, homepage, repository, bugs, keywords, LICENSE in `files[]` for clean npm/GitHub previews.
- **Pre-publish + post-public verification** captured in `docs/install-verification.md` (claude tarball-installed into isolated `/tmp/wl-prefix`; then anonymous `npm install -g github:…` post-public). Both clean.
- **`--version` handler** added (was falling through to "Unknown command").

### Stage 10c (terminal-side OTP)
- **`[B]rowser / [T]erminal` choice when auth is needed.** When the user picks `[F] find a match` while unauthenticated, the lounge now shows a choice surface instead of jumping straight to the browser pair. `[B]` runs the existing browser flow; `[T]` runs an in-terminal email + 6-digit OTP flow that never leaves the TUI.
- **Headless auto-pick.** On native Linux without `$DISPLAY`/`$WAYLAND_DISPLAY` (SSH, Docker, CI), the choice is skipped and the user lands directly in the email entry — browser pair is impossible there anyway.
- **`backend/src/routes/cliAuth.ts`** — new `GET /api/cli/auth/config` returns `{supabaseUrl, supabaseAnonKey}` from env (both are publicly-safe; same values embedded in every browser bundle). 503 with a clear message if env isn't set. Requires `SUPABASE_ANON_KEY` env var on Render.
- **`cli/lib/auth.js`** — new helpers: `fetchSupabaseConfig`, `requestOtp` (`POST {supabase}/auth/v1/otp`), `verifyOtp` (`POST {supabase}/auth/v1/verify`), `persistTerminalSession`. All hit Supabase REST directly; no new dep, no service-key dance.
- **`cli/components/AuthPrompt.mjs`** (new, ~230 LOC) — owns the choice / email / sending / code / verifying / error state machine. Email validated by regex; code auto-submits at 6 digits; rate-limit responses surface as "Wait a minute and try again."
- **`cli/play.mjs`** — new `appPhase: "auth_choice"`, new `OPEN_AUTH_CHOICE` and `AUTH_CANCELLED` reducer actions, parent `useInput` short-circuits during `auth_choice` so the child component owns keystrokes.

### Stage 10b (defer auth until pool match)
- **Anonymous-by-default opening.** `waiting-lounge play/dock/attach` now lands the user in the lobby anonymously — no email prompt, no browser tab, just their generated handle (`blue-cursor-241`-style). Initial `appPhase` in `cli/play.mjs` changed from `"auth"` to `"connecting"`, and the auth+socket effect now reads existing token if present, otherwise connects anonymously.
- **Bot matches work anonymously.** Backend `start_bot_match_now` no longer requires `me.userId`; `startBotMatchFor` accepts a synthetic `anon:${socket.id}` userId. Per Stage 3b.3, bot matches already skip `chargeAntes`/`settleGame` entirely — no platform points move regardless — so allowing anonymous play here is zero-risk.
- **Pool match (`[F] find a match`) triggers auth lazily.** New `runAuthAndJoinPool()` helper in `play.mjs` runs the browser pair flow, disconnects the anonymous socket, reconnects with the new token, and emits `queue_for_pool`. State machine: `lobby → pairing → connecting → lobby → searching`.
- **Lobby UX cues.** When anonymous, the identity row shows `○ anonymous · handle blue-cursor-241` (warning color, hollow dot), `[F]` is annotated `(signs you in first)`, `[B]` is annotated `(no sign-in needed)`. Once signed in, hint disappears and the dot turns green.
- **No backend storage change.** Anonymous sockets generate synthetic userIds only for in-memory match state; nothing persists to Postgres (existing bot-match invariant).

### Stage 10a (tmux bundled into install + dock toggle stability)
- **Ctrl-L second-press crash fixed (Q5).** `cli/dock.js`'s `toggle()` handler now wraps both `tmuxQuery` calls and both `tmuxRun` calls in try/catch with safe defaults. Root cause: on macOS, the second toggle in quick succession could hit a transient pane state where `tmux display-message` returned non-zero; the uncaught exception exited the fresh Node process with code 1, which tmux then surfaced to the user. Linux/WSL didn't show this because resize completion is more synchronous. Behavior unchanged on the happy path; safe-default toggle on the unhappy one.
- **Tmux bundled into `waiting-lounge install` (Q1).** New `ensureTmux()` helper detects missing tmux and:
  - macOS + brew available → auto-runs `brew install tmux` (no sudo; ~15s first time, instant on re-runs since brew detects)
  - macOS without brew → prints "install brew (brew.sh), then `brew install tmux`"
  - Linux/WSL → detects apt/dnf/yum/pacman/zypper/apk and prints the right `sudo` line; never auto-runs sudo
  - native Windows → points to WSL
- **`cli/lib/tmux.js`** (new) — shared `hasTmux`, `hasCmd`, `detectLinuxPackageManager`. `cli/attach.js` now imports from here instead of duplicating.
- **Opt-out flags:** `--no-install-tmux` (skip the brew/sudo step), plus the existing `--print-only` short-circuits everything beyond the JSON print.

### Stage 9c (cold-start UX + Windows experimental labeling)
- **Render free-tier cold-start handling.** `waiting-lounge test` and `waiting-lounge status` now do a fast attempt (4–5 s) first; if that times out or returns 502–504/ECONNRESET, they print "Backend may be waking up from sleep (this can take up to 45s)…" and retry once with a generous timeout. Previously, a brand-new user's first `test` would fail with "Couldn't reach the backend (timeout)" if Render had been idle 15+ minutes — looked like a broken install but was just a wake-up.
- **Silent warmup on install.** `waiting-lounge install` now fires a fire-and-forget `GET /health` to the backend at the very start. By the time the user finishes pasting the pair URL into their browser, the backend is usually warm. Never blocks, never reports errors — pure best-effort polish.
- **README "Supported platforms" matrix.** WSL2 verified; macOS + Linux native marked expected-OK pending verification; Linux headless functional with notes; **native Windows labeled "experimental — use WSL"** until a real test pass lands. The static review found three native-Windows-only quirks that would need fixing (auth.js openBrowser uses `start ""` without `cmd /c`, multiplexer can't find `claude.cmd`, tmux unavailable). All correctly avoided by routing native-Windows users to WSL.

### Stage 9b (headless detection)
- **`isHeadless()` gate on auto-open.** When the install command runs on a machine with no graphical display reachable, the auto-open call is skipped and a clear message replaces it ("No graphical display detected — copy the link above into a browser on your local machine"). Headless = native Linux without `$DISPLAY` AND without `$WAYLAND_DISPLAY` AND not WSL AND `$BROWSER` not set. macOS / native Windows / WSL / `$BROWSER`-set environments are never treated as headless. Suppresses the confusing `xdg-open: no method available` stderr line that SSH / Docker / CI users would otherwise see.

### Stage 9 (frictionless one-line install)
- **`waiting-lounge install` auto-merges settings.json** by default (was opt-in before). Default mode writes the 4 hook entries (`UserPromptSubmit`/`Notification`/`PostToolUse`/`Stop`) into `~/.claude/settings.json`, preserving any unrelated top-level keys and existing hook entries from other tools. Re-running `install` is idempotent — our entries are replaced cleanly, not duplicated.
- **Timestamped backup** at `~/.claude/settings.json.bak.<ISO>` before any edit. Rollback is one `cp` away.
- **Pair URL auto-opens** in the user's default browser via `open` (macOS) / `cmd.exe /c start` (Windows + WSL) / `xdg-open` or `$BROWSER` (Linux). URL is also printed as fallback if auto-open fails.
- **Opt-outs:** `--print-only` (don't touch settings.json, don't open browser), `--no-open` (skip browser), `--ask` (prompt before merging — for cautious users).
- **`waiting-lounge pair`** also auto-opens the URL (with `--no-open` to disable). Was print-only before.
- **Roadmap §9 override** logged in `docs/decisions.md` — the original "never silently edit Claude Code settings" preference is overridden because (a) the privacy invariant is unchanged, (b) the user explicitly asked for one-line install, (c) the backup makes rollback trivial.
- **One-liner from a fresh machine:** `npm install -g github:hongzhezzzz/waiting-lounge && waiting-lounge install` → click pair URL once → `waiting-lounge dock`. No manual JSON paste.

### Stage 8 (TUI polish — design system)
- **`cli/lib/theme.mjs`** (new) — single source of truth for colors, borders, brand identity, round metadata, and shared components. Color tokens (`C.brand`, `C.success`, `C.warning`, `C.danger`, `C.peer`, `C.link`); border tokens (`B.primary`, `B.panel`, `B.strong`); shared components `Banner`, `Footer`, `Hint`, `Key`, `Title`, `PhasePill`. Six design rules at the top of the file.
- **Every scene gets a one-line dimmed footer** listing exactly the keys that work right now (`[F] find match  ·  [B] bot now  ·  [Q] quit`). Replaces the previous mix of "Press X" prose, "K = action" lists, and bracket-less keys.
- **Searching scene** — always shows the bot-fallback line, not just when timer is active. Color shifts cyan as bot fill becomes imminent (≤5s).
- **Match-end transition** — `MatchEndScreen` now shows "Finalizing match…" placeholder when `state.end` is null, instead of returning `null` and going blank.
- **Match-end content** — trophy/silver-medal/handshake icons by outcome, formatted final chips (1,180 vs 1180), payout line in outcome color.
- **Bet-phase timer** — turns red+bold when ≤3s remain. Locked tier shows `✓` next to the key.
- **Round renderers** — consistent title format (`<icon> <title>` in cyan/bold + dim subtitle), shared `PhaseHint` and `LockedLine` helpers (lifted from 6 round files), Key-component for every keystroke. Indian Poker uses theme color tokens for the card boxes.
- **CollapsedStrip** — `[^L]` bracketed key (was `^L`), action verb adapts (`enter` mid-match, `open` otherwise), inline mini-key affordances visible in the lobby state.
- **Multiplexer focus banner** — re-formatted to design system: cyan inverse, brand-key affordance format (`[Ctrl-L] enter the lounge`).
- **Forfeit confirm dialog** — softer copy ("Forfeit this match?" + "You'll lose the antes already in the pot.") and the standard `[Y] forfeit  ·  [N] keep playing` Footer.
- **Reconnecting banner** — friendlier copy ("We'll re-sync within 10 seconds. You can keep watching.").
- **Pairing screen** — "Didn't open? Copy that URL into any browser" fallback hint; code-tail in yellow+bold.
- **Error screen** — bordered danger box with clear message + retry instruction.
- **`waiting-lounge help`** — sectioned (Get started · Open the lounge · Integrations · Diagnostics · Maintenance · Privacy promise), self-audit pointer to `local-hook/hook.js`.
- **`waiting-lounge install`** — sectioned 3-step output (`Step 1 — JSON` / `Step 2 — pair` / `Step 3 — verify`), brand mark, sub-`·` formatted next-steps.
- **`waiting-lounge status`** — `✓` / `✗` indicators on each check; brand mark.
- **`waiting-lounge attach`** — Ctrl-B+x clarification: switch focus FIRST (per user's prior observation that Ctrl-B+x can kill claude when claude has focus).

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
2026-05-13 (Stage 8 TUI polish merged to main. Stage 9 frictionless install in flight — auto-merge settings + auto-open pair URL).
