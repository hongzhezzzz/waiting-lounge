# Pre-public install verification (Stage 7.3)

Per Ground Rule #12, this transcript captures Claude's pre-publish verification of the install path on a clean isolated environment, BEFORE asking the user to flip the repo public.

## Setup

```
cd /mnt/c/Users/lucky/Dropbox/ChatApp
TARBALL=$(npm pack --silent | tail -1)
mv "$TARBALL" /tmp/wl-test.tgz
mkdir -p /tmp/wl-prefix
npm install -g --prefix /tmp/wl-prefix /tmp/wl-test.tgz
```

(Fully isolated: a separate npm prefix, separate `bin/`, separate `node_modules/`, mimics what an outsider's `npm install -g github:hongzhezzzz/waiting-lounge` would produce.)

## Tarball contents

29 files, 40 KB. Per the `files` array in `package.json`:

```
package/LICENSE
package/README.md
package/package.json
package/cli/waiting-lounge.js
package/cli/play.mjs
package/cli/dock.js
package/cli/attach.js
package/cli/multiplexer.js
package/cli/statusline.js
package/cli/__tests__/multiplexer.test.js
package/cli/lib/{auth.js, config.js, sparkline.mjs}
package/cli/components/{ChipBar, BetPhasePanel, RevealCard, MatchEndScreen, ChatPanel, CollapsedStrip}.mjs
package/cli/components/rounds/{IndianPoker, Estimation, MontyMirage, Chicken, BigO, GeoTrivia, StockDirection, Placeholder}.mjs
package/local-hook/hook.js
package/local-hook/README.md
```

No `.env`, no `docs/`, no `backend/`, no `web/`, no source maps, no test fixtures, no node_modules. Clean.

## Command-by-command verification

### `waiting-lounge help` → ✅ PASS

Renders the full help text. All 7 subcommands listed with descriptions.

### `waiting-lounge install --print-only` → ✅ PASS

Prints the JSON block to paste into `~/.claude/settings.json`. JSON contains the correct hook-script path tied to `~/.waiting-lounge/hook.js` (per-user, set during install). Backend URL `https://waiting-lounge.onrender.com` and frontend `https://waiting-lounge.vercel.app` resolved correctly.

### `waiting-lounge status` → ✅ PASS

Reports config dir, hook script, device ID, backend URL, frontend URL, **backend reach: yes (200)**. The reachability check actually hits the live backend over HTTPS — not a stub.

### `waiting-lounge play` (smoke) → ✅ PASS

Starts up; renders the cyan-bordered "☕ Waiting Lounge" banner; transitions to "Reading saved credentials…" auth phase. No errors on startup. Killed cleanly by SIGTERM at 4s.

### `waiting-lounge attach` (outside tmux) → ✅ PASS

Prints the friendly error path explaining tmux requirement and offering two next-step alternatives (`dock` or restart-inside-tmux). Does not crash.

### `waiting-lounge dock --no-tmux` (smoke) → ✅ PASS

Starts up using the zero-dep PTY multiplexer. No `MODULE_NOT_FOUND`, no node-pty load errors. Spawns child PTYs for claude + lounge. Killed cleanly at 3s.

### `waiting-lounge statusline` → ✅ PASS

Prints `☕ Lounge · <handle> · idle` (live state from existing `~/.waiting-lounge/state.json`).

## Verdict

**Install path is clean for an outside user.** The tarball is what `npm install -g github:hongzhezzzz/waiting-lounge` will resolve once the repo is public. All entry-point commands tested (help, install, status, play, attach, dock, statusline). Zero crashes, zero missing modules, all error paths print user-actionable next steps.

Cleared to flip the repo public (Stage 7.4).

## Cleanup

```
rm -rf /tmp/wl-prefix /tmp/wl-test.tgz
```

---

## Stage 7.5 — post-public outsider verification (2026-05-08)

After flipping the repo public, ran the actual install URL an outsider would use, into a fully isolated prefix:

```
mkdir -p /tmp/wl-outsider-prefix
GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/true \
  npm install -g --prefix /tmp/wl-outsider-prefix github:hongzhezzzz/waiting-lounge
```

(`GIT_TERMINAL_PROMPT=0` and `GIT_ASKPASS=/bin/true` simulate an unauthenticated user — these would force a fail if the repo were still private.)

### Results

- **Install** → ✅ 53 packages added in 5s, no auth prompts, no errors
- **Anonymous git clone** → ✅ `git clone https://github.com/hongzhezzzz/waiting-lounge.git` works without credentials
- **`waiting-lounge --version`** → ✅ prints `0.1.0` (added handler in this commit; previously fell through to "Unknown command")
- **`waiting-lounge help`** → ✅ renders full help
- **`waiting-lounge install --print-only`** → ✅ prints the JSON to paste into `~/.claude/settings.json`

### Friend-shareable install one-liner

```
npm install -g github:hongzhezzzz/waiting-lounge
waiting-lounge install
```

(Then paste the printed JSON, click the printed pair URL once, and run `waiting-lounge dock` or `waiting-lounge play`.)

### Verdict

**Distribution is live.** Anyone with Node 18+ can install the lounge with the one-liner. No friction. No auth required.
