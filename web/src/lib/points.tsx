"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth";
import { getBackendUrl } from "./backend";
import { getSocket } from "./socket";

type ContextValue = {
  points: number | null;
  refresh: () => Promise<void>;
  loading: boolean;
};

const Ctx = createContext<ContextValue>({
  points: null,
  refresh: async () => {},
  loading: false,
});

export function PointsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [points, setPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session?.access_token) {
      setPoints(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${getBackendUrl()}/api/me/balance`, {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setPoints(null);
        return;
      }
      const data = (await res.json()) as { points: number };
      setPoints(data.points);
    } catch {
      // ignore — will retry next event
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  // Refresh on session change.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh on game events (game_resolved, game_aborted) since they shift balance.
  useEffect(() => {
    if (!session) return;
    const socket = getSocket();
    function onResolved(p: { newBalances?: Record<string, number> }) {
      // Server sends newBalances keyed by userId; we don't know our userId
      // here without an extra round-trip. Easier: just re-fetch.
      void p;
      refresh();
    }
    function onAborted() {
      refresh();
    }
    socket.on("game_resolved", onResolved);
    socket.on("game_aborted", onAborted);
    return () => {
      socket.off("game_resolved", onResolved);
      socket.off("game_aborted", onAborted);
    };
  }, [session, refresh]);

  const value = useMemo<ContextValue>(() => ({ points, refresh, loading }), [points, refresh, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBalance() {
  return useContext(Ctx);
}
