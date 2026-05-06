import { PrivacyPromise } from "@/components/PrivacyPromise";
import { InstallInstructions } from "@/components/InstallInstructions";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
      <header>
        <h1 className="text-2xl font-medium text-ink">About & install</h1>
        <p className="text-sm text-muted mt-1">
          A tiny lounge for agent downtime. Anonymous. Temporary. Local-first.
        </p>
      </header>

      <PrivacyPromise />
      <InstallInstructions />

      <div className="card p-6">
        <h3 className="font-medium text-ink mb-2">Status vocabulary</h3>
        <ul className="text-sm text-ink space-y-1">
          <li>
            <span className="font-mono text-sage-deep">waiting</span> — Claude is working.
          </li>
          <li>
            <span className="font-mono text-amber">needs_attention</span> — Claude needs your attention.
          </li>
          <li>
            <span className="font-mono text-muted">done</span> — Claude may be done. Check your terminal.
          </li>
        </ul>
        <p className="text-xs text-muted mt-3">
          We don&apos;t overclaim that <em>done</em> means the full task is finished — just that Claude
          stopped responding.
        </p>
      </div>
    </div>
  );
}
