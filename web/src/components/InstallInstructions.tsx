export function InstallInstructions() {
  return (
    <div className="card p-6 space-y-4">
      <h3 className="font-medium text-ink">Install the local hook</h3>
      <p className="text-sm text-muted">
        The hook is a tiny Node.js script that watches three Claude Code lifecycle events and sends only
        an anonymous status signal. It runs entirely on your machine.
      </p>
      <ol className="text-sm text-ink list-decimal pl-5 space-y-2">
        <li>
          Clone or download the repo. The script lives at <code className="font-mono">local-hook/hook.js</code>.
        </li>
        <li>
          Add the hook bindings to your Claude Code settings (this folder ships an example
          <code className="font-mono"> .claude/settings.json</code> you can copy).
        </li>
        <li>
          Restart Claude Code. Send a prompt — the lounge picks up your status automatically.
        </li>
      </ol>
      <p className="text-xs text-muted">
        A guided installer ships in a later phase. For now, see the README in the repo.
      </p>
    </div>
  );
}
