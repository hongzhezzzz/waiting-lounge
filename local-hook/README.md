# Local hook

A small Node.js script that Claude Code invokes through its hooks system. It receives Claude's raw payload on stdin, **discards it**, and writes only a sanitized status event to `~/.waiting-lounge.log`.

This is the privacy firewall. In Phase 1 the script writes to a local file only — nothing leaves your machine. Phase 5 will replace the file write with an HTTPS POST to the backend, but the payload shape stays fixed: `{ anonymousDeviceId, status, client, timestamp }`. No prompts, code, repo paths, transcripts, or tool data are ever sent.

## What gets logged

Each hook fire writes one line to `~/.waiting-lounge.log` like:

    {"event":"start","status":"waiting","timestamp":"2026-05-06T19:00:00.000Z"}
    {"event":"attention","status":"needs_attention","timestamp":"2026-05-06T19:00:30.000Z"}
    {"event":"stop","status":"done","timestamp":"2026-05-06T19:01:00.000Z"}

Nothing else.

## Wire it up to Claude Code

Open your Claude Code settings file. Common locations:
- User-wide: `~/.claude/settings.json`
- This project only: `.claude/settings.json` inside the repo you're running Claude Code in

Add (or merge into the existing `hooks` block):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "node /mnt/c/Users/lucky/Dropbox/ChatApp/local-hook/hook.js start" }] }
    ],
    "Notification": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "node /mnt/c/Users/lucky/Dropbox/ChatApp/local-hook/hook.js attention" }] }
    ],
    "Stop": [
      { "matcher": "", "hooks": [{ "type": "command", "command": "node /mnt/c/Users/lucky/Dropbox/ChatApp/local-hook/hook.js stop" }] }
    ]
  }
}
```

If you run Claude Code from Windows (not WSL), use the Windows path instead: `node C:\\Users\\lucky\\Dropbox\\ChatApp\\local-hook\\hook.js start` (note the doubled backslashes and that `node` must be on the Windows PATH).

The roadmap warns that Claude Code's hook schema may evolve — if these matchers/event names don't seem to fire, check the current docs at https://code.claude.com/docs/en/hooks and we'll adjust.

## Phase 1 acceptance check

1. Wire up the hooks above.
2. In a separate terminal, watch the log: `tail -f ~/.waiting-lounge.log`
3. Start any Claude Code session in any project and submit a small prompt.
4. You should see lines appear:
   - A `waiting` line right after you submit
   - A `done` line when Claude finishes responding
   - A `needs_attention` line if Claude pauses to ask for permission

If those appear, Phase 1 passes and we move to Phase 2 (frontend mockup).

If nothing appears:
- Verify the settings file path and that JSON is valid
- Verify the absolute path to `hook.js` matches your machine
- Verify `node` is on the PATH that Claude Code uses (try `which node`)
- The hook schema may have changed — check the official Claude Code docs

## Manual sanity test (already done)

    echo '{"prompt":"this should be discarded","cwd":"/secret/path"}' | node local-hook/hook.js start
    tail -1 ~/.waiting-lounge.log

Should print only `{"event":"start","status":"waiting","timestamp":"..."}` — no trace of the input. If you ever want to verify the privacy contract holds, run that.
