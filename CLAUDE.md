# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ground rules

These were agreed with the user (a non-engineer collaborator). They govern how Claude works in this repo and are non-negotiable unless the user explicitly relaxes one. The user can edit any rule by editing this file directly.

1. **One phase at a time, always demonstrable.** Every phase ends with something the user can click or run themselves. Do not stretch into invisible infra-only work.
2. **The user pokes it before moving on.** Do not start phase N+1 until the user has used phase N and confirmed it feels right.
3. **Plain-language status.** Report progress in product terms ("you can now match two browser windows on the same tag"), not engineering terms. No jargon unless asked.
4. **Small commits, easy rollbacks.** Commit at every working point with messages the user can read. "Go back to last working version" must always be a viable option.
5. **Ask when it affects product feel; decide when it's plumbing.** Pairing flow, copy, tags, alert behavior → ask. Express middleware, file naming, lockfile choice → decide. If miscategorized, recalibrate when corrected.
6. **Privacy invariant gets a paragraph every time the hook changes.** Any code path touching the hook payload requires a plain-English explanation of what is sanitized and what is sent. No silent changes to that path.
7. **No fake data masquerading as real.** Mockup phases use obviously-fake placeholders. When wiring real systems, test with two real browser windows, not stubs.
8. **Manual testing is the test suite until Phase 7.** The roadmap's per-phase acceptance checks are the tests. Walk the user through them before declaring a phase done.
9. **Default to doing fiddly technical work yourself, not handing it to the user.** Anything requiring precise syntax — config file edits, JSON/YAML, exact paths, multi-step shell sequences, settings merges — Claude executes directly rather than writing instructions for the user to follow. The user's role is to trigger, test, and decide, not to transcribe. Only put work on the user when it genuinely requires their machine, their input, or their judgment: approving a permission prompt that only their session can handle, running their own Claude Code to fire a real hook, clicking through UI to feel the experience, or choosing between product options. When in doubt, do it yourself and tell the user what changed in plain language.
10. **A regression of a previously-fixed bug means the fix vanished — verify before re-fixing.** When the user reports "X is broken again," your first move is `git log --all --oneline | grep <fix-keyword>` and `grep` the live source for the fix's distinguishing tokens (a function name, a comment, a state field). NEVER assume the regression is a fresh bug — search for the lost fix first. Common causes of vanishing fixes: a `git push` that warned about upstream tracking and silently failed to push the latest commit; a squash-merge that only included the original PR commits and dropped a follow-up commit added later on the same branch; a subsequent edit that overwrote the fix; a branch deletion before the fix was pushed. **After every `git push`, verify on origin** (`git ls-remote origin <branch>` should match local `git rev-parse <branch>`). **After every PR merge, verify the merged commit contains the fix you expect** (`git show <merge-commit> -- <file> | grep <token>`). When this rule is broken, the user pays for it twice — once for the original bug, once for the silent regression.
11. **Frictionless-first.** The most frictionless design wins — for every user touchpoint. When choosing between an option that requires extra install/setup/config and one that doesn't, default to the zero-setup option unless the dependency is overwhelmingly common in the target audience. **Quantitative bar: if ≥20% of target users would need an extra setup step (install a binary, edit a config file, run a setup command), build the version that doesn't require it.** Applies to: dock/multiplexer choice, install commands, settings.json edits, terminal/browser flows — anything where "what does the new user have to do before this works" is a question. When unsure whether the tradeoff is worth it, ship the frictionless version even if the engineering effort is significantly higher. The user's framing (locked 2026-05-08): "we want the most frictionless design for user to open this lounge — this is an important guideline for all designed part of this APP."

Two files exist specifically because the user cannot read code:
- `docs/status.md` — the truth about what currently works. Update it whenever a phase or feature changes state.
- `docs/decisions.md` — append-only log of non-obvious choices and their reasons. Add an entry whenever a real choice is made.

## Repository status

This repo currently contains **only design documents** — no code, no package manifests, no build system yet. The project ("Waiting Lounge") is in pre-implementation planning. Source documents:

- `waiting_lounge_design_spec.md` — product/UX spec (screens, copy, tone, scope)
- `waiting_lounge_engineering_roadmap.md` — phased build plan with code stubs

Read both before making non-trivial changes. Do not invent commands, scripts, or file paths that aren't in those docs or already on disk.

## What is being built

Waiting Lounge is a companion app for Claude Code users: while their coding agent is working, users opt into a temporary, anonymous web lounge to chat 1-on-1 or post to a short-lived board. When Claude Code needs attention, the browser alerts them to return to the terminal.

Three components, intended to live in sibling folders inside this repo:

```
local-hook/   Node.js script invoked by Claude Code hooks; sanitizes events
web/          Next.js + Tailwind frontend (lounge UI, alerts)
backend/      Node.js + Express + Socket.IO (matching, chat, board, status)
docs/         (planned) supplementary docs
```

Data flow (see roadmap §0):

```
Claude Code → local hook (sanitizer) → backend → WebSocket → browser lounge
```

## Non-negotiable privacy invariant

The local hook is the privacy firewall. **Never** send raw Claude Code hook JSON to the backend. The local script must discard prompts, code, repo paths, working directory, transcript paths, tool inputs/outputs, and assistant messages, and only POST a sanitized payload of the shape:

```json
{ "anonymousDeviceId": "uuid", "status": "waiting|needs_attention|done", "client": "claude-code", "timestamp": 0 }
```

This invariant is the product's core trust promise (spec §5, roadmap §1). Any backend route, schema, or log line that could receive raw hook content is a bug regardless of how it's framed.

## Status vocabulary

Hook events map to user-facing statuses (spec §8). Use these exact terms; do not overclaim completion:

| Hook event             | Status           | UI language                    |
|------------------------|------------------|--------------------------------|
| UserPromptSubmit       | waiting          | "Claude is working"            |
| Notification           | needs_attention  | "Claude needs your attention"  |
| Stop                   | done             | "Claude may be done"           |

`Stop` does **not** mean the full task finished — phrase it as "may be done" / "check your terminal".

## Build order

Roadmap §3 prescribes strict phase order with acceptance checks between each phase. When asked to "build the app," default to building **one phase only** and stopping at its acceptance check. Phases:

1. Local hook proof (sanitized events to `~/.waiting-lounge.log`)
2. Frontend mockup (Next.js + Tailwind, fake data only)
3. Local backend with Socket.IO + in-memory matching/chat
4. Message board fallback
5. Connect local hook → backend (pairing via one-time session URL is the recommended MVP option)
6. Replace in-memory state with Postgres + Redis
7. Safety controls (report/block, rate limits, secret-pattern warnings)
8. Deployment (Vercel + Render/Railway/Fly + Supabase + Upstash)
9. Installer CLI (`waiting-lounge install|status|test|uninstall`)
10. Beta

Do not skip ahead. Do not silently modify users' Claude Code settings — print the JSON block for them to paste (roadmap §12).

## MVP scope guardrails

Out of scope for MVP (spec §12) — do not add unprompted: accounts, persistent DMs, friends, mobile app, voice/video, file/image upload, leaderboards, public profiles, AI moderation, payments. Identity is anonymous handles only (e.g. `blue-cursor-241`); no real names or persistent histories.

## Stack (when code is written)

Per roadmap §2 — use these unless the user redirects:

- Frontend: Next.js (App Router) + React + TypeScript + Tailwind
- Backend: Node.js + Express + Socket.IO
- Realtime: Socket.IO
- Prod storage: Supabase Postgres + Upstash Redis (in-memory is fine for prototype phases)
- Local hook: plain Node.js, no heavy deps; must never block Claude Code if backend is unreachable

## Working with hooks

Claude Code's hook schema may evolve. Before writing or changing hook integration code, verify the current schema at https://code.claude.com/docs/en/hooks and https://code.claude.com/docs/en/hooks-guide rather than relying solely on the snippets in the roadmap.
