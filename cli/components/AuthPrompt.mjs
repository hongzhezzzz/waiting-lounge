// Waiting Lounge — auth prompt component (Stage 10c).
//
// Surfaces three flows from one component:
//
//   1. choice     — [B]rowser / [T]erminal two-key picker. Skipped when
//                   the caller forces a mode (e.g. headless → terminal).
//   2. browser    — re-rendering of the existing "Authorize in browser…"
//                   screen, owned by the parent via state.pairUrl/codeTail.
//   3. terminal   — email prompt → "sending…" → 6-digit code prompt →
//                   "verifying…" → done. All HTTP is done here against
//                   Supabase REST via helpers from cli/lib/auth.js.
//
// The component lifts very little state up — it owns email, code, error,
// phase. On success it calls onComplete({ accessToken, email }); the
// parent reconnects the socket and resumes the post-auth action.

import { createElement as h, useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { C, B, Footer, Key } from "../lib/theme.mjs";
import auth from "../lib/auth.js";

const PHASE_CHOICE = "choice";
const PHASE_BROWSER = "browser_wait";
const PHASE_EMAIL = "email";
const PHASE_SENDING = "sending";
const PHASE_CODE = "code";
const PHASE_VERIFYING = "verifying";
const PHASE_ERROR = "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskEmailForDisplay(email) {
  // No real masking — just safe to print as-is. Keeping the helper so
  // we can add masking later without changing call sites.
  return email;
}

export function AuthPrompt({
  defaultMode = PHASE_CHOICE, // "choice" | "terminal" | "browser_wait"
  pairUrl = null,             // browser flow: passed in by parent
  codeTail = null,            // browser flow: passed in by parent
  onComplete,                 // ({ accessToken, email, mode }) called on success
  onCancel,                   // () called when user gives up (Esc)
  onBrowserChosen,            // () called when user picks [B] in the choice phase
}) {
  const [phase, setPhase] = useState(defaultMode);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);
  const [supabaseCfg, setSupabaseCfg] = useState(null);

  // When the parent toggles back to choice/browser_wait via prop change
  // (e.g. the browser flow completed), reflect it in our local phase.
  useEffect(() => { setPhase(defaultMode); }, [defaultMode]);

  const sendOtp = useCallback(async () => {
    setPhase(PHASE_SENDING);
    setErrorMsg(null);
    try {
      const cfg = supabaseCfg || (await auth.fetchSupabaseConfig());
      setSupabaseCfg(cfg);
      const r = await auth.requestOtp({ ...cfg, email });
      if (!r.ok) {
        setErrorMsg(r.error || "Couldn't send the code.");
        setPhase(PHASE_ERROR);
        return;
      }
      setCode("");
      setPhase(PHASE_CODE);
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setPhase(PHASE_ERROR);
    }
  }, [email, supabaseCfg]);

  const verifyCode = useCallback(async (fullCode) => {
    setPhase(PHASE_VERIFYING);
    setErrorMsg(null);
    try {
      const cfg = supabaseCfg || (await auth.fetchSupabaseConfig());
      setSupabaseCfg(cfg);
      const r = await auth.verifyOtp({ ...cfg, email, code: fullCode });
      if (!r.ok) {
        setErrorMsg(r.error || "Code didn't verify.");
        setPhase(PHASE_ERROR);
        return;
      }
      const accessToken = auth.persistTerminalSession({
        supabaseUrl: cfg.supabaseUrl,
        supabaseAnonKey: cfg.supabaseAnonKey,
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        expiresIn: r.expiresIn,
      });
      onComplete?.({ accessToken, email, mode: "terminal" });
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setPhase(PHASE_ERROR);
    }
  }, [email, onComplete, supabaseCfg]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }
    if (phase === PHASE_CHOICE) {
      if (input === "B" || input === "b") {
        onBrowserChosen?.();
        return;
      }
      if (input === "T" || input === "t") {
        setPhase(PHASE_EMAIL);
        return;
      }
      return;
    }
    if (phase === PHASE_EMAIL) {
      if (key.return) {
        if (!EMAIL_RE.test(email)) {
          setErrorMsg("Please enter a valid email address.");
          return;
        }
        setErrorMsg(null);
        void sendOtp();
        return;
      }
      if (key.backspace || key.delete) {
        setEmail((e) => e.slice(0, -1));
        return;
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setEmail((e) => (e + input).slice(0, 254));
      }
      return;
    }
    if (phase === PHASE_CODE) {
      if (key.backspace || key.delete) {
        setCode((c) => c.slice(0, -1));
        return;
      }
      if (input && /^[0-9]$/.test(input)) {
        const next = (code + input).slice(0, 6);
        setCode(next);
        if (next.length === 6) {
          void verifyCode(next);
        }
      }
      return;
    }
    if (phase === PHASE_ERROR) {
      // Any key returns to the relevant input phase to retry.
      if (input || key.return) {
        setErrorMsg(null);
        setPhase(email && code ? PHASE_CODE : PHASE_EMAIL);
      }
    }
  });

  // ---------- render ----------

  if (phase === PHASE_CHOICE) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "Sign in to find a match"),
      h(Text, { dimColor: true }, "Bot games stay anonymous — this is only for the points pool."),
      h(Box, { marginTop: 1, flexDirection: "column" },
        h(Box, null,
          h(Key, { label: "B" }),
          h(Text, { color: C.brand, bold: true }, " Browser"),
          h(Text, { dimColor: true }, "  opens a tab; sign in with email there"),
        ),
        h(Box, null,
          h(Key, { label: "T", color: C.peer }),
          h(Text, { color: C.peer, bold: true }, " Terminal"),
          h(Text, { dimColor: true }, "  type your email here, get a 6-digit code, done"),
        ),
      ),
      h(Footer, { items: [["B", " browser"], ["T", " terminal"], ["Esc", " cancel"]] }),
    );
  }

  if (phase === PHASE_BROWSER) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "Authorize this terminal"),
      h(Box, { marginTop: 1, flexDirection: "column" },
        h(Text, null, "We opened this URL in your browser:"),
        h(Text, { color: C.link }, `  ${pairUrl || ""}`),
        h(Text, { dimColor: true }, "Didn't open? Copy that URL into any browser."),
      ),
      h(Box, { marginTop: 1, flexDirection: "column" },
        h(Text, null,
          "Verify the code there ends with: ",
          h(Text, { color: C.warning, bold: true }, codeTail || ""),
        ),
        h(Text, { color: C.warning }, "Waiting for you to click Authorize…"),
      ),
      h(Footer, { items: [["Esc", " cancel"]] }),
    );
  }

  if (phase === PHASE_EMAIL) {
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "Sign in via terminal"),
      h(Text, { dimColor: true }, "We'll email a 6-digit code to verify."),
      h(Box, { marginTop: 1 },
        h(Text, null, "email "),
        h(Text, { color: C.brand, bold: true }, email),
        h(Text, { color: C.brand }, "▎"),
      ),
      errorMsg ? h(Text, { color: C.danger }, errorMsg) : null,
      h(Footer, { items: [["Enter", " send code"], ["Backspace", " edit"], ["Esc", " cancel"]] }),
    );
  }

  if (phase === PHASE_SENDING) {
    return h(Box, { flexDirection: "column" },
      h(Text, { color: C.warning }, "Sending a 6-digit code to "),
      h(Text, { color: C.brand, bold: true }, maskEmailForDisplay(email)),
      h(Text, { color: C.warning }, "…"),
    );
  }

  if (phase === PHASE_CODE) {
    const digits = code.padEnd(6, "·").split("");
    return h(Box, { flexDirection: "column" },
      h(Text, { bold: true, color: C.brand }, "Check your email"),
      h(Text, { dimColor: true }, `Code sent to ${maskEmailForDisplay(email)}. Type the 6 digits.`),
      h(Box, { marginTop: 1 },
        h(Text, null, "code "),
        ...digits.map((d, i) => h(Text, {
          key: i,
          color: i < code.length ? C.brand : "gray",
          bold: i < code.length,
        }, ` ${d} `)),
      ),
      errorMsg ? h(Text, { color: C.danger }, errorMsg) : null,
      h(Footer, { items: [["digits", " type"], ["Backspace", " edit"], ["Esc", " cancel"]] }),
    );
  }

  if (phase === PHASE_VERIFYING) {
    return h(Box, { flexDirection: "column" },
      h(Text, { color: C.warning }, "Verifying…"),
    );
  }

  if (phase === PHASE_ERROR) {
    return h(Box, { borderStyle: B.strong, borderColor: C.danger, padding: 1, flexDirection: "column" },
      h(Text, { color: C.danger, bold: true }, "Something went wrong"),
      h(Text, null, errorMsg || "Unknown error."),
      h(Text, { dimColor: true }, "Press any key to retry, Esc to cancel."),
    );
  }

  return null;
}

export default AuthPrompt;
