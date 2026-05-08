// Waiting Lounge — terminal play (Phase 4a skeleton).
//
// `waiting-lounge play` opens a fullscreen TUI, connects to the backend
// over Socket.IO (anonymous for now — Phase 4b adds auth), shows the
// device-id prefix, and exits cleanly on Q.
//
// ESM: this file uses `import` so we can pull in ink v5 (which is
// ESM-only). The CJS dispatcher in cli/waiting-lounge.js loads us via
// dynamic `import("./play.mjs")`.
//
// JSX is intentionally avoided — the package has no build step, so we
// use createElement (aliased `h`). The `h(Component, props, ...children)`
// pattern is verbose but readable enough.

import { render, Box, Text, useApp, useInput } from "ink";
import { createElement as h, useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import config from "./lib/config.js";

function App() {
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState(null);
  const [handle, setHandle] = useState(null);
  const sockRef = useRef(null);
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
    config.ensureConfigDir();
    const backendUrl = config.readBackendUrl();

    const sock = io(backendUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    sockRef.current = sock;

    sock.on("connect", () => setStatus("connected"));
    sock.on("disconnect", () => setStatus("disconnected"));
    sock.on("connect_error", (err) => {
      setError(err.message || "connect_error");
      setStatus("error");
    });
    sock.on("welcome", (msg) => {
      if (msg && typeof msg.handle === "string") setHandle(msg.handle);
    });

    return () => {
      try { sock.disconnect(); } catch {}
    };
  }, []);

  const deviceId = config.readOrCreateDeviceId();
  const backendUrl = config.readBackendUrl();
  const idPrefix = deviceId.slice(0, 8);

  const statusLine =
    status === "connecting" ? h(Text, { color: "yellow" }, "Connecting…") :
    status === "connected" ? h(Text, { color: "green" },
      handle ? `Connected as ${handle} (device ${idPrefix}…)` :
               `Connected (device ${idPrefix}…)`,
    ) :
    status === "disconnected" ? h(Text, { color: "yellow" }, "Disconnected. Reconnecting…") :
    status === "error" ? h(Text, { color: "red" }, `Error: ${error}`) :
    h(Text, null, status);

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
      statusLine,
      h(Text, { color: "gray", dimColor: true }, `backend: ${backendUrl}`),
    ),
    h(Box, { marginTop: 1 },
      h(Text, { dimColor: true }, "Press Q to quit."),
    ),
  );
}

render(h(App));
