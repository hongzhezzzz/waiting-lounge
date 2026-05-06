# Waiting Lounge Engineering Roadmap

**Working name:** Waiting Lounge  
**Goal:** Build a Claude Code companion app that lets users join a temporary online waiting room while Claude Code is working.  
**Audience for this document:** Coding agent, engineer, or technical builder  
**Last updated:** 2026-05-06

---

## 0. High-level architecture

The application has three parts:

```text
1. Local Claude Code hook package
   Watches Claude Code lifecycle events and sends privacy-safe status.

2. Online web app
   Shows landing page, tag selector, chat room, message board, and alerts.

3. Online backend
   Handles matching, chat, message board, reports, and live status updates.
```

Data flow:

```text
Claude Code
  ↓
local hook script
  ↓ sends only sanitized status
backend server
  ↓ websocket/event push
browser lounge
  ↓
matched user or message board
```

Do not send raw Claude Code hook JSON to the server.

---

## 1. Core implementation principle

The local hook script must be the privacy firewall.

Bad flow:

```text
Claude hook raw JSON → your server → sanitize later
```

Good flow:

```text
Claude hook raw JSON → local sanitizer → safe status only → your server
```

The safe payload should look like:

```json
{
  "anonymousDeviceId": "random-uuid",
  "status": "waiting",
  "client": "claude-code",
  "timestamp": 1778100000000
}
```

Never send:

```text
prompt
code
repo name
working directory
file path
transcript path
assistant message
tool input/output
project description
```

---

## 2. Recommended technical stack

MVP stack:

```text
Frontend: Next.js + React + Tailwind
Backend: Node.js + Express
Realtime: Socket.IO
Database: Supabase Postgres
Queue/presence: Redis or Upstash Redis
Hosting frontend: Vercel
Hosting backend: Render / Railway / Fly.io
Domain/DNS: Cloudflare or equivalent
Local hook: Node.js script
```

Prototype can start simpler:

```text
Frontend: local Next.js
Backend: local Node.js
Database: none
Queue: in-memory arrays
Realtime: Socket.IO
```

Replace in-memory state with Redis/Postgres before public beta.

---

## 3. Build order overview

Build in this order:

```text
1. Local hook logs sanitized events.
2. Confirm Claude Code hook events fire.
3. Build frontend mockup with fake data.
4. Build local backend with WebSocket.
5. Implement random matching between two browser windows.
6. Implement basic chat.
7. Add message board fallback.
8. Connect local hook to backend.
9. Push Claude status updates to browser.
10. Add safety controls.
11. Deploy frontend and backend.
12. Build installer.
13. Test with 3-5 real users.
14. Polish for beta.
```

---

## 4. Phase 1 — Local Claude Code hook proof

### Goal

Prove that Claude Code can trigger a local script and that the script can create sanitized events.

### Tasks

#### 1. Create repo structure

```bash
mkdir waiting-lounge
cd waiting-lounge
mkdir local-hook web backend docs
```

#### 2. Create local hook script

Create:

```text
local-hook/hook.js
```

Initial version:

```js
const fs = require("fs");
const path = require("path");

const event = process.argv[2] || "unknown";

let input = "";
process.stdin.on("data", chunk => {
  input += chunk;
});

process.stdin.on("end", () => {
  const safeEvent = {
    event,
    status:
      event === "start" ? "waiting" :
      event === "attention" ? "needs_attention" :
      event === "stop" ? "done" :
      "unknown",
    timestamp: new Date().toISOString()
  };

  const logPath = path.join(process.env.HOME, ".waiting-lounge.log");
  fs.appendFileSync(logPath, JSON.stringify(safeEvent) + "\n");
});
```

Do not save raw input except temporarily during local debugging. Remove any raw logging before beta.

#### 3. Configure Claude Code hooks

Add hooks in the Claude Code settings file. Use absolute paths.

Example shape:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /ABSOLUTE/PATH/waiting-lounge/local-hook/hook.js start"
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /ABSOLUTE/PATH/waiting-lounge/local-hook/hook.js attention"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node /ABSOLUTE/PATH/waiting-lounge/local-hook/hook.js stop"
          }
        ]
      }
    ]
  }
}
```

Coding agent should verify the current Claude Code hook schema in the official docs before implementation.

#### 4. Acceptance check

Run Claude Code, submit a small task, then check:

```bash
cat ~/.waiting-lounge.log
```

Expected:

```json
{"event":"start","status":"waiting","timestamp":"..."}
{"event":"attention","status":"needs_attention","timestamp":"..."}
{"event":"stop","status":"done","timestamp":"..."}
```

If this works, continue.

---

## 5. Phase 2 — Frontend mockup

### Goal

Build the main user experience with fake data.

### Tasks

#### 1. Create frontend

```bash
cd web
npx create-next-app@latest .
```

Suggested options:

```text
TypeScript: yes
ESLint: yes
Tailwind: yes
App Router: yes
src directory: optional
```

#### 2. Create pages

```text
/
  landing page

/join
  waiting entry page

/lounge
  tag selection and mode selection

/chat
  fake chat UI

/board
  fake message board

/settings
  privacy and install info
```

#### 3. Create components

```text
AgentStatusBadge
TagSelector
ModeSelector
ChatWindow
MessageBoard
ClaudeNeedsYouOverlay
ReportBlockControls
PrivacyPromise
InstallInstructions
```

#### 4. Acceptance check

A non-engineer should be able to click through:

```text
Homepage → Join → choose tag → choose chat → see chat window → simulate Claude-needs-you alert
```

No backend needed yet.

---

## 6. Phase 3 — Local backend and realtime chat

### Goal

Create a local backend that can match two users and exchange messages.

### Tasks

#### 1. Initialize backend

```bash
cd backend
npm init -y
npm install express socket.io cors uuid
```

#### 2. Create backend server

Create:

```text
backend/server.js
```

Responsibilities:

```text
- serve health check
- accept socket connections
- manage waiting queues
- create rooms
- relay messages
- handle leave/report/block events
```

#### 3. Implement in-memory user state

Prototype data structures:

```js
const users = new Map();      // socketId -> user info
const queues = new Map();     // tag -> array of socketIds
const rooms = new Map();      // roomId -> { users: [socketIdA, socketIdB], tag }
```

#### 4. Implement socket events

Client to server:

```text
join_queue
leave_queue
chat_message
leave_room
report_user
block_user
```

Server to client:

```text
matched
waiting
chat_message
peer_left
agent_status_update
error_message
```

#### 5. Acceptance check

Open two browser windows.

Expected:

```text
Window A joins Debugging queue.
Window B joins Debugging queue.
Server matches them.
Both enter same room.
A sends message.
B receives message.
B leaves.
A sees peer-left notice.
```

---

## 7. Phase 4 — Message board fallback

### Goal

Give users something to do when no match is available.

### Tasks

#### 1. Add board API

Prototype endpoints:

```text
GET /api/board?tag=debugging
POST /api/board
POST /api/board/report
```

Prototype can store board posts in memory first.

#### 2. Board post fields

```js
{
  id,
  anonymousUserId,
  tag,
  body,
  createdAt,
  expiresAt,
  reportCount
}
```

#### 3. Rules

```text
max post length: 500 characters
expiry: 24 hours
no file uploads
no image uploads
rate limit per anonymous user
```

#### 4. Acceptance check

If no 1-on-1 match is available:

```text
User sees message board.
User can post short message.
Another browser can read it.
Reported post can be hidden.
```

---

## 8. Phase 5 — Connect local hook to backend

### Goal

Make Claude Code status appear in the browser.

### Tasks

#### 1. Add backend route

```text
POST /api/agent-event
```

Expected request:

```json
{
  "anonymousDeviceId": "uuid",
  "status": "waiting",
  "client": "claude-code",
  "timestamp": 1778100000000
}
```

Backend behavior:

```text
1. Validate status.
2. Update session status.
3. Push status to active browser socket for same anonymousDeviceId.
```

#### 2. Update local hook script

The local script should:

```text
1. Read Claude hook JSON from stdin.
2. Ignore raw data.
3. Read or create anonymousDeviceId.
4. POST safe status to backend.
5. Never block Claude Code if backend is unavailable.
```

Example core logic:

```js
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const event = process.argv[2] || "unknown";

let raw = "";
process.stdin.on("data", chunk => {
  raw += chunk;
});

process.stdin.on("end", () => {
  const payload = {
    anonymousDeviceId: getOrCreateDeviceId(),
    status:
      event === "start" ? "waiting" :
      event === "attention" ? "needs_attention" :
      event === "stop" ? "done" :
      "unknown",
    client: "claude-code",
    timestamp: Date.now()
  };

  postJson("https://YOUR-DOMAIN.com/api/agent-event", payload);
});

function getOrCreateDeviceId() {
  const dir = path.join(os.homedir(), ".waiting-lounge");
  const file = path.join(dir, "device_id");

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomUUID());

  return fs.readFileSync(file, "utf8").trim();
}

function postJson(urlString, data) {
  try {
    const url = new URL(urlString);
    const body = JSON.stringify(data);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 1500
    });

    req.on("error", () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}
```

#### 3. Pair browser and local device

Options:

```text
Option A: URL contains anonymousDeviceId.
Option B: user enters pairing code.
Option C: local hook prints a one-time session URL.
```

Recommended MVP: one-time session URL.

#### 4. Acceptance check

Expected:

```text
Claude Code task starts.
Browser shows: Claude is working.
Claude needs permission/input.
Browser shows: Claude needs your attention.
Claude stops responding.
Browser shows: Claude may be done.
```

---

## 9. Phase 6 — Replace prototype storage with production storage

### Goal

Make state durable and multi-instance safe.

### Tasks

#### 1. Add Postgres

Use Supabase Postgres or equivalent.

Tables:

```sql
create table anonymous_users (
  id uuid primary key default gen_random_uuid(),
  anonymous_device_id text unique not null,
  created_at timestamptz default now()
);

create table agent_sessions (
  id uuid primary key default gen_random_uuid(),
  anonymous_device_id text not null,
  status text not null,
  last_seen_at timestamptz default now()
);

create table chat_rooms (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  created_at timestamptz default now(),
  ended_at timestamptz
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  sender_anonymous_id text not null,
  body text not null,
  created_at timestamptz default now()
);

create table board_posts (
  id uuid primary key default gen_random_uuid(),
  anonymous_user_id text not null,
  tag text not null,
  body text not null,
  created_at timestamptz default now(),
  expires_at timestamptz,
  report_count integer default 0
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id text not null,
  reported_user_id text,
  room_id uuid,
  message_id uuid,
  board_post_id uuid,
  reason text,
  created_at timestamptz default now()
);
```

#### 2. Add Redis

Use Redis for:

```text
waiting queues
active socket presence
rate limits
short-lived pairing tokens
```

Do not use Postgres for high-frequency queue operations if Redis is available.

#### 3. Acceptance check

Restart backend server.

Expected:

```text
Board posts persist.
Reports persist.
Active queues may reset safely.
No stale users remain in queues after disconnect.
```

---

## 10. Phase 7 — Safety controls

### Goal

Make the app acceptable for strangers before public beta.

### Required controls

```text
Report
Block
Leave
New match
Rate limit messages
Rate limit queue joins
Rate limit board posts
No files
No images
No voice/video
Max chat message length
Max board post length
Temporary storage policy
```

### Secret warning

Add client-side and server-side checks for patterns like:

```text
sk-
ghp_
github_pat_
AKIA
BEGIN PRIVATE KEY
DATABASE_URL=
password=
.env
```

If detected, show:

```text
This message may contain a secret or private project detail. Are you sure you want to send it?
```

### Acceptance check

Try:

```text
spamming messages
posting huge text
posting fake API key
reporting a user
blocking a user
disconnecting mid-chat
```

Expected:

```text
App rate-limits spam.
App warns on likely secrets.
Reported content is recorded.
Blocked user cannot rematch immediately.
Disconnect cleans up room/queue.
```

---

## 11. Phase 8 — Deployment

### Goal

Put the MVP online.

### Recommended deployment

```text
Frontend: Vercel
Backend: Render / Railway / Fly.io
Database: Supabase
Redis: Upstash Redis
Domain: Cloudflare
```

### Environment variables

Backend:

```text
DATABASE_URL
REDIS_URL
PUBLIC_APP_URL
ALLOWED_ORIGINS
SESSION_SECRET
NODE_ENV
```

Frontend:

```text
NEXT_PUBLIC_BACKEND_URL
NEXT_PUBLIC_SOCKET_URL
```

### Acceptance check

From two different machines:

```text
Both open production site.
Both join same tag.
Both get matched.
Messages work.
Claude status alert works for at least one real Claude Code user.
```

---

## 12. Phase 9 — Installer and CLI

### Goal

Make local setup easy and trustworthy.

### CLI commands

```bash
waiting-lounge install
waiting-lounge status
waiting-lounge test
waiting-lounge uninstall
```

### Install behavior

```text
1. Create ~/.waiting-lounge/
2. Install hook script.
3. Create anonymous device ID.
4. Print Claude Code hook JSON.
5. Optionally write settings with backup if user passes --write-settings.
6. Test backend connection.
```

Prefer not to silently modify Claude Code settings.

Safer first-run behavior:

```text
Here is the JSON block to paste into your Claude Code settings.
Run `waiting-lounge test` after pasting.
```

### Acceptance check

Fresh machine:

```text
Install package.
Run install.
Paste settings.
Run test.
Start Claude Code task.
Join lounge link works.
```

---

## 13. Phase 10 — Beta testing

### Goal

Test with real users before wider launch.

### Test group

Start with:

```text
3-5 trusted Claude Code users
then 10-20 users
then small public beta
```

### What to measure

```text
install success rate
hook event reliability
time from Claude event to browser alert
matching success rate
number of empty-lobby sessions
message-board usage
report/block frequency
user confusion points
privacy concerns
```

### Beta acceptance check

The app is ready for wider beta if:

```text
install is understandable
hook does not break Claude Code
no private data is sent by default
matching works across machines
alerts are reliable
basic abuse controls work
empty-lobby experience is acceptable
users understand what the app does
```

---

## 14. What can be done locally vs online

### Local-only tasks

```text
Claude Code hook script
privacy sanitizer
anonymous device ID generation
frontend mockup
local backend
local WebSocket chat
two-browser matching test
local message board prototype
installer prototype
```

### Online-required tasks

```text
real matching across machines
live chat between strangers
public message board
persistent reports and blocks
shared waiting queues
browser status updates across devices
production database
production Redis
public website
HTTPS/domain
```

---

## 15. Rough effort estimate

For one strong full-stack engineer or coding agent with human guidance:

```text
Clickable mockup: 1-2 days
Local hook proof: 0.5-1 day
Local chat/matching prototype: 2-4 days
Hook-to-backend integration: 1-2 days
Message board: 1-2 days
Safety controls: 2-4 days
Deployment: 1-2 days
Installer: 1-3 days
Usable MVP: 1-2 weeks
Polished beta: 4-8 weeks
```

The most likely hard parts:

```text
privacy trust
install flow
WebSocket reliability
empty-lobby experience
abuse prevention
hook schema changes
cross-platform local behavior
```

---

## 16. Instructions for coding agents

When handing this to Codex or Claude Code, ask it to proceed in small verified milestones.

Recommended first prompt:

```text
Build Phase 1 only. Create a local Node.js hook script that reads Claude Code hook input from stdin, discards the raw input, maps the event argument to waiting / needs_attention / done, and writes only sanitized events to ~/.waiting-lounge.log. Also create a README section showing how to configure Claude Code hooks with absolute paths. Do not build the web app yet.
```

Recommended second prompt:

```text
Build Phase 2 only. Create a Next.js + Tailwind frontend mockup with pages for landing, join, lounge, chat, and board. Use fake data only. Include a simulated Claude-needs-you overlay. Do not build backend yet.
```

Recommended third prompt:

```text
Build Phase 3 only. Create a local Node.js + Express + Socket.IO backend that supports joining a tag queue, matching two users into a room, sending chat messages, leaving rooms, and testing with two browser windows. Use in-memory state only.
```

Keep the coding agent from building everything at once. Each phase should have an acceptance check before moving on.

---

## 17. Reference links

Coding agents should verify the current official docs before implementation.

- Claude Code Hooks Reference: https://code.claude.com/docs/en/hooks
- Claude Code Hooks Guide: https://code.claude.com/docs/en/hooks-guide
