# Project status

The truth about what currently works — not what is planned. Updated whenever a phase or feature changes state.

## Current phase
Phase 1 — **done, awaiting your sign-off.** Hooks fire live from a real Claude Code session.

## What works
- Repo initialized as a git repo (local only, no remote).
- Ground rules written to `CLAUDE.md` (9 rules).
- Folder structure created: `local-hook/`, `web/`, `backend/`, `docs/`, `scripts/`.
- Phase 1 hook script at `local-hook/hook.js`. Sanity test passed — piped fake JSON containing "DO_NOT_LEAK_THIS" / "secret" / "private" produced only sanitized event lines. Raw input is discarded.
- `.claude/settings.json` wired with three bindings (UserPromptSubmit → start, Notification → attention, Stop → done).
- **Live verification:** after a Claude Code restart, sending a real prompt produced a `waiting` event in `~/.waiting-lounge.log` with no prompt content leaked. Privacy invariant holds.

## What's in progress
Nothing. Waiting for the user to confirm Phase 1 feels right before starting Phase 2.

## What's blocked
Nothing.

## What's next (after Phase 1 passes)
Phase 2 — Next.js + Tailwind frontend mockup with fake data. No backend yet.

## Last updated
2026-05-06
