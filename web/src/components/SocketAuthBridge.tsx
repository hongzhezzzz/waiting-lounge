"use client";

// Pushes the current Supabase access token into the singleton socket so
// games and authed REST routes use the right identity.

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { setSocketAuthToken } from "@/lib/socket";

export function SocketAuthBridge() {
  const { session } = useAuth();
  useEffect(() => {
    setSocketAuthToken(session?.access_token ?? null);
  }, [session?.access_token]);
  return null;
}
