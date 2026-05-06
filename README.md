# Waiting Lounge

A lightweight, opt-in social waiting room for people whose coding agents are working. While Claude Code is busy, users can join a temporary anonymous lounge to chat 1-on-1 or post to a short-lived board. When the agent needs attention, the browser alerts them back to the terminal.

## Source documents
- `waiting_lounge_design_spec.md` — product spec (screens, copy, tone, scope)
- `waiting_lounge_engineering_roadmap.md` — phased build plan
- `CLAUDE.md` — instructions for Claude Code working in this repo, including agreed ground rules

## Current state
See [`docs/status.md`](docs/status.md). It's the truth about what works right now.

For non-obvious choices we've made along the way, see [`docs/decisions.md`](docs/decisions.md).

## Repo layout
```
local-hook/   Node.js script Claude Code invokes via hooks; sanitizes events
web/          (planned) Next.js + Tailwind frontend
backend/      (planned) Express + Socket.IO server
docs/         status.md and decisions.md
scripts/      one-shot helpers
```

## Setup so far
This is a local git repo. There is no GitHub remote yet — we'll add one later if and when we need backup, sharing, or auto-deploy.

## Privacy promise
The local hook discards Claude Code's raw payload before anything leaves your machine. No prompts, code, repo paths, transcripts, or tool data are sent anywhere — only an anonymous `{ status, timestamp }`. See `local-hook/README.md`.
