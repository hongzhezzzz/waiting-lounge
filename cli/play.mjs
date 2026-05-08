// Waiting Lounge — terminal play.
//
// Phase 4a: skeleton + connect.
// Phase 4b: auth bridge — first run opens the browser to /cli-pair?code=…
//          for one-click authorization; subsequent runs reuse the token
//          stored at ~/.waiting-lounge/auth_token (mode 0600).
//
// ESM: this file uses `import` so we can pull in ink v5 (which is
// ESM-only). The CJS dispatcher in cli/waiting-lounge.js loads us via
// dynamic `import("./play.mjs")`.
//
// JSX is intentionally avoided — the package has no build step, so we
// use createElement (aliased `h`).

import { render, Box, Text, useApp, useInput } from "ink";
import { createElement as h, useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import config from "./lib/config.js";
import auth from "./lib/auth.js";

// Phase = "auth" | "pairing" | "connecting" | "connected" | "disconnected" | "error"
function App() {
  const [phase, setPhase] = useState("auth");
  const [error, setError] = useState(null);
  const [pairUrl, setPairUrl] = useState(null);
  const [codeTail, setCodeTail] = useState(null);
  const [handle, setHandle] = useState(null);
  const [email, setEmail] = useState(null);
  const sockRef = useRef(null);
  const tokenRef = useRef(null);
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "q" || input === "Q" || key.escape) {
      if (sockRef.current) {
        try { sockRef.current.disconnect(); } catch {}
      }
      exit();
    }
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const token = await auth.getAccessToken({
          onPairing: ({ url, codeTail }) => {
            if (cancelled) return;
            setPairUrl(url);
            setCodeTail(codeTail);
            setPhase("pairing");
          },
        });
        if (cancelled) return;
        tokenRef.current = token;
        setEmail(extractEmailFromJwt(token));
        setPhase("connecting");

        const backendUrl = config.readBackendUrl();
        const sock = io(backendUrl, {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 5,
          auth: { token },
        });
        sockRef.current = sock;

        sock.on("connect", () => {
          if (!cancelled) setPhase("connected");
        });
        sock.on("disconnect", () => {
          if (!cancelled) setPhase("disconnected");
        });
        sock.on("connect_error", (err) => {
          if (cancelled) return;
          setError(err && err.message ? err.message : "connect_error");
          setPhase("error");
        });
        sock.on("welcome", (msg) => {
          if (!cancelled && msg && typeof msg.handle === "string") {
            setHandle(msg.handle);
          }
        });
      } catch (err) {
        if (cancelled) return;
        setError(err && err.message ? err.message : String(err));
        setPhase("error");
      }
    }
    run();

    return () => {
      cancelled = true;
      if (sockRef.current) {
        try { sockRef.current.disconnect(); } catch {}
      }
    };
  }, []);

  return h(Box, { flexDirection: "column", padding: 1 },
    h(Box, {
      borderStyle: "round",
      borderColor: "cyan",
      paddingX: 2,
      paddingY: 0,
      alignSelf: "flex-start",
    },
      h(Text, { bold: true, color: "cyan" }, "☕ Waiting Lounge"),
    ),

    h(Box, { marginTop: 1, flexDirection: "column" },
      renderPhase({ phase, error, pairUrl, codeTail, handle, email }),
    ),

    h(Box, { marginTop: 1 },
      h(Text, { dimColor: true }, "Press Q to quit."),
    ),
  );
}

function renderPhase({ phase, error, pairUrl, codeTail, handle, email }) {
  switch (phase) {
    case "auth":
      return h(Text, { color: "yellow" }, "Reading saved credentials…");

    case "pairing":
      return h(Box, { flexDirection: "column" },
        h(Text, { bold: true, color: "cyan" }, "Authorize this terminal in your browser."),
        h(Text, null, " "),
        h(Text, null, "We opened this URL for you (or copy/paste it):"),
        h(Text, { color: "blue" }, `  ${pairUrl}`),
        h(Text, null, " "),
        h(Text, { dimColor: true }, `Confirm the code shown there ends with: ${codeTail}`),
        h(Text, null, " "),
        h(Text, { color: "yellow" }, "Waiting for you to click Authorize…"),
      );

    case "connecting":
      return h(Box, { flexDirection: "column" },
        h(Text, { color: "yellow" }, "Connecting to the lounge…"),
        email ? h(Text, { dimColor: true }, `as ${email}`) : null,
      );

    case "connected":
      return h(Box, { flexDirection: "column" },
        h(Text, { color: "green" },
          handle && email ? `Authenticated as ${email} · handle ${handle}` :
          email ? `Authenticated as ${email}` :
          "Connected.",
        ),
        h(Text, { dimColor: true }, "Phase 4b skeleton — match flow lands in 4c."),
      );

    case "disconnected":
      return h(Text, { color: "yellow" }, "Disconnected. Reconnecting…");

    case "error":
      return h(Box, { flexDirection: "column" },
        h(Text, { color: "red" }, `Error: ${error}`),
        h(Text, { dimColor: true }, "Press Q to quit, then re-run `waiting-lounge play`."),
      );

    default:
      return h(Text, null, phase);
  }
}

function extractEmailFromJwt(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    const padded = parts[1] + "===".slice((parts[1].length + 3) % 4);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(b64, "base64").toString("utf8");
    const payload = JSON.parse(json);
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

render(h(App));
