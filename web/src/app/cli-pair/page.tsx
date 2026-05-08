"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Terminal, ShieldCheck, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getBackendUrl } from "@/lib/backend";

function CliPairInner() {
  const params = useSearchParams();
  const code = (params.get("code") || "").trim();
  const { configured, session, loading, sendOtp, verifyOtp } = useAuth();

  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const [authState, setAuthState] = useState<"idle" | "authorizing" | "done" | "error">("idle");
  const [authError, setAuthError] = useState<string | null>(null);

  if (!code) {
    return (
      <Wrap>
        <h1 className="text-xl font-medium text-ink">Missing code</h1>
        <p className="text-sm text-muted">
          This page only works when launched from the terminal via{" "}
          <code className="font-mono">waiting-lounge play</code>. Run that and
          this page will open with a code automatically.
        </p>
      </Wrap>
    );
  }

  if (!/^[a-f0-9]{32,128}$/i.test(code)) {
    return (
      <Wrap>
        <h1 className="text-xl font-medium text-ink">Invalid code</h1>
        <p className="text-sm text-muted">
          The code in the URL doesn&apos;t look right. Re-run{" "}
          <code className="font-mono">waiting-lounge play</code> to get a fresh
          one.
        </p>
      </Wrap>
    );
  }

  const codeTail = code.slice(-6).toUpperCase();

  if (loading) {
    return (
      <Wrap>
        <p className="text-sm text-muted">Loading…</p>
      </Wrap>
    );
  }

  if (!configured) {
    return (
      <Wrap>
        <h1 className="text-xl font-medium text-ink">Sign-in is not configured</h1>
        <p className="text-sm text-muted">
          The lounge admin needs to set the Supabase env vars before terminal
          login will work.
        </p>
      </Wrap>
    );
  }

  // Not signed in — inline OTP flow.
  if (!session) {
    const onEmailSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setOtpError(null);
      setBusy(true);
      const r = await sendOtp(email.trim());
      setBusy(false);
      if (!r.ok) {
        setOtpError(r.error || "Could not send code.");
        return;
      }
      setOtpStep("code");
    };
    const onCodeSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setOtpError(null);
      setBusy(true);
      const r = await verifyOtp(email.trim(), otpCode.trim());
      setBusy(false);
      if (!r.ok) {
        setOtpError(r.error || "Could not verify code.");
        return;
      }
      // After successful verify, useAuth() session updates via Supabase
      // listener; this component re-renders into the authorize view.
    };

    return (
      <Wrap>
        <div className="flex items-center gap-2 mb-1">
          <Terminal className="w-5 h-5 text-cyan-700" />
          <h1 className="text-xl font-medium text-ink">Authorize terminal</h1>
        </div>
        <p className="text-sm text-muted">
          Sign in to authorize terminal access for this session.
        </p>
        <p className="text-xs text-muted">
          Code: <span className="font-mono text-ink">…{codeTail}</span> (must
          match the last 6 chars shown in your terminal)
        </p>

        {otpStep === "email" && (
          <form onSubmit={onEmailSubmit} className="space-y-3 mt-3">
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

        {otpStep === "code" && (
          <form onSubmit={onCodeSubmit} className="space-y-3 mt-3">
            <p className="text-sm text-muted">
              Code sent to <span className="font-mono text-ink">{email}</span>.
            </p>
            <label className="block text-sm text-muted">6-digit code</label>
            <input
              required
              autoFocus
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              className="w-full border border-line rounded-lg px-3 py-2 bg-surface focus:border-sage focus:outline-none font-mono tracking-widest text-lg text-center"
            />
            <button type="submit" disabled={busy || otpCode.length !== 6} className="btn-primary w-full">
              {busy ? "Verifying…" : "Sign in"}
            </button>
          </form>
        )}

        {otpError && <p className="text-sm text-amber-700 bg-amber-50 rounded p-2">{otpError}</p>}
      </Wrap>
    );
  }

  // Signed in — show authorize button.
  async function onAuthorize() {
    setAuthState("authorizing");
    setAuthError(null);
    try {
      const sb = getSupabase();
      const { data } = await sb.auth.getSession();
      const s = data.session;
      if (!s || !s.access_token || !s.refresh_token) {
        setAuthError("Session lost. Sign in again.");
        setAuthState("error");
        return;
      }
      const r = await fetch(`${getBackendUrl()}/api/cli/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${s.access_token}`,
        },
        body: JSON.stringify({
          code,
          accessToken: s.access_token,
          refreshToken: s.refresh_token,
          expiresIn: s.expires_in ?? 3600,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
          supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        }),
      });
      if (r.status === 204) {
        setAuthState("done");
        return;
      }
      const j = await r.json().catch(() => ({}));
      const msg =
        j.error === "code_expired_or_unknown" ? "Code expired. Re-run waiting-lounge play and try again." :
        j.error === "already_authorized" ? "This code was already used. Re-run waiting-lounge play to get a fresh one." :
        j.error || `HTTP ${r.status}`;
      setAuthError(msg);
      setAuthState("error");
    } catch (err) {
      setAuthError((err as Error).message);
      setAuthState("error");
    }
  }

  if (authState === "done") {
    return (
      <Wrap>
        <div className="flex items-center gap-2 mb-1">
          <Check className="w-5 h-5 text-emerald-600" />
          <h1 className="text-xl font-medium text-ink">Terminal authorized</h1>
        </div>
        <p className="text-sm text-muted">
          Return to your terminal — it should flip to{" "}
          <span className="font-mono text-ink">Authenticated as {session.user.email}</span>{" "}
          within a few seconds.
        </p>
        <p className="text-xs text-muted">
          You can close this tab. <Link href="/lounge" className="text-sage hover:underline">Or open the lounge.</Link>
        </p>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <div className="flex items-center gap-2 mb-1">
        <Terminal className="w-5 h-5 text-cyan-700" />
        <h1 className="text-xl font-medium text-ink">Authorize terminal</h1>
      </div>
      <p className="text-sm text-muted">
        Authorize terminal access for{" "}
        <span className="font-mono text-ink">{session.user.email}</span>?
      </p>
      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-700" />
          <p className="text-sm text-amber-900 font-medium">
            Verify the code matches your terminal
          </p>
        </div>
        <p className="font-mono text-3xl font-bold tracking-widest text-center text-ink py-2 bg-white rounded border border-amber-200">
          …{codeTail}
        </p>
        <p className="text-xs text-amber-900/80">
          The last 6 characters shown in your terminal window should match the
          large code above. If they don&apos;t, do not click Authorize — close
          this tab and re-run <code className="font-mono">waiting-lounge play</code>.
        </p>
      </div>
      <button
        onClick={onAuthorize}
        disabled={authState === "authorizing"}
        className="btn-primary w-full"
      >
        {authState === "authorizing" ? "Authorizing…" : "Authorize terminal"}
      </button>
      {authError && <p className="text-sm text-amber-700 bg-amber-50 rounded p-2">{authError}</p>}
      <p className="text-xs text-muted">
        This grants the terminal session the same access this browser has —
        signing in as you, playing matches, earning points. The token lives at{" "}
        <code className="font-mono">~/.waiting-lounge/auth_token</code> (mode 600).
      </p>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-lg mx-auto px-6 py-16">
      <div className="card p-6 space-y-3">{children}</div>
    </div>
  );
}

export default function CliPairPage() {
  return (
    <Suspense fallback={<Wrap><p className="text-sm text-muted">Loading…</p></Wrap>}>
      <CliPairInner />
    </Suspense>
  );
}
