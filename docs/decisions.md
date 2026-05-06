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
