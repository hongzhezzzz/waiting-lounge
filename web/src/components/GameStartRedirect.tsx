"use client";

// Layout-level redirect: any `game_started` event sends the receiving
// player to the game page. Centralizes routing so it does not matter
// which page (lounge, /me, homepage, etc.) the player was on when their
// game started — pool, queue, and invite paths all share this one
// handler. Removes the per-page handlers that drifted in the past.

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getSocket } from "@/lib/socket";

export function GameStartRedirect() {
  const { session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!session) return;
    const socket = getSocket();
    function onStarted(p: { gameId: string; roomId: string; gameType: string; peerHandle: string }) {
      const target = `/games/${p.gameType}/${p.roomId}`;
      // Already on the right game page (e.g., refreshed mid-game)? skip.
      if (pathname === target) return;
      router.push(`${target}?gameId=${p.gameId}&peer=${encodeURIComponent(p.peerHandle)}`);
    }
    socket.on("game_started", onStarted);
    return () => {
      socket.off("game_started", onStarted);
    };
  }, [session, router, pathname]);

  return null;
}
