"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getSocket } from "./socket";

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
};

const DEFAULT_META: Meta = { status: "disconnected", ts: 0, isPaired: false, source: "none" };

const Ctx = createContext<ContextValue>({
  meta: DEFAULT_META,
  deviceId: null,
  simulate: () => {},
  setDeviceId: () => {},
  clearDeviceId: () => {},
});

const DEVICE_KEY = "wl.deviceId";

export function AgentStatusProvider({ children }: { children: ReactNode }) {
  const [deviceId, setDeviceIdState] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta>(DEFAULT_META);

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
    <Ctx.Provider value={{ meta, deviceId, simulate, setDeviceId, clearDeviceId }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAgentStatus() {
  return useContext(Ctx);
}
