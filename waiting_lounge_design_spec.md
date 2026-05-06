# Waiting Lounge Design Spec

**Working name:** Waiting Lounge  
**Target integration:** Claude Code first; adaptable later to Codex/Cursor/other coding agents  
**Audience for this document:** Founder, product designer, coding agent, or engineer who needs to understand what the app should feel like before implementing it  
**Last updated:** 2026-05-06

---

## 1. One-sentence concept

Waiting Lounge is a lightweight, opt-in social waiting room for people whose coding agents are currently working.

The user should feel:

> “My agent is busy. Instead of staring at the terminal, I can briefly chat, post, or browse. When the agent needs me, the app brings me back.”

---

## 2. Core product promise

The app should solve a very specific moment:

1. The user gives Claude Code a task.
2. Claude Code starts working.
3. The user has a few idle seconds or minutes.
4. The user can optionally join a temporary online lounge.
5. The user can chat with another waiting user or read/post to a lightweight board.
6. When Claude Code needs input or finishes, the app alerts the user.

This is not a full social network. It is not Discord. It is not Reddit. It is not a developer forum.

It is a small social layer attached to the waiting state of AI coding agents.

---

## 3. The central design principle

The agent workflow is primary. The lounge is secondary.

That means:

- The app should never make the user miss Claude Code's attention request.
- The app should be easy to enter and easy to leave.
- No match or conversation should punish the user for leaving suddenly.
- The app should feel temporary, lightweight, and low-pressure.
- The app should not ask the user to share code, prompts, repo names, or private project details.

The product should feel like:

> “A short coffee-break lobby for people waiting on agents.”

Not:

> “A new platform that demands attention.”

---

## 4. Target user

Primary user:

- Developers, researchers, builders, students, or technical writers using Claude Code.
- They often wait during refactors, test fixes, debugging loops, documentation generation, or codebase exploration.
- They may be curious, bored, stuck, or simply waiting for the next permission prompt.

Secondary user later:

- Codex users
- Cursor users
- Other AI coding-agent users
- Researchers/writers using agentic tools outside software development

---

## 5. Non-negotiable privacy message

The app must clearly state:

> We do not receive your code.  
> We do not receive your prompt.  
> We do not receive your repo path.  
> We do not receive your transcript.  
> We only receive anonymous status signals such as waiting, needs attention, or done.

This privacy promise should appear on:

- Homepage
- Install page
- First-run screen
- Settings/about page
- GitHub README

The local hook should be described as a privacy filter:

> Claude Code may provide detailed local context to hooks. Our local script discards that context before sending anything to the server.

---

## 6. Core user journey

### Journey A: First-time user

1. User hears about Waiting Lounge.
2. User visits the website.
3. User reads the privacy promise.
4. User installs a small local Claude Code hook.
5. User runs a test command.
6. User starts a Claude Code task.
7. The terminal prints or opens a link: “Join Waiting Lounge.”
8. User clicks the link.
9. User chooses a lightweight tag.
10. User enters either random chat or message board.
11. Claude needs attention.
12. Browser shows a large alert: “Claude needs you.”
13. User returns to terminal.

### Journey B: Returning user

1. User starts a Claude Code task.
2. The link appears automatically or is available from the local helper.
3. User opens lounge.
4. User chooses tag or uses last tag.
5. User joins a short chat or board.
6. User leaves when Claude needs attention.

---

## 7. Main screens

### 7.1 Homepage

Goal: explain the product in 10 seconds.

Suggested copy:

> Your coding agent is working.  
> You do not have to stare at the terminal.  
> Join a temporary waiting room with other people whose agents are also running.

Primary button:

> Join demo lounge

Secondary button:

> Install Claude Code hook

Trust text:

> No code, prompts, repo paths, transcripts, or file names are uploaded.

---

### 7.2 Waiting entry page

Shown after user clicks from Claude Code.

Core text:

> Claude is working. What kind of wait is this?

Tag buttons:

- Debugging
- Tests
- Refactor
- Frontend
- Backend
- ML / AI
- Writing
- Research
- Startup idea
- Random

Mood buttons, optional:

- Focused
- Stuck
- Bored
- Curious
- Procrastinating
- Excited

Mode buttons:

- 1-on-1 quick chat
- Message board
- Browse lobby

---

### 7.3 Random 1-on-1 chat

Purpose: short, temporary conversation between two waiting users.

Opening message:

> Matched with another waiting builder.  
> This chat disappears when either person leaves.  
> Do not share secrets, code, credentials, or private project details.

Visible controls:

- Leave
- New match
- Report
- Block

Starter prompts:

- What is your agent working on, vaguely?
- What did your agent mess up today?
- Are you debugging, refactoring, or waiting on tests?
- Ask me a 30-second coding opinion.
- Share a tiny win.

Important wording: use “vaguely” when asking about work.

---

### 7.4 Message board

Purpose: fallback content when no live match exists and lower-pressure interaction for users who do not want direct chat.

Board sections:

- What are you waiting on?
- Claude just did something weird
- Tiny wins
- Ask a 30-second question
- Funny agent failures
- Prompt/setup tips
- Research/writing lounge

Rules:

- Posts are short.
- Posts expire by default after 24 hours.
- No file uploads in MVP.
- No image uploads in MVP.
- No private code or credentials.

Suggested post format:

```text
Tag: Debugging
Mood: mildly suffering

“My agent has been fixing the same test for 15 minutes.
What’s the most times you’ve seen an agent retry the same issue?”
```

---

### 7.5 Claude-needs-you alert

This is one of the most important screens.

When Claude Code sends a `needs_attention` event, the browser should show a large overlay:

> Claude needs your attention.  
> Return to terminal.

Buttons:

- Return to terminal
- Give me 30 seconds

Design behavior:

- Chat input may be dimmed.
- Page title should change.
- Optional sound notification.
- Optional browser notification if user grants permission.

The alert should be hard to miss but not scary.

---

## 8. Status language

Use simple statuses:

- Waiting
- Needs attention
- Done
- Disconnected

Do not overclaim that `Stop` always means the full task is complete. Safer language:

- “Claude may be done.”
- “Claude finished its latest response.”
- “Check your terminal.”

Recommended mapping:

| Hook event meaning | App status | User-facing language |
|---|---|---|
| User submitted prompt | waiting | Claude is working |
| Claude notification | needs_attention | Claude needs your attention |
| Claude stopped responding | done | Claude may be done |

---

## 9. Matching design

### 9.1 Matching rule for MVP

Use simple tag-based matching.

1. User chooses a tag.
2. Server checks for another waiting user with the same tag.
3. If found, create a 1-on-1 room.
4. If not found after a short period, offer message board or group lobby.

### 9.2 Fallback when no match exists

Do not leave the user on an empty spinner.

After a short wait, show:

> No match yet. Meanwhile, you can:
> - Read the live board
> - Post a one-line waiting thought
> - Join the group lobby
> - Keep waiting for a 1-on-1 match

---

## 10. Identity design

MVP should avoid real profiles.

Use temporary anonymous names:

- blue-cursor-241
- sleepy-debugger
- tiny-compiler
- wandering-test
- refactor-raccoon

Optional lightweight profile fields:

- Agent: Claude Code / Codex / Cursor / Other
- Work type: frontend / backend / ML / research / writing
- Mood: focused / stuck / bored / curious

Do not launch with:

- real names
- LinkedIn-style profiles
- permanent public histories
- persistent direct messages
- follower/friend systems

---

## 11. Safety and moderation design

MVP must include:

- Report user
- Block user
- End chat
- New match
- Message length limits
- Rate limits
- No files
- No images
- No voice/video
- Temporary message storage
- Warning before sending likely secrets

Secret-looking text examples:

- API keys
- GitHub tokens
- private keys
- `.env` contents
- passwords
- database URLs
- SSH keys

Suggested warning:

> This message may contain a secret or private project detail. Are you sure you want to send it?

---

## 12. MVP scope

Build these:

1. Claude Code local hook integration
2. Anonymous session identity
3. Landing page
4. Waiting entry page
5. Tag selector
6. Random 1-on-1 text chat
7. Message board fallback
8. Claude-needs-you browser alert
9. Report/block/leave controls
10. Install instructions

Do not build yet:

- accounts
- persistent DMs
- friend system
- mobile app
- voice/video
- file upload
- image upload
- leaderboard
- public user profiles
- complex AI moderation
- payments
- multi-agent dashboards

---

## 13. Success criteria for first demo

The first real demo is successful if:

1. User starts a Claude Code task.
2. A local hook detects the event.
3. User can open a Waiting Lounge link.
4. Another user can do the same.
5. Both users can be matched into a chat.
6. They can exchange messages.
7. When Claude needs attention, the browser shows a clear alert.
8. No private code, prompt, file path, repo name, or transcript is sent to the server.

---

## 14. Tone and visual style

The product should feel:

- lightweight
- friendly
- slightly playful
- safe
- low-pressure
- developer-aware

Avoid:

- corporate social network feel
- gamified addiction mechanics
- aggressive growth language
- “meet strangers now” framing
- anything that feels like code surveillance

Possible taglines:

- “A waiting room for people building with AI agents.”
- “Chat while your coding agent works.”
- “Stop staring at the terminal.”
- “A tiny lounge for agent downtime.”

---

## 15. Reference links for implementation context

These are not product requirements, but they explain why the integration is possible:

- Claude Code Hooks Reference: https://code.claude.com/docs/en/hooks
- Claude Code Hooks Guide: https://code.claude.com/docs/en/hooks-guide

Coding agents should verify the latest Claude Code hook schema before implementation, because hook details may evolve.
