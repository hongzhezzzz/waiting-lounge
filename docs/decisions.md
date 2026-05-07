# Decisions log

Non-obvious choices we've made, one or two lines each. Append-only — if a decision is later reversed, add a new dated entry rather than editing the old one. That way you can see the history.

Format: `YYYY-MM-DD: <decision> — <one-line reason>`

---

- 2026-05-06: Use git locally with no GitHub remote yet — version control gives us rollback without needing an online account. We can add GitHub later if/when we need backup, sharing, or auto-deploy.
- 2026-05-06: Repo lives inside the user's Dropbox folder — convenient because it's already synced across the user's devices. Small risk: Dropbox can occasionally sync the `.git/` directory mid-write and corrupt history. If we ever see "fatal: bad object" or similar, that's the cause and we move the repo out of Dropbox.
- 2026-05-06: Default git branch is `main` — modern default, no other reason.
- 2026-05-06: Phase 1 hook writes to `~/.waiting-lounge.log` (the user's home folder), not into the repo — keeps event logs out of git history and out of Dropbox sync.
- 2026-05-06: Phase 2 frontend uses Next.js 14 App Router + Tailwind, scaffolded by `create-next-app` with TypeScript, ESLint, `src/` directory, `@/*` import alias — matches roadmap §5 and gives clean route folders for the screens listed in spec §7.
- 2026-05-06: Visual default is warm off-white (#FAF7F2) background, sage accent (#7FA98A), amber alert tone, generous whitespace, rounded-2xl cards, Geist Sans + small mono touches — aims at spec §14 "lightweight, friendly, slightly playful, low-pressure." Easy to swap once the user reacts.
- 2026-05-06: Demo Claude-needs-you alert wired as a small floating "▶ demo alert" button on `/chat` and `/board` — lets the user feel the alert without a backend. Removed/relabelled when Phase 5 wires it to real events.
- 2026-05-06: Mock chat replies happen in-component with a fake 1.2s peer reply — kept obvious as a demo (peer always says "(demo) — …") so spec §7 rule about "no fake data masquerading as real" stays honored.
- 2026-05-06: Phase 3 backend is TypeScript run via `tsx watch` rather than ts-node-dev — `tsx` is the simpler, well-maintained option in 2026 and needs no extra config. Same dev ergonomics (auto-restart on save).
- 2026-05-06: Backend port is 4000, frontend stays on 3000 — keeps the two dev servers separable and matches the placeholder `NEXT_PUBLIC_SOCKET_URL` default.
- 2026-05-06: Server **never logs message bodies** — only metadata (room id, sender handle, length). Spec §11 mandates "temporary message storage"; even though MVP storage is just in-memory, we set the precedent now so the production migration in Phase 6 doesn't accidentally start persisting bodies.
- 2026-05-06: `/chat` defaults to live (real socket); `?demo=1` keeps the fake-data path so the user can compare or show the app off without a backend.
- 2026-05-06: Anonymous handle generated server-side per connection (e.g. `gentle-diff-232`) — pulls from short colour/adjective + noun + 3-digit lists in `backend/src/lib/identity.ts`. No persistent identity in MVP.
- 2026-05-06: Block list is in-memory and per-socket — when a user blocks a handle, that handle is excluded from future matches *for the blocker only* during their current session. Persistent blocking lands in Phase 6 with the database.
- 2026-05-06: Known quirk on this machine — Next.js dev (HMR + file watcher) sometimes misses changes to files on `/mnt/c/...` (Windows filesystem under WSL2 + Dropbox sync), leaving the **server-side bundle stale** while the URL still returns 200. Symptom: page renders the previous version's content even after edits. Fix: stop the dev server, `rm -rf web/.next`, restart `npm run dev`. Hit this once during Phase 3 testing — the user saw fake chat data on `/chat?tag=...` because the SSR bundle for the chat route was cached from before the live-mode rewrite.
- 2026-05-06: "Find a new match" after peer-left was a `<Link>` to the same URL, which Next.js treats as a no-op. Replaced with a `searchNonce` state in `LiveChatWindow` — incrementing it forces the join effect to re-run and emit a fresh `join_queue`. Same trick is wired into the in-chat header "New match" link via an optional `onNewMatch` callback on `ReportBlockControls`.
- 2026-05-06: Phase 4 board lives at `/api/board` on the same Express server as the socket — one process to run, one CORS config. Endpoints: `GET /api/board?tag=`, `POST /api/board`, `POST /api/board/report`. In-memory `Map<id, BoardPost>`. 24-hour TTL, swept every 5 minutes. 10-second per-IP post cooldown (basic rate limit). Hide threshold: 3 reports auto-hide a post.
- 2026-05-06: Board posts get a freshly generated handle on every POST (no carryover from any chat handle) — there is no continuity of identity between a person's chat handle and their board posts. This is intentional for now: posting feels disposable, and we don't accidentally tie chat history to board history. Persistent identity is a Phase 6+ decision tied to durable storage.
- 2026-05-06: Frontend `MessageBoard` polls the API every 8 seconds — quick enough that posts from another window appear within seconds, slow enough that idle traffic is small. Replaced with a websocket push if board chat ever feels laggy.
- 2026-05-06: Board seeded with two welcome posts at backend startup so a fresh user doesn't land on an empty board (spec §9.2: "Do not leave the user on an empty spinner"). Seed posts are clearly meta ("Welcome. Posts vanish in 24h…") so they don't masquerade as real activity.
