# Project status

The truth about what currently works — not what is planned. Updated whenever a phase or feature changes state.

## Current phase
Phase 1 — local Claude Code hook proof. Code written, awaiting your acceptance check.

## What works
- Repo initialized as a git repo (local only, no remote).
- Ground rules written to `CLAUDE.md`.
- Folder structure created: `local-hook/`, `web/`, `backend/`, `docs/`, `scripts/`.
- Phase 1 hook script written at `local-hook/hook.js`. Verified locally that piping fake JSON to it writes only the sanitized event line — the raw input is discarded.

## What's in progress
Phase 1 acceptance check on your end. See `local-hook/README.md` for what to do.

## What's blocked
Nothing.

## What's next (after Phase 1 passes)
Phase 2 — Next.js + Tailwind frontend mockup with fake data. No backend yet.

## Last updated
2026-05-06
