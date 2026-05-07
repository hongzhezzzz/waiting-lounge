"use client";

import { useAgentStatus } from "@/lib/agentStatus";

export function InstallInstructions() {
  const { deviceId, clearDeviceId } = useAgentStatus();

  return (
    <div className="card p-6 space-y-4">
      <h3 className="font-medium text-ink">Install the local hook</h3>
      <p className="text-sm text-muted">
        The hook is a tiny Node.js script that watches three Claude Code lifecycle events and sends only
        an anonymous status signal. It runs entirely on your machine.
      </p>
      <ol className="text-sm text-ink list-decimal pl-5 space-y-2">
        <li>
          Clone or open this repo locally. The script lives at{" "}
          <code className="font-mono">local-hook/hook.js</code>.
        </li>
        <li>
          The repo ships an example <code className="font-mono">.claude/settings.json</code> with the
          three hook bindings already wired up. Restart Claude Code in that folder so the bindings load.
        </li>
        <li>
          Pair this browser to your machine. In any terminal:
          <pre className="card mt-2 p-3 font-mono text-xs whitespace-pre-wrap">
{`node local-hook/hook.js pair`}
          </pre>
          Open the URL it prints. The browser stores a local device id; subsequent Claude Code activity
          updates this page automatically.
        </li>
      </ol>

      <div className="border-t border-line pt-4">
        <h4 className="text-sm font-medium text-ink mb-1">This browser</h4>
        {deviceId ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">Paired as</span>
            <span className="font-mono text-ink text-xs">{deviceId.slice(0, 8)}…{deviceId.slice(-4)}</span>
            <button onClick={clearDeviceId} className="text-xs text-muted hover:text-ink underline">
              Unpair
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Not paired yet — run the command above.</p>
        )}
      </div>
    </div>
  );
}
