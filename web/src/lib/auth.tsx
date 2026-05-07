"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, AuthError } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./supabase";

type ContextValue = {
  configured: boolean;
  session: Session | null;
  email: string | null;
  loading: boolean;
  sendOtp: (email: string) => Promise<{ ok: boolean; error?: string }>;
  verifyOtp: (email: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<ContextValue>({
  configured: false,
  session: null,
  email: null,
  loading: true,
  sendOtp: async () => ({ ok: false, error: "not configured" }),
  verifyOtp: async () => ({ ok: false, error: "not configured" }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(configured);
  const subRef = useRef<{ data: { subscription: { unsubscribe: () => void } } } | null>(null);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    const sub = sb.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null);
    });
    subRef.current = sub;
    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, [configured]);

  const sendOtp = useCallback(async (email: string) => {
    if (!configured) return { ok: false, error: "Auth is not configured. Ask the lounge admin to set Supabase keys." };
    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) return { ok: false, error: prettifyError(error) };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }, [configured]);

  const verifyOtp = useCallback(async (email: string, code: string) => {
    if (!configured) return { ok: false, error: "Auth is not configured." };
    try {
      const { error } = await getSupabase().auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (error) return { ok: false, error: prettifyError(error) };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }, [configured]);

  const signOut = useCallback(async () => {
    if (!configured) return;
    await getSupabase().auth.signOut();
    setSession(null);
  }, [configured]);

  const value = useMemo<ContextValue>(
    () => ({
      configured,
      session,
      email: session?.user?.email ?? null,
      loading,
      sendOtp,
      verifyOtp,
      signOut,
    }),
    [configured, session, loading, sendOtp, verifyOtp, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

function prettifyError(err: AuthError): string {
  const msg = err.message || "Auth error";
  if (msg.includes("Invalid login credentials") || msg.includes("Token has expired")) {
    return "That code didn't work. Try again or request a new one.";
  }
  return msg;
}
