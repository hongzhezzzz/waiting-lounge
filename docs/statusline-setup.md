# Lounge presence in Claude Code's statusline

The Stage 6b add-on. Wires lounge state into Claude Code's bottom status bar so you see your handle, current match, and time remaining without leaving the chat.

## What it looks like

```
☕ Lounge · blue-cursor-241 · idle
```

…when you're in the lobby, and:

```
☕ vs lilac-stacktrace-782 · R3/5 · 18s
```

…when you're in a match.

If the dock isn't running (or the lounge has been idle for >30 seconds), the bar shows `☕ Lounge: idle` and Claude Code's regular statusline content takes over the rest of the line if your config composes them.

## Setup (one paste)

Add this block to `~/.claude/settings.json`. If `statusLine` already exists, replace its `command` value with the one below (or compose them yourself by chaining shell commands).

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /absolute/path/to/waiting-lounge/cli/waiting-lounge.js statusline"
  }
}
```

Replace `/absolute/path/to/waiting-lounge/` with wherever you cloned/installed the repo.

Example for a local clone in `~/code/waiting-lounge`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /home/you/code/waiting-lounge/cli/waiting-lounge.js statusline"
  }
}
```

Restart Claude Code (or `/clear` and start a new session) for the new statusline to take effect.

## How it works

- `cli/statusline.js` reads `~/.waiting-lounge/state.json`. That file is written atomically by the lounge process whenever it's running with `--write-state-to=<path>`, which `waiting-lounge dock` passes by default.
- Claude Code calls the statusline command frequently (every few seconds) to refresh the bar.
- The script does **no network I/O** — only a local file read and string formatting. Returns within milliseconds.
- If the state file is missing OR older than 30 seconds, it falls back to `☕ Lounge: idle`. So when the dock isn't running, the statusline degrades gracefully without errors.

## Composing with other statusline content

If you have an existing statusline script (say, showing git branch + cost), you can chain ours with a separator:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/waiting-lounge/cli/waiting-lounge.js statusline; echo -n ' · '; /path/to/your-other-script.sh"
  }
}
```

The lounge state goes first, then `·`, then your other script's output.

## Privacy

`statusline.js` reads only `~/.waiting-lounge/state.json`. That file contains lounge-only state: handle, match phase, round label, time remaining, peer's handle, timestamp. It never contains Claude Code prompts, paths, transcripts, tool I/O, or anything from your coding session. The script does no network I/O. The hook payload (4 sanitized fields) is unchanged.
