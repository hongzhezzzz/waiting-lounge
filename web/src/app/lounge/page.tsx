import Link from "next/link";
import { FAKE_HANDLES, TAGS } from "@/lib/fakeData";

export default function LoungePage() {
  // Fake "currently waiting" list.
  const sample = FAKE_HANDLES.slice(0, 6).map((h, i) => ({
    handle: h,
    tag: TAGS[i % TAGS.length],
    waitingFor: `${(i + 1) * 2}m`,
  }));

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <Link href="/join" className="text-sm text-muted hover:text-ink">
        ← Back to lounge
      </Link>
      <h1 className="text-2xl font-medium text-ink mt-2 mb-2">Browsing the lobby</h1>
      <p className="text-sm text-muted mb-8">
        Other people currently waiting. Tags only — no other detail.
      </p>

      <ul className="space-y-2">
        {sample.map((s) => (
          <li
            key={s.handle}
            className="card px-5 py-4 flex items-center justify-between text-sm"
          >
            <div>
              <span className="font-mono text-ink">{s.handle}</span>
              <span className="text-muted"> · {s.tag}</span>
            </div>
            <span className="text-muted">{s.waitingFor}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 card p-5 bg-sage-soft/40">
        <p className="text-sm text-ink">
          No 1-on-1 match yet?{" "}
          <Link href="/board" className="underline underline-offset-2">
            Read the live board
          </Link>{" "}
          or{" "}
          <Link href="/join" className="underline underline-offset-2">
            keep waiting
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
