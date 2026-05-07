"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { configured, sendOtp, verifyOtp, session } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!configured) {
    return (
      <div className="max-w-lg mx-auto px-6 py-16">
        <div className="card p-6 space-y-3">
          <h1 className="text-xl font-medium text-ink">Sign-in is not configured yet</h1>
          <p className="text-sm text-muted">
            The lounge admin needs to set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </p>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <div className="max-w-lg mx-auto px-6 py-16">
        <div className="card p-6 space-y-3">
          <h1 className="text-xl font-medium text-ink">You&apos;re signed in.</h1>
          <p className="text-sm text-muted font-mono">{session.user.email}</p>
          <button onClick={() => router.push("/me")} className="btn-primary">
            Go to your profile →
          </button>
        </div>
      </div>
    );
  }

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await sendOtp(email.trim());
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Could not send code.");
      return;
    }
    setStep("code");
  }

  async function onCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await verifyOtp(email.trim(), code.trim());
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Could not verify code.");
      return;
    }
    router.push("/me");
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-16">
      <div className="card p-6 space-y-4">
        <h1 className="text-2xl font-medium text-ink">Sign in</h1>
        <p className="text-sm text-muted">
          We&apos;ll email you a 6-digit code. Paste it below — no need to leave this tab.
        </p>

        {step === "email" && (
          <form onSubmit={onEmailSubmit} className="space-y-3">
            <label className="block text-sm text-muted">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-line rounded-lg px-3 py-2 bg-surface focus:border-sage focus:outline-none"
            />
            <button type="submit" disabled={busy || !email} className="btn-primary w-full">
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={onCodeSubmit} className="space-y-3">
            <p className="text-sm text-muted">
              Code sent to <span className="font-mono text-ink">{email}</span>.
            </p>
            <label className="block text-sm text-muted">6-digit code</label>
            <input
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              className="w-full border border-line rounded-lg px-3 py-2 bg-surface focus:border-sage focus:outline-none font-mono tracking-widest text-lg text-center"
            />
            <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full">
              {busy ? "Verifying…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setCode(""); setError(null); }}
              className="text-xs text-muted hover:text-ink"
            >
              ← use a different email
            </button>
          </form>
        )}

        {error && <p className="text-sm text-amber-700 bg-amber-50 rounded p-2">{error}</p>}
      </div>
    </div>
  );
}
