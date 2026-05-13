// Waiting Lounge — terminal play.
//
// Phase 4a: skeleton + connect.
// Phase 4b: auth bridge.
// Phase 4c: match flow + Indian Poker round renderer; placeholder for
//           the other 6 round types (full renderers in 4d).
//
// State shape lives in `initialState`; transitions in `reducer`. The
// useEffect after the socket is created wires every server event to a
// reducer action; useInput dispatches keypresses based on the current
// phase.
//
// ESM because ink v5 is ESM-only. JSX is intentionally avoided
// (no build step) — `h(Component, props, ...children)` instead.

import fs from "node:fs";
import { render, Box, Text, useApp, useInput } from "ink";
import { createElement as h, useEffect, useReducer, useRef } from "react";
import { io } from "socket.io-client";
import config from "./lib/config.js";
import auth from "./lib/auth.js";
import { ChipBar } from "./components/ChipBar.mjs";
import { BetPhasePanel } from "./components/BetPhasePanel.mjs";
import { RevealCard } from "./components/RevealCard.mjs";
import { MatchEndScreen } from "./components/MatchEndScreen.mjs";
import { ChatPanel } from "./components/ChatPanel.mjs";
import { IndianPokerRound } from "./components/rounds/IndianPoker.mjs";
import { PlaceholderRound } from "./components/rounds/Placeholder.mjs";
import { EstimationRound } from "./components/rounds/Estimation.mjs";
import { MontyMirageRound } from "./components/rounds/MontyMirage.mjs";
import { ChickenRound } from "./components/rounds/Chicken.mjs";
import { BigORound } from "./components/rounds/BigO.mjs";
import { GeoTriviaRound } from "./components/rounds/GeoTrivia.mjs";
import { StockDirectionRound } from "./components/rounds/StockDirection.mjs";
import { CollapsedStrip } from "./components/CollapsedStrip.mjs";
import { AuthPrompt } from "./components/AuthPrompt.mjs";
import { C, B, BRAND, Banner, Footer, Hint, Key, PhasePill } from "./lib/theme.mjs";

// CLI flags. --dock switches the App into dock-mode rendering
// (height-conditional: CollapsedStrip when the pane is small, full UI
// otherwise). --write-state-to=<path> writes a JSON snapshot on every
// state change so other tools (Claude Code statusline in 6b) can read
// live state.
const DOCK_MODE = process.argv.includes("--dock");
const STATE_FILE = (() => {
  const arg = process.argv.find((a) => a && a.startsWith("--write-state-to="));
  return arg ? arg.slice("--write-state-to=".length) : null;
})();
// In dock mode, render CollapsedStrip when the pane is this many rows
// or fewer; render the full UI otherwise. Configurable so the toggle
// can be tuned without code changes.
const COLLAPSED_THRESHOLD = parseInt(process.env.WL_DOCK_COLLAPSED_THRESHOLD ?? "6", 10);

const initialState = {
  // Stage 10b: defer auth. App starts in "connecting" (anonymous socket
  // negotiation) rather than "auth" (forced credentials prompt). The
  // "pairing" phase only appears later when the user picks a real-points
  // pool match without a token on disk.
  appPhase: "connecting", // connecting|auth_choice|pairing|lobby|searching|in_match|match_end|error
  email: null,
  myHandle: null,
  mySocketId: null,
  pairUrl: null,
  codeTail: null,
  authMode: null,         // "choice" | "terminal" — drives AuthPrompt initial phase
  error: null,
  toast: null,

  poolWaiting: null,     // { gameType, durationMin, ante, startedAt }

  match: null,           // { gameId, roomId, peerHandle, peerSocketId, durationMin, ante }
  round: null,           // { round, total, type, payload, phase, pot, chipStacks, endsAt }
  myBet: null,           // { type, raise, chipStack } (private)
  betsClosed: null,      // { bets, pot, chipStacks }
  myAnswer: null,        // user's answer-phase lock (varies by round type)
  numericInput: "",      // in-progress text for numeric rounds (estimation/monty/stock magnitude)
  stockDir: null,        // sub-state for stock_direction: "up"|"down"|null
  resolved: null,        // last round_resolved payload

  end: null,             // game_resolved payload
  betSecondsLeft: null,

  // 4e: confirm dialog (currently only "forfeit") + reconnect banner.
  confirmDialog: null,   // null | "forfeit"
  reconnecting: false,   // socket dropped while in_match; waiting for re-attach

  // 5.1: chat-while-playing.
  chatMessages: [],      // [{from: "me"|"peer", body, ts}]
  chatMode: false,       // true → keys go to chatInput, not game
  chatInput: "",         // in-progress text
};

function reducer(state, action) {
  switch (action.type) {
    case "AUTH_PAIRING":
      return { ...state, appPhase: "pairing", pairUrl: action.url, codeTail: action.codeTail };
    case "OPEN_AUTH_CHOICE":
      // action.mode: "choice" | "terminal" — opens AuthPrompt with that default.
      return { ...state, appPhase: "auth_choice", authMode: action.mode };
    case "AUTH_CONNECTING":
      return { ...state, appPhase: "connecting", email: action.email };
    case "AUTH_ERROR":
      return { ...state, appPhase: "error", error: action.error };
    case "AUTH_CANCELLED":
      return { ...state, appPhase: "lobby", authMode: null, pairUrl: null, codeTail: null };
    case "SOCKET_CONNECTED":
      return {
        ...state,
        appPhase: state.appPhase === "in_match" || state.appPhase === "searching" ? state.appPhase : "lobby",
        reconnecting: false,
      };
    case "SOCKET_DISCONNECTED":
      // Mid-match drop → mark reconnecting (overlays the in-match scene).
      // Pre-match drop → toast.
      return {
        ...state,
        reconnecting: state.appPhase === "in_match",
        toast: state.appPhase === "in_match" ? null : "Disconnected. Reconnecting…",
      };
    case "WELCOME":
      return { ...state, myHandle: action.handle, mySocketId: action.socketId };
    case "TOAST":
      return { ...state, toast: action.message };
    case "ERROR":
      return { ...state, appPhase: "error", error: action.message };
    case "BEGIN_SEARCH":
      return { ...state, appPhase: "searching", poolWaiting: null, toast: null };
    case "POOL_WAITING":
      return {
        ...state,
        appPhase: "searching",
        poolWaiting: {
          gameType: action.gameType,
          durationMin: action.durationMin,
          ante: action.ante,
          startedAt: Date.now(),
        },
      };
    case "GAME_STARTED":
      return {
        ...state,
        appPhase: "in_match",
        poolWaiting: null,
        match: {
          gameId: action.gameId,
          roomId: action.roomId,
          peerHandle: action.peerHandle,
          peerSocketId: null,
          durationMin: action.durationMin,
          ante: action.ante,
        },
        round: null,
        myBet: null,
        betsClosed: null,
        myAnswer: null,
        numericInput: "",
        stockDir: null,
        resolved: null,
        end: null,
        // Chat resets on new match.
        chatMessages: [],
        chatMode: false,
        chatInput: "",
      };
    case "ROUND_START": {
      const p = action.payload;
      // peerSocketId: any chipStack key that isn't mine.
      const peerSocketId = Object.keys(p.chipStacks || {}).find((s) => s !== state.mySocketId) || state.match?.peerSocketId || null;
      return {
        ...state,
        round: {
          round: p.round,
          total: p.total,
          type: p.roundType,
          payload: p.payload,
          phase: p.phase,
          pot: p.pot,
          chipStacks: p.chipStacks,
          endsAt: p.endsAt,
          scores: p.scores,
        },
        match: state.match ? { ...state.match, peerSocketId } : state.match,
        myBet: null,
        betsClosed: null,
        myAnswer: null,
        numericInput: "",
        stockDir: null,
        resolved: null,
        betSecondsLeft: null,
      };
    }
    case "PHASE_CHANGE":
      return {
        ...state,
        round: state.round ? {
          ...state.round,
          phase: action.phase,
          pot: action.pot ?? state.round.pot,
          chipStacks: action.chipStacks ?? state.round.chipStacks,
          endsAt: action.endsAt ?? state.round.endsAt,
        } : state.round,
        betSecondsLeft: action.phase === "bet" && action.betWindowMs ? Math.ceil(action.betWindowMs / 1000) : null,
      };
    case "BET_RECORDED":
      return {
        ...state,
        myBet: { type: action.bet.type, raise: action.bet.raise, chipStack: action.chipStack },
        round: state.round ? { ...state.round, pot: action.pot ?? state.round.pot } : state.round,
      };
    case "BET_PHASE_CLOSED":
      return {
        ...state,
        betsClosed: { bets: action.bets, pot: action.pot, chipStacks: action.chipStacks },
        round: state.round ? {
          ...state.round,
          pot: action.pot ?? state.round.pot,
          chipStacks: action.chipStacks ?? state.round.chipStacks,
        } : state.round,
        betSecondsLeft: null,
      };
    case "ANSWER_LOCKED":
      return { ...state, myAnswer: action.value, numericInput: "" };
    case "SET_NUMERIC_INPUT":
      return { ...state, numericInput: action.value };
    case "SET_STOCK_DIR":
      return { ...state, stockDir: action.dir };
    case "ROUND_RESOLVED":
      return {
        ...state,
        resolved: action.payload,
        round: state.round ? {
          ...state.round,
          pot: action.payload.pot ?? state.round.pot,
          chipStacks: action.payload.chipStacks ?? state.round.chipStacks,
        } : state.round,
      };
    case "GAME_RESOLVED":
      return { ...state, appPhase: "match_end", end: action.payload };
    case "GAME_ABORTED":
      return { ...state, appPhase: "match_end", end: { ...action.payload, aborted: true } };
    case "RETURN_TO_LOBBY":
      return {
        ...state,
        appPhase: "lobby",
        match: null,
        round: null,
        myBet: null,
        betsClosed: null,
        myAnswer: null,
        numericInput: "",
        stockDir: null,
        resolved: null,
        end: null,
        chatMessages: [],
        chatMode: false,
        chatInput: "",
      };
    case "BET_TICK":
      return { ...state, betSecondsLeft: state.betSecondsLeft != null ? Math.max(0, state.betSecondsLeft - 1) : null };
    case "SEARCH_TICK":
      // No-op state update — purely to trigger a re-render so
      // renderSearchTimer recomputes elapsed/botFillIn from Date.now().
      return { ...state };
    case "SHOW_CONFIRM":
      return { ...state, confirmDialog: action.dialogType };
    case "HIDE_CONFIRM":
      return { ...state, confirmDialog: null };
    case "CHAT_TOGGLE":
      return { ...state, chatMode: !state.chatMode, chatInput: "" };
    case "CHAT_INPUT_APPEND":
      return { ...state, chatInput: state.chatInput + action.char };
    case "CHAT_INPUT_BACKSPACE":
      return { ...state, chatInput: state.chatInput.slice(0, -1) };
    case "CHAT_SEND":
      // Optimistic local append + clear input. Backend doesn't echo
      // own messages, so this is the only render path for our own text.
      return {
        ...state,
        chatMessages: [...state.chatMessages, { from: "me", body: action.body, ts: Date.now() }],
        chatInput: "",
      };
    case "CHAT_RECEIVED":
      return {
        ...state,
        chatMessages: [...state.chatMessages, { from: "peer", body: action.body, ts: action.ts || Date.now() }],
      };
    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const sockRef = useRef(null);
  const tokenRef = useRef(null);
  const stateRef = useRef(state);
  // Keep ref synced with latest state for socket-event closures that
  // were captured at mount and need to read current state.
  stateRef.current = state;
  const { exit } = useApp();

  // -------- input --------
  useInput((input, key) => {
    // Stage 10c: AuthPrompt owns its own keystrokes during auth_choice.
    // Bail out so we don't double-handle (e.g. Q exiting the app while
    // the user is typing their email).
    if (state.appPhase === "auth_choice") return;
    // Confirm dialog open: only Y/N (or Enter/Esc) is accepted.
    if (state.confirmDialog) {
      if (input === "y" || input === "Y" || key.return) {
        // Forfeit confirmed — disconnect cleanly. Server's 10s grace
        // timer expires and the opponent (or bot) wins by forfeit.
        cleanExit(sockRef.current, exit);
      } else if (input === "n" || input === "N" || key.escape) {
        dispatch({ type: "HIDE_CONFIRM" });
      }
      return;
    }

    // Chat mode: all keys append to chat input; ESC exits, Enter sends.
    // Game keys (bet tiers, answer keys, Q to quit) are NOT routed
    // here — the user must ESC out first.
    if (state.chatMode) {
      if (key.escape) {
        dispatch({ type: "CHAT_TOGGLE" });
        return;
      }
      if (key.return) {
        const body = state.chatInput.trim();
        if (body && sockRef.current) {
          try { sockRef.current.emit("chat_message", { body }); } catch {}
          dispatch({ type: "CHAT_SEND", body });
        }
        return;
      }
      if (key.backspace || key.delete) {
        dispatch({ type: "CHAT_INPUT_BACKSPACE" });
        return;
      }
      // Printable single-char input (skip control + modifier-held).
      if (input && input.length === 1 && !key.ctrl && !key.meta && state.chatInput.length < 500) {
        dispatch({ type: "CHAT_INPUT_APPEND", char: input });
      }
      return;
    }

    // T toggles chat mode (only meaningful during a match).
    if ((input === "t" || input === "T") && state.appPhase === "in_match") {
      dispatch({ type: "CHAT_TOGGLE" });
      return;
    }

    if (input === "q" || input === "Q" || key.escape) {
      // In-match Q triggers a forfeit confirm; everywhere else, just exit.
      if (state.appPhase === "in_match") {
        dispatch({ type: "SHOW_CONFIRM", dialogType: "forfeit" });
        return;
      }
      cleanExit(sockRef.current, exit);
      return;
    }
    if (state.appPhase === "lobby") {
      if (input === "f" || input === "F") {
        // Stage 10b/c: pool matches require auth (real points).
        if (!tokenRef.current) {
          // Stage 10c: open the [B]rowser / [T]erminal choice surface
          // instead of jumping straight to the browser. Headless boxes
          // skip the choice and go directly to terminal OTP since
          // browser is impossible there.
          const headless = isHeadlessEnv();
          dispatch({ type: "OPEN_AUTH_CHOICE", mode: headless ? "terminal" : "choice" });
          return;
        }
        if (sockRef.current) {
          sockRef.current.emit("queue_for_pool", { gameType: "brain_bet" });
          dispatch({ type: "BEGIN_SEARCH" });
        }
      } else if (input === "b" || input === "B") {
        // Bot matches work anonymously (Stage 10b backend tweak).
        if (sockRef.current) {
          sockRef.current.emit("start_bot_match_now", { gameType: "brain_bet" });
          dispatch({ type: "BEGIN_SEARCH" });
        }
      }
      return;
    }
    if (state.appPhase === "searching") {
      if (input === "x" || input === "X") {
        sockRef.current?.emit("cancel_game_queue");
        dispatch({ type: "RETURN_TO_LOBBY" });
      }
      return;
    }
    if (state.appPhase === "match_end") {
      // Any key returns to lobby.
      dispatch({ type: "RETURN_TO_LOBBY" });
      return;
    }
    if (state.appPhase !== "in_match") return;
    if (!state.round || !sockRef.current || !state.match) return;

    // Bet phase keys.
    if (state.round.phase === "bet" && !state.myBet) {
      const choice = betKeyToChoice(input);
      if (choice) {
        sockRef.current.emit("game_action", {
          gameId: state.match.gameId,
          action: { type: "bet", choice },
        });
      }
      return;
    }
    // Answer phase — dispatched per round type. All locks are
    // optimistic (we set myAnswer immediately on emit); the server
    // echo (decision/submission/pick/lock_recorded) is a no-op
    // confirmation. If the server rejects we just don't get to play
    // — same as the browser.
    if (state.round.phase === "answer" && !state.myAnswer) {
      handleAnswerInput({
        input, key, state, sock: sockRef.current, dispatch,
      });
    }
  });

  // -------- bet timer ticker --------
  // Reducer decrements; this effect just ticks once per second while
  // the bet phase is open. Deps intentionally exclude betSecondsLeft
  // so the interval doesn't churn on every tick.
  useEffect(() => {
    if (state.appPhase !== "in_match") return;
    if (state.round?.phase !== "bet") return;
    const t = setInterval(() => dispatch({ type: "BET_TICK" }), 1000);
    return () => clearInterval(t);
  }, [state.appPhase, state.round?.phase]);

  // -------- search-screen ticker --------
  // The "Xs elapsed · bot fills in ~Ys" line is computed from
  // poolWaiting.startedAt at render time; without a periodic tick the
  // numbers freeze at whatever they were when poolWaiting first
  // landed. This effect forces a re-render every 1s while searching.
  useEffect(() => {
    if (state.appPhase !== "searching") return;
    const t = setInterval(() => dispatch({ type: "SEARCH_TICK" }), 1000);
    return () => clearInterval(t);
  }, [state.appPhase]);

  // -------- socket setup (Stage 10b: anonymous-by-default) --------
  // Try to read a stored token from disk; if present + valid, connect
  // authenticated. Otherwise, connect anonymously and let the user
  // browse the lobby + play bot matches without ever signing in. Auth
  // is triggered lazily by `runAuthAndJoinPool` below when the user
  // picks a real-points pool match.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const token = await auth.getStoredToken();
        if (cancelled) return;
        tokenRef.current = token;
        const email = token ? extractEmailFromJwt(token) : null;
        dispatch({ type: "AUTH_CONNECTING", email });

        const backendUrl = config.readBackendUrl();
        const sock = io(backendUrl, {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 10,
          // Anonymous if no token — backend's optional-auth middleware
          // (sockets.ts:266) accepts the empty handshake.
          auth: token ? { token } : {},
        });
        sockRef.current = sock;
        wireSocket(sock, dispatch, () => stateRef.current);
      } catch (err) {
        if (cancelled) return;
        dispatch({ type: "AUTH_ERROR", error: err && err.message ? err.message : String(err) });
      }
    }
    run();

    return () => {
      cancelled = true;
      if (sockRef.current) {
        try { sockRef.current.disconnect(); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Common path after either browser OR terminal auth completes: tear
  // down the anonymous socket, reconnect with the new token, then queue
  // for pool. socket.io buffers emits until connected, so we can call
  // sock.emit immediately after creating the connection.
  function reconnectAndJoinPool(token) {
    tokenRef.current = token;
    const email = extractEmailFromJwt(token);
    try { sockRef.current?.disconnect(); } catch {}
    dispatch({ type: "AUTH_CONNECTING", email });

    const backendUrl = config.readBackendUrl();
    const sock = io(backendUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      auth: { token },
    });
    sockRef.current = sock;
    wireSocket(sock, dispatch, () => stateRef.current);
    sock.emit("queue_for_pool", { gameType: "brain_bet" });
    dispatch({ type: "BEGIN_SEARCH" });
  }

  // Browser path: open Supabase via /cli-pair, poll until authorized.
  // Called when the user picks [B] from the auth_choice surface.
  async function runBrowserAuthAndJoinPool() {
    try {
      const token = await auth.getAccessToken({
        onPairing: ({ url, codeTail }) =>
          dispatch({ type: "AUTH_PAIRING", url, codeTail }),
      });
      reconnectAndJoinPool(token);
    } catch (err) {
      dispatch({ type: "AUTH_ERROR", error: err && err.message ? err.message : String(err) });
    }
  }

  // Stage 6a: write a state snapshot on every change for the statusline
  // integration in 6b. Atomic write (.tmp + rename) so a concurrent
  // reader never sees torn JSON. Swallow errors — never crash the
  // lounge over a write failure.
  useEffect(() => {
    if (!STATE_FILE) return;
    const snapshot = {
      handle: state.myHandle,
      email: state.email,
      appPhase: state.appPhase,
      roundLabel: state.round ? `R${state.round.round}/${state.round.total}` : null,
      roundType: state.round?.type ?? null,
      betSecondsLeft: state.betSecondsLeft,
      peerHandle: state.match?.peerHandle ?? null,
      reconnecting: state.reconnecting,
      ts: Date.now(),
    };
    try {
      const tmp = `${STATE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(snapshot));
      fs.renameSync(tmp, STATE_FILE);
    } catch {
      // Intentionally swallowed — the lounge must not crash because
      // a sibling process (or path) made the snapshot write fail.
    }
  }, [state]);

  // -------- render --------
  // Stage 6a dock mode: when the lounge pane is small (collapsed strip
  // or accidental tiny resize), render the single-row CollapsedStrip
  // instead of the full UI. ink re-renders on SIGWINCH, so the toggle
  // "just works" when tmux resizes the pane.
  const rows = process.stdout.rows ?? 24;
  if (DOCK_MODE && rows <= COLLAPSED_THRESHOLD) {
    return h(CollapsedStrip, { state });
  }
  // Cap the top-level Box to terminal height with overflow:"hidden"
  // so ink clips instead of letting the layout grow past the visible
  // area — without this, round transitions cause the terminal to
  // auto-scroll to keep the bottom in view, which reads as the screen
  // jumping on every new question.
  // Stage 10c: AuthPrompt is mounted as a peer of renderScene during the
  // auth_choice phase so it can own its own keyboard input (via useInput).
  // renderScene returns null for that case to avoid stealing keystrokes.
  const showAuthPrompt = state.appPhase === "auth_choice";
  return h(Box, { flexDirection: "column", padding: 1, height: rows, overflow: "hidden" },
    h(Banner, null),

    h(Box, { marginTop: 1, flexDirection: "column" },
      showAuthPrompt
        ? h(AuthPrompt, {
            defaultMode: state.authMode === "terminal" ? "email" : "choice",
            onComplete: ({ accessToken }) => reconnectAndJoinPool(accessToken),
            onBrowserChosen: () => runBrowserAuthAndJoinPool(),
            onCancel: () => dispatch({ type: "AUTH_CANCELLED" }),
          })
        : renderScene(state),
    ),

    state.reconnecting ? h(Box, {
      marginTop: 1,
      borderStyle: B.primary,
      borderColor: C.warning,
      paddingX: 1,
    },
      h(Text, { color: C.warning, bold: true }, "⟳ Reconnecting…"),
      h(Text, { dimColor: true }, "  We'll re-sync within 10 seconds. You can keep watching."),
    ) : null,

    state.confirmDialog === "forfeit" ? h(Box, {
      marginTop: 1,
      borderStyle: B.strong,
      borderColor: C.danger,
      paddingX: 2,
      paddingY: 0,
      flexDirection: "column",
    },
      h(Text, { color: C.danger, bold: true }, "Forfeit this match?"),
      h(Text, null, "You'll lose the antes already in the pot."),
      h(Box, { marginTop: 1 },
        h(Hint, { items: [
          ["Y", " forfeit"],
          ["N", " keep playing"],
        ] }),
      ),
    ) : null,

    state.toast ? h(Box, { marginTop: 1 },
      h(Text, { color: C.warning }, state.toast),
    ) : null,

    renderFooter(state),
  );
}

// renderFooter — every scene gets a one-line dimmed footer listing
// the keys that work right now. Format: `[K] verb · [K] verb …`.
// Keep items short — verbs only, no full sentences.
function renderFooter(state) {
  if (state.confirmDialog) {
    return h(Footer, { items: [["Y", " confirm"], ["N", " cancel"]] });
  }
  if (state.reconnecting) {
    return h(Footer, { items: ["reconnecting…", ["Q", " give up"]] });
  }
  if (state.chatMode) {
    return h(Footer, { items: ["typing in chat", ["Enter", " send"], ["Esc", " exit chat"]] });
  }
  const items = footerItems(state);
  return h(Footer, { items });
}

function footerItems(state) {
  switch (state.appPhase) {
    case "auth":
    case "pairing":
    case "connecting":
      return [["Q", " quit"]];
    case "lobby":
      return [["F", " find match"], ["B", " bot now"], ["Q", " quit"]];
    case "searching":
      return [["X", " cancel"], ["Q", " quit"]];
    case "in_match": {
      const tail = [["T", " chat"], ["Q", " forfeit"]];
      if (state.round?.phase === "bet" && !state.myBet) {
        return [
          ["C", " check"], ["1/2/3", " raise"], ["A", " all-in"], ["F", " fold"],
          ...tail,
        ];
      }
      if (state.round?.phase === "answer" && !state.myAnswer) {
        return [...answerFooterItems(state), ...tail];
      }
      return ["waiting for opponent…", ...tail];
    }
    case "match_end":
      return [["any key", " play again"], ["Q", " quit"]];
    case "error":
      return [["Q", " quit"]];
    default:
      return [["Q", " quit"]];
  }
}

function answerFooterItems(state) {
  const t = state.round?.type;
  if (t === "indian_poker") return [["B", " bet"], ["F", " fold"]];
  if (t === "chicken") return [["1–9", " pick"], ["0", " pick 10"]];
  if (t === "big_o" || t === "geo_trivia") return [["1–N", " pick a choice"]];
  if (t === "estimation" || t === "monty_mirage") {
    return [["digits", " type"], ["Enter", " submit"], ["Backspace", " edit"]];
  }
  if (t === "stock_direction") {
    return state.stockDir == null
      ? [["U", " up"], ["D", " down"]]
      : [["digits", " magnitude"], ["Enter", " submit"], ["Backspace", " change direction"]];
  }
  return [];
}

function renderScene(state) {
  switch (state.appPhase) {
    case "auth":
      return h(Box, { flexDirection: "column" },
        h(Text, { color: C.warning }, "Reading saved credentials…"),
        h(Text, { dimColor: true }, "If this is your first run, the browser will open in a moment."),
      );
    case "auth_choice":
      // Stage 10c — the AuthPrompt renders both the B/T picker and the
      // terminal OTP email/code flow. Browser is just a passthrough to
      // the existing runBrowserAuthAndJoinPool().
      return null; // placeholder — actual render happens via dispatch tunnel below
    case "pairing":
      return h(Box, { flexDirection: "column" },
        h(Text, { bold: true, color: C.brand }, "Authorize this terminal"),
        h(Box, { marginTop: 1, flexDirection: "column" },
          h(Text, null, "We opened this URL in your browser:"),
          h(Text, { color: C.link }, `  ${state.pairUrl}`),
          h(Text, { dimColor: true }, "Didn't open? Copy that URL into any browser."),
        ),
        h(Box, { marginTop: 1, flexDirection: "column" },
          h(Text, null,
            "Verify the code there ends with: ",
            h(Text, { color: C.warning, bold: true }, state.codeTail),
          ),
          h(Text, { color: C.warning }, "Waiting for you to click Authorize…"),
        ),
      );
    case "connecting":
      return h(Box, { flexDirection: "column" },
        h(Text, { color: C.warning }, "Connecting to the lounge…"),
        state.email ? h(Text, { dimColor: true }, `as ${state.email}`) : null,
      );
    case "lobby":
      return renderLobby(state);
    case "searching":
      return renderSearching(state);
    case "in_match":
      return renderInMatch(state);
    case "match_end":
      return h(MatchEndScreen, {
        end: state.end,
        mySocketId: state.mySocketId,
        myHandle: state.myHandle,
        peerHandle: state.match?.peerHandle ?? "opponent",
      });
    case "error":
      return h(Box, { flexDirection: "column" },
        h(Box, {
          borderStyle: B.strong,
          borderColor: C.danger,
          paddingX: 2,
          paddingY: 0,
          flexDirection: "column",
        },
          h(Text, { color: C.danger, bold: true }, "Something went wrong"),
          h(Text, null, state.error || "Unknown error."),
        ),
        h(Text, { dimColor: true, marginTop: 1 }, "Re-run ", h(Text, { color: C.brand }, "waiting-lounge play"), " to retry."),
      );
    default:
      return h(Text, null, state.appPhase);
  }
}

function renderLobby(state) {
  const greeting =
    state.myHandle && state.email ? `${state.email}  ·  handle ` :
    state.email ? `${state.email}` :
    state.myHandle ? "anonymous  ·  handle " :
    "Connected.";
  const anon = !state.email;
  return h(Box, { flexDirection: "column" },
    // Identity row.
    h(Box, null,
      h(Text, { color: anon ? C.warning : C.success }, anon ? "○ " : "● "),
      h(Text, null, greeting),
      state.myHandle ? h(Text, { color: C.brand, bold: true }, state.myHandle) : null,
    ),
    anon
      ? h(Text, { dimColor: true }, "  Sign in by picking [F] when you want points to save.")
      : null,

    // Primary CTA — find a real opponent.
    h(Box, { marginTop: 1, flexDirection: "column" },
      h(Box, null,
        h(Key, { label: "F" }),
        h(Text, { color: C.brand, bold: true }, " Find a match"),
        anon ? h(Text, { dimColor: true }, "  (signs you in first)") : null,
      ),
      h(Text, { dimColor: true }, "  Brain Bet  ·  5 min  ·  100-pt ante  ·  bot fills after 30s if nobody pairs"),
    ),

    // Secondary CTA — instant bot.
    h(Box, { marginTop: 1, flexDirection: "column" },
      h(Box, null,
        h(Key, { label: "B", color: C.peer }),
        h(Text, { color: C.peer, bold: true }, " Play a bot now"),
        anon ? h(Text, { dimColor: true }, "  (no sign-in needed)") : null,
      ),
      h(Text, { dimColor: true }, "  Skip the wait — instant practice match. No points change hands."),
    ),
  );
}

function renderSearching(state) {
  const startedAt = state.poolWaiting?.startedAt;
  const elapsedSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const botFillIn = Math.max(0, 30 - elapsedSec);
  const botColor = botFillIn > 5 ? C.warning : C.brand;
  return h(Box, { flexDirection: "column" },
    h(Box, null,
      h(Text, { color: C.warning, bold: true }, "⌛ Searching the pool"),
      h(Text, { dimColor: true }, `  ${elapsedSec}s elapsed`),
    ),
    h(Box, { marginTop: 1 },
      h(Text, { dimColor: true }, "  Looking for the next idle player…"),
    ),
    h(Box, null,
      h(Text, { color: botColor }, "  🤖 "),
      h(Text, { dimColor: true },
        botFillIn > 0
          ? `Bot fills in ~${botFillIn}s if no human pairs.`
          : "Bot is joining any moment now…",
      ),
    ),
  );
}

function renderInMatch(state) {
  const { round, match, mySocketId, myHandle, myBet, myAnswer, numericInput, stockDir, resolved, betSecondsLeft } = state;
  if (!round || !match) {
    return h(Box, { flexDirection: "column" },
      h(Text, { color: C.warning }, "Match starting…"),
      h(Text, { dimColor: true }, "Loading round 1."),
    );
  }
  const peerSocketId = match.peerSocketId;
  const myChips = round.chipStacks?.[mySocketId] ?? 0;
  const peerChips = peerSocketId ? (round.chipStacks?.[peerSocketId] ?? 0) : 0;
  const isBotMatch = match.peerHandle?.startsWith("lounge-bot-");

  const roundProps = {
    payload: round.payload,
    phase: round.phase,
    myAnswer,
    numericInput,
    stockDir,
    myHandle: myHandle || "you",
    peerHandle: match.peerHandle,
  };
  const roundComponent =
    round.type === "indian_poker" ? h(IndianPokerRound, { ...roundProps, myDecision: myAnswer }) :
    round.type === "estimation" ? h(EstimationRound, roundProps) :
    round.type === "monty_mirage" ? h(MontyMirageRound, roundProps) :
    round.type === "chicken" ? h(ChickenRound, roundProps) :
    round.type === "big_o" ? h(BigORound, roundProps) :
    round.type === "geo_trivia" ? h(GeoTriviaRound, roundProps) :
    round.type === "stock_direction" ? h(StockDirectionRound, roundProps) :
    h(PlaceholderRound, { roundType: round.type, payload: round.payload, phase: round.phase });

  // Phase pill: "Round 3/5 · bet phase · 8s left  ·  bot match" — one
  // dimmed status row directly under the chip bar.
  const phaseLabel =
    round.phase === "bet" ? "bet phase" :
    round.phase === "answer" ? "answer phase" :
    round.phase === "reveal" ? "reveal" :
    round.phase || "";
  const phaseParts = [`Round ${round.round}/${round.total}`];
  if (phaseLabel) phaseParts.push(phaseLabel);
  if (round.phase === "bet" && betSecondsLeft != null) {
    const urgent = betSecondsLeft <= 3;
    phaseParts.push({
      text: `${betSecondsLeft}s left`,
      color: urgent ? C.danger : C.warning,
      bold: urgent,
    });
  }
  if (isBotMatch) phaseParts.push("bot match — no points change hands");

  return h(Box, { flexDirection: "column" },
    h(ChipBar, {
      myHandle: myHandle || "you",
      myChips,
      peerHandle: match.peerHandle,
      peerChips,
      pot: round.pot,
    }),
    h(Box, { marginTop: 1 },
      h(PhasePill, { parts: phaseParts }),
    ),

    roundComponent,

    round.phase === "bet"
      ? h(BetPhasePanel, { myStack: myChips, pot: round.pot, myBet, secondsLeft: betSecondsLeft })
      : null,

    resolved
      ? h(RevealCard, {
          resolved,
          mySocketId,
          peerSocketId,
          myHandle: myHandle || "you",
          peerHandle: match.peerHandle,
        })
      : null,

    h(ChatPanel, {
      messages: state.chatMessages,
      chatMode: state.chatMode,
      chatInput: state.chatInput,
      myHandle: myHandle || "you",
      peerHandle: match.peerHandle,
    }),
  );
}

// -------- helpers --------

function betKeyToChoice(input) {
  if (input === "c" || input === "C") return "check";
  if (input === "1") return "raise_25";
  if (input === "2") return "raise_50";
  if (input === "3") return "raise_100";
  if (input === "a" || input === "A") return "all_in";
  if (input === "f" || input === "F") return "fold";
  return null;
}

// Dispatches answer-phase keys for the active round type. Numeric
// rounds (estimation/monty/stock magnitude) build up a buffer in
// state.numericInput and submit on Enter. Multiple-choice rounds
// (big_o/geo) map digit keys to the choices array. Chicken maps
// 1–9 + 0 to picks 1–10. Indian Poker uses B/F.
function handleAnswerInput({ input, key, state, sock, dispatch }) {
  const t = state.round.type;
  const gameId = state.match.gameId;
  const emit = (action) => sock.emit("game_action", { gameId, action });
  const lockOptimistic = (value) => dispatch({ type: "ANSWER_LOCKED", value });

  if (t === "indian_poker") {
    let choice = null;
    if (input === "b" || input === "B") choice = "bet";
    else if (input === "f" || input === "F") choice = "fold";
    if (choice) {
      emit({ type: "indian_poker_decide", choice });
      lockOptimistic(choice);
    }
    return;
  }

  if (t === "chicken") {
    let value = null;
    if (input >= "1" && input <= "9") value = parseInt(input, 10);
    else if (input === "0") value = 10;
    if (value != null) {
      emit({ type: "chicken_pick", value });
      lockOptimistic(value);
    }
    return;
  }

  if (t === "big_o" || t === "geo_trivia") {
    const choices = state.round.payload?.choices || [];
    const idx = parseInt(input, 10) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < choices.length) {
      const choice = choices[idx];
      emit({
        type: t === "big_o" ? "big_o_lock" : "geo_trivia_lock",
        choice,
      });
      lockOptimistic(choice);
    }
    return;
  }

  if (t === "estimation" || t === "monty_mirage") {
    if (key.return) {
      if (state.numericInput.length > 0) {
        const value = parseFloat(state.numericInput);
        if (!Number.isNaN(value)) {
          emit({
            type: t === "estimation" ? "estimation_submit" : "monty_mirage_submit",
            value,
          });
          lockOptimistic(value);
        }
      }
    } else if (key.backspace || key.delete) {
      dispatch({ type: "SET_NUMERIC_INPUT", value: state.numericInput.slice(0, -1) });
    } else if (input >= "0" && input <= "9" && state.numericInput.length < 12) {
      dispatch({ type: "SET_NUMERIC_INPUT", value: state.numericInput + input });
    } else if (input === "." && !state.numericInput.includes(".") && state.numericInput.length < 12) {
      dispatch({ type: "SET_NUMERIC_INPUT", value: state.numericInput + input });
    }
    return;
  }

  if (t === "stock_direction") {
    if (state.stockDir == null) {
      if (input === "u" || input === "U") dispatch({ type: "SET_STOCK_DIR", dir: "up" });
      else if (input === "d" || input === "D") dispatch({ type: "SET_STOCK_DIR", dir: "down" });
      return;
    }
    if (key.return) {
      if (state.numericInput.length > 0) {
        const magnitude = parseFloat(state.numericInput);
        if (!Number.isNaN(magnitude)) {
          emit({
            type: "stock_direction_submit",
            direction: state.stockDir,
            magnitude,
          });
          lockOptimistic({ direction: state.stockDir, magnitude });
        }
      }
    } else if (key.backspace || key.delete) {
      if (state.numericInput.length > 0) {
        dispatch({ type: "SET_NUMERIC_INPUT", value: state.numericInput.slice(0, -1) });
      } else {
        // Empty buffer + backspace → return to direction picker.
        dispatch({ type: "SET_STOCK_DIR", dir: null });
      }
    } else if (input >= "0" && input <= "9" && state.numericInput.length < 6) {
      dispatch({ type: "SET_NUMERIC_INPUT", value: state.numericInput + input });
    } else if (input === "." && !state.numericInput.includes(".") && state.numericInput.length < 6) {
      dispatch({ type: "SET_NUMERIC_INPUT", value: state.numericInput + input });
    }
  }
}

function wireSocket(sock, dispatch, getState) {
  sock.on("connect", () => {
    dispatch({ type: "SOCKET_CONNECTED" });
    // Re-attach: if we were mid-match before the drop, re-request the
    // current round state so we sync up. Server already remaps our
    // socket via handleReconnect (matched by userId).
    const st = getState();
    if (st.appPhase === "in_match" && st.match?.gameId) {
      try { sock.emit("request_round_state", { gameId: st.match.gameId }); } catch {}
    }
  });
  sock.on("disconnect", () => dispatch({ type: "SOCKET_DISCONNECTED" }));
  sock.on("connect_error", (err) =>
    dispatch({ type: "ERROR", message: err?.message || "connect_error" }),
  );

  sock.on("game_reattached", (p) => {
    // Server confirms re-attach within the 10s grace window.
    if (p?.gameId) {
      try { sock.emit("request_round_state", { gameId: p.gameId }); } catch {}
    }
  });

  sock.on("welcome", (msg) => {
    if (msg?.handle && msg?.socketId) {
      dispatch({ type: "WELCOME", handle: msg.handle, socketId: msg.socketId });
    }
  });

  sock.on("error_message", (msg) => {
    dispatch({ type: "TOAST", message: msg?.message || "error" });
  });

  // Chat (5.1). Server emits chat_message to the OTHER side only;
  // own messages are rendered optimistically in CHAT_SEND.
  sock.on("chat_message", (p) => {
    if (p?.body) {
      dispatch({ type: "CHAT_RECEIVED", body: String(p.body), ts: p.ts });
    }
  });

  sock.on("pool_waiting", (p) => {
    dispatch({
      type: "POOL_WAITING",
      gameType: p.gameType,
      durationMin: p.durationMin,
      ante: p.ante,
    });
  });

  sock.on("game_started", (p) => {
    dispatch({
      type: "GAME_STARTED",
      gameId: p.gameId,
      roomId: p.roomId,
      peerHandle: p.peerHandle,
      durationMin: p.durationMin,
      ante: p.ante,
    });
    // Replay current state in case the server already emitted round_start
    // before we mounted the in-match scene (mount-race protection,
    // mirrors the browser's pattern).
    sock.emit("request_round_state", { gameId: p.gameId });
  });

  sock.on("game_state_update", (p) => {
    if (!p || typeof p.type !== "string") return;
    switch (p.type) {
      case "round_start":
        dispatch({ type: "ROUND_START", payload: p });
        break;
      case "phase_change":
        dispatch({
          type: "PHASE_CHANGE",
          phase: p.phase,
          pot: p.pot,
          chipStacks: p.chipStacks,
          endsAt: p.endsAt,
          betWindowMs: p.betWindowMs,
        });
        break;
      case "bet_recorded":
        dispatch({
          type: "BET_RECORDED",
          bet: p.bet,
          chipStack: p.chipStack,
          pot: p.pot,
        });
        break;
      case "bet_phase_closed":
        dispatch({
          type: "BET_PHASE_CLOSED",
          bets: p.bets,
          pot: p.pot,
          chipStacks: p.chipStacks,
        });
        break;
      case "decision_recorded":
        // Indian Poker server echo. Optimistic lock already set in
        // useInput; this is a confirmation no-op (still safe to set).
        dispatch({ type: "ANSWER_LOCKED", value: p.choice });
        break;
      case "submission_recorded":
        // Estimation / Monty Mirage server echo. The value is the user's
        // submitted number; for stock_direction it's { direction, magnitude }.
        dispatch({ type: "ANSWER_LOCKED", value: p.value });
        break;
      case "pick_recorded":
        // Chicken server echo.
        dispatch({ type: "ANSWER_LOCKED", value: p.value });
        break;
      case "lock_recorded":
        // Big-O / Geo Trivia server echo. Server sends `correct: boolean`
        // but not the choice itself — the optimistic local lock already
        // captured the user's choice, so we leave myAnswer alone.
        break;
      case "round_resolved":
        dispatch({ type: "ROUND_RESOLVED", payload: p });
        break;
      case "player_disconnected":
      case "player_reconnected":
        // Surface as a toast in 4e polish; not critical for 4c.
        break;
      default:
        // Unknown — ignore.
        break;
    }
  });

  sock.on("game_resolved", (p) => {
    dispatch({ type: "GAME_RESOLVED", payload: p });
  });

  sock.on("game_aborted", (p) => {
    dispatch({ type: "GAME_ABORTED", payload: p });
  });
}

function cleanExit(sock, exit) {
  if (sock) {
    try { sock.disconnect(); } catch {}
  }
  exit();
}

// Stage 10c — headless detection for terminal-OTP default. macOS / native
// Windows / WSL always have a graphical display (WSL routes through
// cmd.exe). On native Linux without $DISPLAY/$WAYLAND_DISPLAY, browser
// pair is impossible — we default the auth choice to "terminal" so users
// don't get stuck staring at "We opened this URL…" with no browser open.
function isHeadlessEnv() {
  const platform = process.platform;
  if (platform === "darwin" || platform === "win32") return false;
  const isWSL = Boolean(
    process.env.WSL_DISTRO_NAME ||
      process.env.WSLENV ||
      (process.env.WSL_INTEROP && process.env.WSL_INTEROP.length > 0),
  );
  if (isWSL) return false;
  if (process.env.BROWSER) return false;
  return !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
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
