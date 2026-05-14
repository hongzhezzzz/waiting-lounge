# ☕ Waiting Lounge

**A companion app for Claude Code: chat, browse, and play games while your agent works — without leaving the terminal.**

When Claude Code is working, you have idle time. The Waiting Lounge fills that idle time with anonymous chat, a short-lived message board, and turn-based brain games (1v1 or solo against a calibrated bot). When Claude needs your attention, the lounge alerts you back to the terminal.

## What it looks like

```
┌─ Claude Code ────────────────────────────────┐
│ ● Editing src/server.ts ...                  │
│   tests passing                              │
│   running build...                           │
│ > _                                          │
├─ Lounge ─────────────────────────────────────┤
│ 💬 chat · vs lilac-stacktrace-782            │
│ peer: nice raise                             │
│ Round 2/5 — Indian Poker · pot 250           │
│ [B]et  [F]old                                │
└──────────────────────────────────────────────┘
```

One terminal window, two regions. `Ctrl-L` toggles the lounge between a 1-row indicator and a ~30% pane. Or use the lounge full-screen with `waiting-lounge play`. Or play in the browser at [waiting-lounge.vercel.app](https://waiting-lounge.vercel.app) — same matchmaking pool.

## Install (one line)

```
npm install -g github:hongzhezzzz/waiting-lounge && waiting-lounge install
```

Requires Node 18+. The `install` command:
1. Wires the Claude Code hooks into `~/.claude/settings.json` (with a timestamped backup of the previous file).
2. Auto-installs `tmux` if missing — on macOS via `brew install tmux` (no sudo needed); on Linux it prints the right `sudo apt/dnf/…` line for you to copy.
3. Opens the pair URL in your default browser.

One click in the browser and the lounge is live. Opt-outs: `--print-only` (JSON only, nothing else), `--no-install-tmux` (skip the brew/sudo line), `--no-open` (don't open the browser).

### Supported platforms

| Platform | Status | Notes |
|----------|--------|-------|
| **WSL2 (Linux on Windows)** | ✓ Verified | Primary development environment. Browser auto-open routes through `cmd.exe` to the Windows host. |
| **macOS** | Expected-OK (verification pending) | Uses `open`, `brew install tmux`. node-pty ships prebuilt darwin-x64 and darwin-arm64 binaries. |
| **Linux native (desktop)** | Expected-OK | Uses `xdg-open` (or `$BROWSER`). tmux + Node 18+ from your package manager. |
| **Linux headless (SSH/Docker/CI)** | Functional with notes | Install works; browser auto-open is skipped — copy the pair URL into a browser on your local machine. |
| **Native Windows (PowerShell/cmd)** | Experimental — use WSL | The zero-dep multiplexer hasn't been tested against ConPTY; tmux is not available natively; `claude` binary path resolution differs. **Recommendation: install WSL and run inside WSL2.** |

If you hit a platform-specific issue, please open an issue — we'd rather hear about a verified-broken case than ship silent regressions.

## Quick start

```
waiting-lounge install     # wires hooks into ~/.claude/settings.json + opens the pair URL
waiting-lounge dock        # claude on top + lounge on bottom in one terminal window
```

`install` does it all in one step: merges its 4 hook entries into `~/.claude/settings.json` (backing up the previous file), saves an anonymous device id, and pops the pair page open in your browser. One click in the browser and you're done.

Cautious mode: `waiting-lounge install --print-only` prints the JSON without touching your settings, and `--ask` prompts before merging.

Or, if you already have a claude session running inside `tmux`:

```
! waiting-lounge attach    # adds a lounge strip to the current tmux session
```

Or, plain full-screen TUI without claude alongside:

```
waiting-lounge play
```

First-time sign-in (only needed when you pick `[F]` Find-a-match for the points pool — bot games stay anonymous): pick `[B]rowser` to authorize via a tab, or `[T]erminal` to type your email and a 6-digit code without leaving the TUI. Headless boxes auto-pick terminal. Token is saved at `~/.waiting-lounge/auth_token` (mode 0600).

## Privacy

The local hook is the privacy firewall. **It never sends your prompts, code, file paths, transcripts, working directory, or tool I/O to the backend.** It only sends:

```json
{ "anonymousDeviceId": "uuid", "status": "waiting | needs_attention | done", "client": "claude-code", "timestamp": 0 }
```

That's the entire payload. Read [`local-hook/hook.js`](local-hook/hook.js) — it's ~80 lines of Node, no obfuscation. Read it and audit it yourself.

## Optional: lounge state in Claude Code's statusline

See [`docs/statusline-setup.md`](docs/statusline-setup.md) — paste one block into `~/.claude/settings.json` and Claude Code's bottom bar shows your handle, current match, and time remaining (`☕ vs lilac-stacktrace-782 · R3/5 · 18s`).

## Architecture

- **`local-hook/`** — the privacy-firewall hook (Node, no deps). Claude Code invokes it on each `UserPromptSubmit` / `Notification` / `Stop`.
- **`backend/`** — Node.js + Express + Socket.IO. Anonymous matchmaking, chat, board, game state. Live at `https://waiting-lounge.onrender.com`.
- **`web/`** — Next.js + Tailwind. Live at `https://waiting-lounge.vercel.app`.
- **`cli/`** — the terminal client (`waiting-lounge` CLI). Full-screen TUI (ink), tmux dock orchestrator, zero-dep PTY multiplexer fallback, statusline integration.

## What's playable

- **Brain Bet 2.0** — iterative-betting brain games. Each match is 5 rounds; round types include Indian Poker, Estimation, Chicken, Big-O, Geo Trivia, Stock Direction, Monty Mirage. Tier-based betting (Check / Raise / All-in / Fold). Plays in browser or terminal; pool matchmaking pairs you with the next idle human, or a labeled bot after 30s. Hit `[B]` from the lobby for an instant bot match.
- **Daily Brain Bet** — solo, 3 rounds, same puzzle for everyone each UTC day. Streak counter. (Browser only for now.)
- **Spot the Bug** (browser only for now) — find the bug in 30 short snippets.
- **Message board** — 24-hour TTL, report-and-hide, no accounts. Readable from the terminal via `[M]`; posting is browser-only for now.
- **Leaderboard + profile** — top 10 by points, plus your handle / points / recent games. In the terminal via `[L]` and `[H]`.

## Documentation

- [`docs/install.md`](docs/install.md) — one-screen install + uninstall reference
- [`docs/status.md`](docs/status.md) — the truth about what works right now (per-feature, dated)
- [`docs/decisions.md`](docs/decisions.md) — append-only log of non-obvious design choices
- [`docs/statusline-setup.md`](docs/statusline-setup.md) — Claude Code statusline integration
- [`waiting_lounge_design_spec.md`](waiting_lounge_design_spec.md) — original product spec
- [`waiting_lounge_engineering_roadmap.md`](waiting_lounge_engineering_roadmap.md) — original engineering plan
- [`CLAUDE.md`](CLAUDE.md) — guardrails for Claude Code working in this repo

## Working on the codebase

```
git clone https://github.com/hongzhezzzz/waiting-lounge.git
cd waiting-lounge
npm install
npm link        # makes the local clone's `waiting-lounge` command available on PATH
```

Without `npm link`, you can still invoke the CLI as `node cli/waiting-lounge.js <cmd>`.

## License

MIT — see [`LICENSE`](LICENSE).

## Acknowledgements

Built with [ink](https://github.com/vadimdemedes/ink), [Socket.IO](https://socket.io/), [Next.js](https://nextjs.org/), [Tailwind](https://tailwindcss.com/), [node-pty](https://github.com/microsoft/node-pty), and the official [Supabase](https://supabase.com/) JS client.
