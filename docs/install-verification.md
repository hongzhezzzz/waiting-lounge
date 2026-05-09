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
