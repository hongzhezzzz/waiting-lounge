"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSocket } from "./socket";

// After the user explicitly acknowledges a `needs_attention` event
// (clicks "Return to terminal"), suppress further `needs_attention`
// updates for this long. Notification hooks can fire in clusters
// during a single Claude turn; without suppression the modal would
// re-pop the moment the user dismissed it.
const ACKNOWLEDGE_SUPPRESS_MS = 5_000;

export type AgentStatus = "waiting" | "needs_attention" | "done" | "disconnected";

type Meta = {
  status: AgentStatus;
  ts: number;
  isPaired: boolean;
  source: "real" | "demo" | "none";
};

type ContextValue = {
  meta: Meta;
  deviceId: string | null;
  simulate: (status: AgentStatus) => void;
  setDeviceId: (id: string) => void;
  clearDeviceId: () => void;
  acknowledge: () => void;
};

const DEFAULT_META: Meta = { status: "disconnected", ts: 0, isPaired: false, source: "none" };

const Ctx = createContext<ContextValue>({
  meta: DEFAULT_META,
  deviceId: null,
  simulate: () => {},
  setDeviceId: () => {},
  clearDeviceId: () => {},
  acknowledge: () => {},
});

const DEVICE_KEY = "wl.deviceId";

export function AgentStatusProvider({ children }: { children: ReactNode }) {
  const [deviceId, setDeviceIdState] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta>(DEFAULT_META);
  // Timestamp (ms) of the last user acknowledgement (clicking "Return
  // to terminal"). Used to drop incoming `needs_attention` updates that
  // arrive within ACKNOWLEDGE_SUPPRESS_MS — those are almost always
  // duplicate Notification hooks from the same Claude turn the user
  // already addressed.
  const acknowledgedAtRef = useRef(0);

  // Hydrate deviceId from localStorage once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored && /^[a-f0-9-]{8,64}$/i.test(stored)) {
      setDeviceIdState(stored);
      setMeta((m) => ({ ...m, isPaired: true }));
    }
  }, []);

  // Subscribe to agent_status_update on the singleton socket; re-register
  // the deviceId on (re)connect so server-side mapping survives reconnects.
  useEffect(() => {
    if (!deviceId) return;
    const socket = getSocket();

    function emitRegister() {
      socket.emit("register_device", { deviceId });
    }
    function onUpdate(p: { status: AgentStatus; ts?: number }) {
      // If the user just acknowledged, ignore needs_attention bursts.
      // Other statuses (waiting / done) still pass through immediately
      // so a real "Claude is working" flip is visible right away.
      if (
        p.status === "needs_attention" &&
        Date.now() - acknowledgedAtRef.current < ACKNOWLEDGE_SUPPRESS_MS
      ) {
        return;
      }
      setMeta({
        status: p.status,
        ts: p.ts || Date.now(),
        isPaired: true,
        source: "real",
      });
    }

    socket.on("agent_status_update", onUpdate);
    socket.on("connect", emitRegister);
    if (socket.connected) emitRegister();

    return () => {
      socket.off("agent_status_update", onUpdate);
      socket.off("connect", emitRegister);
    };
  }, [deviceId]);

  // Auto-downgrade `needs_attention` to `done` after 90s with no further
  // events. Catches several edge cases that the hooks themselves miss:
  // Claude Code's interrupt button (no Stop / PostToolUse fires), the
  // assistant turn ending while a Notification was the last event, and
  // closed Claude Code processes (no SessionEnd).
  useEffect(() => {
    if (meta.status !== "needs_attention") return;
    const t = setTimeout(() => {
      setMeta((m) =>
        m.status === "needs_attention"
          ? { ...m, status: "done", ts: Date.now() }
          : m,
      );
    }, 90_000);
    return () => clearTimeout(t);
  }, [meta.status, meta.ts]);

  const simulate = useCallback((status: AgentStatus) => {
    setMeta((prev) => ({ ...prev, status, ts: Date.now(), source: "demo" }));
  }, []);

  // Called when the user clicks "Return to terminal" on the modal.
  // Flips the badge from amber to gray ("Claude may be done") right
  // away — the assumption is that if Claude needed attention, the
  // user has now addressed it; the next real hook event will correct
  // this within seconds if Claude is still actively working.
  const acknowledge = useCallback(() => {
    acknowledgedAtRef.current = Date.now();
    setMeta((prev) =>
      prev.status === "needs_attention"
        ? { ...prev, status: "done", ts: Date.now() }
        : prev,
    );
  }, []);

  const setDeviceId = useCallback((id: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(DEVICE_KEY, id);
    setDeviceIdState(id);
    setMeta((m) => ({ ...m, isPaired: true }));
  }, []);

  const clearDeviceId = useCallback(() => {
    if (typeof window !== "undefined") window.localStorage.removeItem(DEVICE_KEY);
    setDeviceIdState(null);
    setMeta({ ...DEFAULT_META });
  }, []);

  return (
    <Ctx.Provider value={{ meta, deviceId, simulate, setDeviceId, clearDeviceId, acknowledge }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAgentStatus() {
  return useContext(Ctx);
}
