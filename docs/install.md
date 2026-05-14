# Install / Uninstall — Waiting Lounge

One-screen reference. For full context, see [`docs/status.md`](status.md).

## Install (one liner)

```
npm install -g github:hongzhezzzz/waiting-lounge && waiting-lounge install
```

Requires Node 18+.

`waiting-lounge install` does three things for you:

1. **Wires Claude Code hooks** into `~/.claude/settings.json` (timestamped backup of the previous file). Other tools' hooks are preserved.
2. **Installs tmux** if missing — auto via `brew install tmux` on macOS (no sudo); prints `sudo apt/dnf/pacman install tmux` on Linux/WSL; suggests WSL on native Windows.
3. **Opens the pair URL** in your default browser. (Headless / SSH / Docker: skipped automatically — copy the printed link to your local browser.)

Opt-outs:

| Flag | Effect |
|------|--------|
| `--print-only` | print the JSON, never touch settings.json, never open browser, skip tmux |
| `--no-write` | alias for `--print-only` |
| `--ask` | prompt before merging settings.json (default is auto-merge) |
| `--no-open` | skip auto-opening the pair URL |
| `--no-install-tmux` | skip the brew/sudo line |

## First-time sign-in

Only triggered when you pick `[F]` Find-a-match (real-points pool). Bot games stay anonymous.

When auth is needed, the lounge shows a two-key chooser:

| Key | Flow |
|-----|------|
| `[B]rowser` | opens a tab to `/cli-pair?code=…`; sign in there |
| `[T]erminal` | type your email, get a 6-digit code, type it back — all in the TUI |

Headless boxes auto-pick `[T]`.

Token is saved at `~/.waiting-lounge/auth_token` (mode 0600). Refresh is automatic for ~30 days; after that you sign in again.

## Open the lounge

| Command | What it does |
|---------|--------------|
| `waiting-lounge dock` | claude on top + lounge strip on bottom in one terminal window. `Ctrl-L` toggles the strip ↔ ~30% pane. |
| `waiting-lounge attach` | adds a 1-row lounge strip to the CURRENT tmux session (run via `! waiting-lounge attach` from inside claude). Press `Ctrl-L` (no prefix) to expand the strip and focus it, press again to collapse + return focus to claude. |
| `waiting-lounge play` | full-screen lounge in this terminal (no claude alongside). |

From the lobby (any of the three open commands), these keys open extra scenes — `Q` returns to the lobby from each:

| Key | Scene |
|-----|-------|
| `[F]` | find a real-points pool match |
| `[B]` | instant bot match (anonymous, no points) |
| `[M]` | message board — 24h-TTL posts (read-only in the TUI for now) |
| `[L]` | leaderboard — top 10 by points |
| `[H]` | my profile — handle, points, recent games (anonymous users see a sign-in prompt) |

## Diagnostics

| Command | What it does |
|---------|--------------|
| `waiting-lounge status` | show what's installed + ping the backend (✓ / ✗ row per check) |
| `waiting-lounge test` | send a synthetic event end-to-end; report whether the backend delivered it to any listening browser |
| `waiting-lounge pair` | re-print the pair URL (also auto-opens unless `--no-open`) |

## Uninstall

Preview without changes:

```
waiting-lounge uninstall
```

Confirm:

```
waiting-lounge uninstall --force
```

What `--force` does:

1. Deletes `~/.waiting-lounge/` (hook script, device id, backend URL, auth token).
2. Removes the waiting-lounge hook entries from `~/.claude/settings.json` (timestamped backup written first; other tools' hooks preserved).
3. Prints next-steps: `npm uninstall -g waiting-lounge` to remove the binary itself.

Opt-out:

| Flag | Effect |
|------|--------|
| `--keep-settings` | delete `~/.waiting-lounge/` but leave `~/.claude/settings.json` alone |

Tmux is **not** uninstalled — other tools may depend on it. Remove it yourself if you want:

- macOS: `brew uninstall tmux`
- Linux: `sudo apt remove tmux` (or `dnf` / `pacman`)

## Reinstall (clean slate)

```
waiting-lounge uninstall --force && \
npm uninstall -g waiting-lounge && \
npm install -g github:hongzhezzzz/waiting-lounge && \
waiting-lounge install
```

## Privacy

The local hook never sends prompts, code, paths, transcripts, or tool I/O. It only sends an anonymous device id and one of `{waiting, needs_attention, done}`. Read it yourself: [`local-hook/hook.js`](../local-hook/hook.js) (~80 lines, no obfuscation).
