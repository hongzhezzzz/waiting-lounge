export function PrivacyPromise({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-sm text-muted">
        We only receive anonymous status signals — waiting, needs attention, or done. No code, prompts,
        repo paths, transcripts, or file names.
      </p>
    );
  }
  return (
    <div className="card p-6">
      <h3 className="font-medium text-ink mb-3">What we never receive</h3>
      <ul className="text-sm text-ink space-y-1.5">
        <li>— your code</li>
        <li>— your prompt</li>
        <li>— your repo path</li>
        <li>— your transcript</li>
        <li>— your file names</li>
      </ul>
      <p className="text-sm text-muted mt-4">
        Claude Code may provide detailed local context to hooks. Our local script discards that context
        before sending anything to the server. We only receive anonymous status signals such as
        <em> waiting</em>, <em>needs attention</em>, or <em>done</em>.
      </p>
    </div>
  );
}
