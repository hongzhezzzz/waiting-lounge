# Decisions log

Non-obvious choices we've made, one or two lines each. Append-only — if a decision is later reversed, add a new dated entry rather than editing the old one. That way you can see the history.

Format: `YYYY-MM-DD: <decision> — <one-line reason>`

---

- 2026-05-06: Use git locally with no GitHub remote yet — version control gives us rollback without needing an online account. We can add GitHub later if/when we need backup, sharing, or auto-deploy.
- 2026-05-06: Repo lives inside the user's Dropbox folder — convenient because it's already synced across the user's devices. Small risk: Dropbox can occasionally sync the `.git/` directory mid-write and corrupt history. If we ever see "fatal: bad object" or similar, that's the cause and we move the repo out of Dropbox.
- 2026-05-06: Default git branch is `main` — modern default, no other reason.
- 2026-05-06: Phase 1 hook writes to `~/.waiting-lounge.log` (the user's home folder), not into the repo — keeps event logs out of git history and out of Dropbox sync.
