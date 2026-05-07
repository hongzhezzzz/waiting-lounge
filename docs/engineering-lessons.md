# Engineering lessons

Append-only. Every entry is a class of bug we hit at least once. Skim this before starting a new phase — it's faster than re-debugging the same shape of mistake.

Format: each section groups by category. Within a section, each item is one short paragraph: **what went wrong** → **symptom** → **prevention**.

---

## Build / deploy

- **Non-ts files don't end up in `dist/`.** `tsc` only emits `.js` from `.ts` — `.json`, `.sql`, `.txt` are ignored. **Symptom:** prod startup crashes with `ENOENT` on a path inside `dist/`. **Prevention:** every new asset under `backend/src/` that's read at runtime needs an explicit `cp` in the `build` script. The script under `backend/src/games/brainBet/` already globs `*.json` — keep that pattern.

- **Vercel's prod build runs ESLint and treats warnings as errors.** Things that pass `tsc --noEmit` and `next dev` (warnings only) will block `next build` (errors). **Symptom:** Vercel deploy errors with "`Error: Command 'npm run build' exited with 1`" pointing at unused vars or `any`. **Prevention:** `npm run build` (web) is part of the pre-flight checklist — don't trust typecheck alone.

- **`NEXT_PUBLIC_*` env vars are baked at build time.** Setting them after a Vercel deploy doesn't update the live bundle. **Symptom:** signed-in user gets "Auth not configured" even though Vercel dashboard shows the var. **Prevention:** set Vercel env vars **before** triggering the deploy that needs them; if you change them, click Redeploy.

## Type safety

- **No `any` types.** Use `unknown` + narrowing or a discriminated union. `any` propagates silently and lint blocks prod builds. **Prevention:** if the shape is unknown, type it as `Record<string, unknown>` and narrow on access.

- **No unused imports / vars / types.** ESLint catches these but only in prod build. **Prevention:** when refactoring, delete the imports along with the code. When narrowing, drop intermediate `_payload` locals if they're not actually used.

- **Apostrophes / quotes in JSX text trip `react/no-unescaped-entities`.** `"No one's on the board"` fails the prod lint; the warning is build-blocking. **Prevention:** rewrite the sentence (e.g. "No one is"), or escape with `&apos;`. Same applies to double-quotes.

## Cold-start state

- **In-memory state dies when the Render free-tier dyno sleeps.** Anything required for correctness across a sleep needs Postgres. **Symptom:** lounge badge stuck "Not connected" after idle period. **Prevention:** if data has to survive a long pause, it's a table — see `device_last_status`. Hot caches in memory are fine; cold-correctness state is not.

- **Game state during a game is in-memory by design.** That's OK because games are short-lived (≤10 min). The cold-start refund processor (`processStalePendingRefunds`) recovers antes from any game that was active when a sleep happened. Don't add new in-memory state that holds money without an equivalent recovery path.

## Race conditions

- **Client `socket.on(...)` listeners must attach before the server can emit.** Pattern that broke once: emit `queue_for_game`, then attach `game_state_update` listener — server emitted `round_start` instantly after match, listener wasn't there yet. **Prevention:** in a `useEffect` that's going to trigger an event, attach the response listeners *first*, then emit. If the event might already have been fired before the listener mounted, also check the singleton socket's recently-buffered events on attach (we use `socket.onAny` for that in `test-game-e2e.mjs`).

- **Auth-dependent socket reconnects can drop subscriptions.** When the JWT is set/cleared, the singleton socket disconnects + reconnects. Any per-component listener attached via `socket.on` survives (the singleton is the same), but anything that depends on `socket.id` or `me.deviceId` server-side gets a fresh socket id. **Prevention:** re-emit identity-establishing events (`register_device`, `register_handle`) on every `connect` event, not just on first mount.

## Auth / config (Supabase)

- **OTP token length defaults to 8 in Supabase.** Our login UI hard-coded a 6-digit input. **Symptom:** users get a 6-digit code in email but can't paste an 8-digit value. **Prevention:** explicitly set `mailer_otp_length = 6` via the Management API on first project setup.

- **`mailer_autoconfirm = false` (default) sends "Confirm signup" email instead of the magic-link/OTP template.** The confirm-signup email has no token, just a link. **Symptom:** user gets email with a confirmation URL, clicks it, lands nowhere useful, never sees the OTP code. **Prevention:** for an OTP-only sign-up flow, set `mailer_autoconfirm = true` so first-time sign-ups skip the confirm step and go straight to magic-link template (which we customized to include `{{ .Token }}`).

- **Free-tier Supabase SMTP caps at 2 emails per hour.** **Symptom:** pilot stalls after a couple of test sign-ins. **Prevention:** for any pilot with >1 user, route auth emails through a custom SMTP — Gmail SMTP via App Password works for ≤500/day and needs no domain verification.

## UX

- **States that can stick need a TTL.** The "Claude needs your attention" badge would persist forever after a stale Notification because no `Stop`-like event ever cleared it. **Prevention:** any UI state that depends on an external event clearing it gets a client-side fallback timer (90s for `needs_attention` → `done`).

- **Destructive nav needs a confirmation.** Pressing the header logo while in a game silently aborted the game with refund. **Prevention:** any flow that ends/forfeits a money-bearing process gets a confirm modal + browser `beforeunload` guard. Use the `InGameContext` pattern.

- **Voluntary leave during a money flow must trigger settlement, not just a status emit.** Initial `abort()` on the SpotTheBugGame emitted `game_aborted` but didn't clear `pending_refunds` rows or move points. Money was still recoverable on cold-start, but the user-visible balance lagged. **Prevention:** on any voluntary game termination path, call `settleGame` (with `winnerId = null` for refund-as-tie) before deleting in-memory state.

## DB

- **Multi-row state changes must be transactional.** Two concurrent games charging the same user could deduct twice without a transaction + lock. **Prevention:** wrap every multi-row mutation in `BEGIN; ... ; COMMIT` and use `SELECT ... FOR UPDATE` ordered by id (sorted to prevent deadlock between concurrent transactions).

- **Schema migrations stay idempotent.** `applySchema()` runs on every backend boot. **Prevention:** every CREATE uses `IF NOT EXISTS`. Indexes too. Renames need explicit DROP + CREATE guarded by existence checks.

## Node runtime

- **Node 18 doesn't expose `globalThis.crypto`.** `jose` v6 webapi build requires it. **Symptom:** "ReferenceError: crypto is not defined" in `verifySupabaseJwt`. **Prevention:** polyfill at the very top of `server.ts`:
  ```ts
  import { webcrypto } from "node:crypto";
  if (!globalThis.crypto) (globalThis as unknown as { crypto: unknown }).crypto = webcrypto;
  ```
  Render's runtime is Node 20+ and doesn't need this; harmless either way. Remove once local Node is 20+.

## Pre-flight checklist (run before opening every PR)

```
[ ] Backend `npm run typecheck` clean
[ ] Backend `npm run build` produces the right dist/ files (any new JSON banks?)
[ ] Web `npm run build` clean (catches ESLint errors that typecheck misses)
[ ] backend/test-game-e2e.mjs still PASSES (regression)
[ ] Manual 2-window test of the new feature on local dev
[ ] Any new in-memory state? — explicitly OK with cold-start, or use Postgres
[ ] All state-changing DB ops in a transaction
[ ] All new operations idempotent (or explicitly noted otherwise)
[ ] No `any` types, no unused imports
[ ] Updated docs/status.md, docs/decisions.md, this file (if new lesson)
```
