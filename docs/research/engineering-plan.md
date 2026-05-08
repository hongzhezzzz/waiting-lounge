# Stage 3 — Engineering Plan

This document is the engineer-architect synthesis of the three Stage 3 research tracks (market survey, UX principles, game mechanics). Everything here is grounded in the three companion files in this folder.

**Decisions captured by Claude on the user's behalf** (per "make the reasonable call and continue"; user can redirect):

| Open question | Choice | Reasoning |
|---|---|---|
| Pool matchmaking first vs both pool+bot together | **Pool first (3a.5), bot fill in 3b.3** | Smaller, ship-and-poke. Pool alone fixes the most common case. |
| Replace old Brain Bet vs keep "Classic" | **Replace** | The user's pain *is* the old format; keeping it perpetuates the pain. |
| Daily Brain Bet solo vs multiplayer | **Solo (Wordle-shape)** | Wordle's sticking-power comes from same-puzzle-everywhere; multiplayer daily can come later. |
| Terminal play in 3c vs Stage 4 | **Defer to Stage 4 candidate** | The "long wait after match" is ~300–600 ms in fact; pool+bot in 3a/3b fix the actual matching wait. TUI is delightful but not the bottleneck. |
| Bot fill: 3 difficulties vs 1 calibrated | **One calibrated bot for MVP** | Easier to ship and trust. Tiers can come once the bot is proven. |

---

## Stage 3a — Quick wins (1–3 days each)

Each item ships independently. End-to-end demonstrable.

### 3a.1 — Surface the leaderboard in the nav, rename Join → Lounge
- **User-language:** "You can finally see the leaderboard from any page; the nav reads as places, not actions."
- **Files:** `web/src/components/HeaderNav.tsx`
- **Demonstrable:** click "Leaderboard" in the top bar from any page → land on `/leaderboard`.
- **Risk:** Low (one file).
- **Privacy invariant:** unaffected.

### 3a.2 — Homepage live-status cards (replace marketing copy)
- **User-language:** "The homepage shows real activity — how many people are around, what's happening on the board, who's at the top — instead of paragraphs about features."
- **Files:**
  - `web/src/app/page.tsx` — drop the three abstract feature cards; trim hero copy.
  - new `backend/src/routes/loungeStats.ts` — `/api/lounge/stats` returning `{ idleCount, inGameCount, postsLastHour, topThree }`.
  - new `web/src/components/HomeStatusCards.tsx` — three cards fetching live data.
  - `backend/src/server.ts` — wire the route.
- **Demonstrable:** open homepage → see real "X active · Y games · Z posts today" with top-3 leaderboard preview; click any card to navigate.
- **Risk:** Low (new endpoint, no schema change).
- **Privacy invariant:** unaffected (handle + count + age, public by design).

### 3a.3 — Lounge live ticker + warmer empty state
- **User-language:** "The lounge feels alive even with zero idle players — you see what just happened, top 3 leaders, and it doesn't apologize when no one's there."
- **Files:**
  - `web/src/app/lounge/page.tsx` — counter row, ticker, leaderboard preview card, warmer empty copy.
  - extend `backend/src/routes/loungeStats.ts` with `/recent` returning last 5 game results + last 3 board posts.
  - new `web/src/components/LoungeTicker.tsx`.
- **Demonstrable:** play a game in window A; in window B's lounge see the result line appear in the ticker.
- **Risk:** Low.
- **Privacy invariant:** unaffected.

### 3a.4 — Lucide iconography pass + slim marketing copy
- **User-language:** "Proper icons in the nav, hero, and cards; fewer words on the homepage and join page."
- **Files:**
  - `web/package.json` — add `lucide-react` (ISC).
  - `web/src/components/HeaderNav.tsx` — replace `◖` with `<Coffee>`; add icons before each nav item.
  - `web/src/app/page.tsx` — `<Users>`, `<Clipboard>`, `<Trophy>` on status cards; trim subhead.
  - `web/src/app/join/page.tsx` — iconified mood/mode chips; tighten chrome.
  - `web/src/components/BalanceChip.tsx` — `<Coins>` glyph.
- **Demonstrable:** consistent icon language across nav, cards, and game labels.
- **Risk:** Low (visual only).
- **Privacy invariant:** unaffected.

### 3a.5 — Pool matchmaking ("Find a match")
- **User-language:** "Click 'Find a match' and you sit in a single shared pool — instead of needing to find a specific person to challenge or match a particular duration/ante combo."
- **Files:**
  - `backend/src/sockets.ts` — new `queue_for_pool` event. Single shared queue per `gameType`. Default duration=5min, ante=100. Pair instantly when peer arrives.
  - `web/src/app/lounge/page.tsx` — primary "Find a match" button. Existing per-user "Challenge" stays as secondary.
- **Demonstrable:** two windows both click "Find a match" → games start within ~1 s.
- **Risk:** Low (reuses `startGameBetween()`).
- **Privacy invariant:** unaffected.

---

## Stage 3b — Medium efforts (3–7 days each)

### 3b.1 — Iterative-betting Brain Bet 2.0 (the user's #1 pain)
- **User-language:** "Brain Bet now plays like 10 connected hands of poker instead of 3 disconnected quiz questions. You start each match with 1000 chips. Every round you can check / raise / fold. Chip leader at the timer wins the 200-pt pot."
- **Files:**
  - `backend/src/games/brainBet/resolver.ts` — phased state machine per round (`reveal → bet → answer → showdown`); `chipStacks` running totals starting at 1000; per-round 50-chip forced ante; bet tiers (check / +25 / +50 / +100 / all-in / fold). End on bust or timer. Drop `monty_mirage`. Add `showhand` (deck-based hidden info).
  - `web/src/components/games/BrainBetRound.tsx` — chip-stack bar (replaces round-counter); bet-phase tier buttons; fold always available; showdown chip-flow; Showhand view.
  - `web/src/app/games/[gameType]/[roomId]/page.tsx` — handle new `bet_phase_open` / `answer_phase_open` events.
- **Critical engineering invariants** (from game-mechanics.md):
  1. **Bets MUST close before answers reveal.** Strict phase machine. Reject answer events during bet phase, reject bet events during answer phase.
  2. **Every round must support a Fold action.** A low-stack player must never be auto-bankrupted.
  3. **Running-stack chips live in `runner.state` only.** `transferPoints.ts` is unchanged. Settlement is still 100 ante in / 200 to winner.
- **Demonstrable:** play a 5-min match; chip stack moves visibly each round; one player can shove all-in and force a fold; match ends on bust or timer.
- **Risk:** Medium-High (largest single change in Stage 3, touches the most-played game). Mitigation: ship behind a `BRAIN_BET_V2` env flag for the first day; keep `monty_mirage` resolver code in place for rollback.
- **Privacy invariant:** unaffected (chip stacks live in memory only, never persisted, never logged).

### 3b.2 — Daily Brain Bet (one curated puzzle/UTC day, Wordle-shape)
- **User-language:** "Single fresh puzzle each day — same one for everyone — takes 60 seconds, feeds your streak. Comes back tomorrow."
- **Files:**
  - `backend/src/db/schema.sql` — `daily_brain_bet_attempts (user_id, date_utc, score)` and `streaks (user_id, current, longest, last_play_date)`.
  - new `backend/src/routes/daily.ts` — `GET /api/daily/today` (deterministic seeded by UTC date), `POST /api/daily/submit`.
  - new `web/src/app/daily/page.tsx` — 3-round solo flow against the timer; streak after submit; UTC midnight reset.
  - `web/src/components/HeaderNav.tsx` — add Daily link with `<CalendarClock>`.
  - `web/src/components/BalanceChip.tsx` — flame chip beside points when streak > 0.
  - `web/src/app/page.tsx` — Daily strip ("Today — 3 rounds · resets in 14h 22m").
- **Demonstrable:** click Daily → see today's puzzle; complete → streak=1; tomorrow new puzzle, streak=2.
- **Risk:** Medium (new schema, deterministic seeding, streak edge cases).
- **Privacy invariant:** unaffected.

### 3b.3 — Bot fill (Codingame pattern, honestly labeled)
- **User-language:** "If no human joins your pool within 30 s, a clearly-labeled 'lounge-bot-022' steps in. The bot vanishes the moment a real person queues."
- **Files:**
  - new `backend/src/games/brainBet/bot.ts` — calibrated single-difficulty bot. Uses existing question banks. Synthetic socketId (`bot:<uuid>`), synthetic handle (`lounge-bot-022`). Never inserted into `users` map or `point_transactions`.
  - `backend/src/sockets.ts` — `queue_for_pool` 30 s wait-or-fill timer. Cancel on human pair. Bot games skip `chargeAntes` / `settleGame`.
  - `backend/src/games/brainBet/resolver.ts` — accept `botPlayer`, route bot socketId actions through bot module.
  - `web/src/components/games/BrainBetRound.tsx` — robot icon when peer handle starts with `lounge-bot-`; "Bot match — points don't change" notice.
  - `web/src/app/lounge/page.tsx` — "no human yet — bot in 12 s" countdown.
- **Demonstrable:** click Find a match alone → after 30 s, bot opponent joins, clearly labeled. Play full match. No points change in account.
- **Risk:** Medium. Honesty labeling is critical (CLAUDE.md rule #5).
- **Privacy invariant:** unaffected.

---

## Stage 3c — Heavy bets (>1 week, gated on 3b validation)

### 3c.1 (Stage-4 candidate) — Terminal play (`waiting-lounge play`)
- **Status:** **Deferred to Stage 4 candidate.** Engineer recommendation: defer unless 3b finishes early. The matching wait is solved by 3a.5 + 3b.3; TUI is delight, not bottleneck.
- **Outline if greenlit:**
  - new `cli/play.js` — readline + ANSI TUI, `socket.io-client`.
  - new `cli/login.js` — browser→CLI JWT exchange via short-lived `/api/cli/exchange?code=…`.
  - new `backend/src/routes/cliExchange.ts`.
  - new `web/src/app/cli-pair/page.tsx`.
  - hook stays untouched; TUI is a sibling process.
- **Privacy paragraph (mandatory at PR time):** TUI process and hook process share no in-flight state. Only shared on-disk artifact is `~/.waiting-lounge/device_id` (existing) plus a new `~/.waiting-lounge/auth_token` (CLI-only, hook never reads). The hook payload is unchanged.
- **Risk:** High (~200–400 LOC; cross-platform TUI rendering, especially Stock Direction sparkline + Big-O code blocks; auth bridge complexity).

### 3c.2 (Stage-4 candidate) — Solo Brain Bet Storm (Lichess pattern)
- **Status:** Deferred to Stage 4 candidate.
- **Outline:** 3-min solo timed run through existing question banks; best-today and best-all-time persisted per user.

---

## Cross-cutting

### Phase ordering / dependencies
- 3a items are largely independent. Recommended: 3a.1 → 3a.2+3a.4 (both touch homepage) → 3a.3 → 3a.5.
- **3b.1 blocks 3b.2** — Daily should reuse the new betting loop.
- **3a.5 blocks 3b.3** — bot fill needs a pool to fill into.
- 3c items both depend on 3b.1 (TUI and Storm both render the new betting UI).

### Risk per phase

| Phase | Risk | Reason |
|---|---|---|
| 3a.1 nav | Low | Single file. |
| 3a.2 status cards | Low | Additive endpoint. |
| 3a.3 ticker | Low | Read-only SQL. |
| 3a.4 icons + copy | Low | Visual. |
| 3a.5 pool matchmaking | Low | Reuses `startGameBetween`. |
| 3b.1 iterative betting | Medium-High | Largest change; touches most-played game. |
| 3b.2 Daily | Medium | New schema, streak edge cases. |
| 3b.3 bot fill | Medium | Honesty labeling and point-exclusion airtightness. |
| 3c.1 terminal play | High | Cross-platform TUI, ~300 LOC. |
| 3c.2 Storm | Medium | New game shell. |

### Privacy invariant per phase
- 3a.* and 3b.*: **unaffected.** Pure web/socket/backend logic and new schema unrelated to hook.
- 3c.1: **structurally affected** — adds a sibling CLI process that uses Socket.IO. Hook payload itself unchanged. PR-time privacy paragraph required.
- 3c.2: unaffected.

### Pre-flight checklist (run before opening every Stage 3 PR)
```
[ ] Backend `npm run typecheck` clean
[ ] Backend `npm run build` produces the right dist/ files
[ ] Web `npm run build` clean (catches ESLint errors)
[ ] backend/test-game-e2e.mjs still PASSES
[ ] Manual 2-window test of the new feature on local dev
[ ] No new in-memory state that wouldn't survive a Render cold-start (or explicit reasoning)
[ ] All state-changing DB ops in a transaction
[ ] All new operations idempotent (or explicitly noted otherwise)
[ ] No `any` types, no unused imports
[ ] Updated docs/status.md, docs/decisions.md, docs/engineering-lessons.md (new lessons)
```
