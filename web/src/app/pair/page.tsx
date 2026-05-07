"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAgentStatus } from "@/lib/agentStatus";

function PairInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { setDeviceId, deviceId } = useAgentStatus();
  const [state, setState] = useState<"checking" | "saved" | "invalid" | "missing">("checking");

  useEffect(() => {
    const d = params.get("d") || "";
    if (!d) {
      // No param — but maybe already paired previously.
      if (deviceId) setState("saved");
      else setState("missing");
      return;
    }
    if (!/^[a-f0-9-]{8,64}$/i.test(d)) {
      setState("invalid");
      return;
    }
    setDeviceId(d);
    setState("saved");
    const t = setTimeout(() => router.push("/join"), 1200);
    return () => clearTimeout(t);
  }, [params, setDeviceId, router, deviceId]);

  if (state === "saved") {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center space-y-3">
        <h1 className="text-2xl font-medium text-ink">Paired.</h1>
        <p className="text-muted text-sm">
          This browser will now show your real Claude Code status. Taking you to the lounge…
        </p>
        <Link href="/join" className="btn-primary mt-4 inline-block">
          Open the lounge
        </Link>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center space-y-3">
        <h1 className="text-2xl font-medium text-ink">That pairing link looks malformed.</h1>
        <p className="text-muted text-sm">
          Re-run <code className="font-mono">node local-hook/hook.js pair</code> in your terminal and
          open the new URL.
        </p>
      </div>
    );
  }

  if (state === "missing") {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center space-y-3">
        <h1 className="text-2xl font-medium text-ink">Pairing</h1>
        <p className="text-muted text-sm">
          To pair this browser to your local Claude Code, run this once in any terminal:
        </p>
        <pre className="card p-4 text-left text-xs font-mono whitespace-pre-wrap">
{`cd /path/to/this/repo
node local-hook/hook.js pair`}
        </pre>
        <p className="text-muted text-sm">
          It prints a URL — open it in your browser. That browser is then paired.
        </p>
        <Link href="/" className="btn-secondary inline-block mt-4">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16 text-center text-muted">Pairing…</div>
  );
}

export default function PairPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-6 py-16 text-center text-muted">Pairing…</div>}>
      <PairInner />
    </Suspense>
  );
}
