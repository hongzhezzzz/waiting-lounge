"use client";

// Tracks whether the user is currently in active gameplay. Set by the
// game shell page on mount, cleared when the game ends (abort or final
// result shown) or on unmount. Header nav links and the layout's
// beforeunload guard read it to confirm before letting the user leave.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ContextValue = {
  inGame: boolean;
  setInGame: (active: boolean) => void;
};

const Ctx = createContext<ContextValue>({
  inGame: false,
  setInGame: () => {},
});

export function InGameProvider({ children }: { children: ReactNode }) {
  const [inGame, setInGame] = useState(false);

  // Tab close / hard reload / external nav: native browser confirm.
  // (Browsers ignore the custom message string in modern versions and
  // show their own copy — the only thing that matters is preventDefault +
  // setting returnValue.)
  useEffect(() => {
    if (!inGame) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [inGame]);

  const value = useMemo(() => ({ inGame, setInGame }), [inGame]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInGame() {
  return useContext(Ctx);
}

// Confirm hook for in-app navigation (Next.js Link clicks). Returns a
// click handler that does nothing if not in a game, and prompts otherwise.
export function useGuardedNavClick() {
  const { inGame } = useInGame();
  return useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!inGame) return;
      const ok = window.confirm(
        "You're in a game. Leaving will end it and refund your ante. Continue?",
      );
      if (!ok) e.preventDefault();
    },
    [inGame],
  );
}
