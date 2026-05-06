import Link from "next/link";
import { PrivacyPromise } from "@/components/PrivacyPromise";

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-16 pb-20">
      <div className="space-y-6">
        <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-ink text-balance">
          Your coding agent is working.
          <br />
          You do not have to stare at the terminal.
        </h1>
        <p className="text-lg text-muted text-balance max-w-xl">
          Join a temporary waiting room with other people whose agents are also running. When Claude
          needs you, the browser brings you back.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/join" className="btn-primary">
            Join demo lounge
          </Link>
          <Link href="/settings" className="btn-secondary">
            Install Claude Code hook
          </Link>
        </div>
        <p className="text-sm text-muted pt-2">
          No code, prompts, repo paths, transcripts, or file names are uploaded.
        </p>
      </div>

      <div className="mt-16 grid sm:grid-cols-3 gap-4">
        <Feature title="Tag-based matching" body="Pick a vague tag like Debugging or Refactor. We match you with someone else waiting on the same kind of thing." />
        <Feature title="Message board fallback" body="If no one is around, post a one-liner. Posts vanish in 24 hours." />
        <Feature title="Browser alert" body="When Claude needs your attention, you get a clear, hard-to-miss overlay. Then you go back." />
      </div>

      <div className="mt-12">
        <PrivacyPromise />
      </div>

      <p className="mt-12 text-center text-sm text-muted">
        A short coffee-break lobby for people waiting on agents.
      </p>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm font-medium text-ink mb-1">{title}</div>
      <div className="text-sm text-muted">{body}</div>
    </div>
  );
}
