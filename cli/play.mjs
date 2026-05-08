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

import { render, Box, Text, useApp, useInput } from "ink";
import { createElement as h, useEffect, useReducer, useRef } from "react";
import { io } from "socket.io-client";
import config from "./lib/config.js";
import auth from "./lib/auth.js";
import { ChipBar } from "./components/ChipBar.mjs";
import { BetPhasePanel } from "./components/BetPhasePanel.mjs";
import { RevealCard } from "./components/RevealCard.mjs";
import { MatchEndScreen } from "./components/MatchEndScreen.mjs";
import { IndianPokerRound } from "./components/rounds/IndianPoker.mjs";
import { PlaceholderRound } from "./components/rounds/Placeholder.mjs";

const initialState = {
  appPhase: "auth",      // auth|pairing|connecting|lobby|searching|in_match|match_end|error
  email: null,
  myHandle: null,
  mySocketId: null,
  pairUrl: null,
  codeTail: null,
  error: null,
  toast: null,

  poolWaiting: null,     // { gameType, durationMin, ante, startedAt }

  match: null,           // { gameId, roomId, peerHandle, peerSocketId, durationMin, ante }
  round: null,           // { round, total, type, payload, phase, pot, chipStacks, endsAt }
  myBet: null,           // { type, raise, chipStack } (private)
  betsClosed: null,      // { bets, pot, chipStacks }
  myDecision: null,      // for indian_poker answer phase
  resolved: null,        // last round_resolved payload

  end: null,             // game_resolved payload
  betSecondsLeft: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "AUTH_PAIRING":
      return { ...state, appPhase: "pairing", pairUrl: action.url, codeTail: action.codeTail };
    case "AUTH_CONNECTING":
      return { ...state, appPhase: "connecting", email: action.email };
    case "AUTH_ERROR":
      return { ...state, appPhase: "error", error: action.error };
    case "SOCKET_CONNECTED":
      return { ...state, appPhase: state.appPhase === "in_match" || state.appPhase === "searching" ? state.appPhase : "lobby" };
    case "SOCKET_DISCONNECTED":
      return { ...state, toast: "Disconnected. Reconnecting…" };
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
        myDecision: null,
        resolved: null,
        end: null,
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
        myDecision: null,
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
    case "DECISION_RECORDED":
      return { ...state, myDecision: action.choice };
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
        myDecision: null,
        resolved: null,
        end: null,
      };
    case "BET_TICK":
      return { ...state, betSecondsLeft: state.betSecondsLeft != null ? Math.max(0, state.betSecondsLeft - 1) : null };
    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const sockRef = useRef(null);
  const tokenRef = useRef(null);
  const { exit } = useApp();

  // -------- input --------
  useInput((input, key) => {
    if (input === "q" || input === "Q" || key.escape) {
      cleanExit(sockRef.current, exit);
      return;
    }
    if (state.appPhase === "lobby") {
      if (input === "f" || input === "F") {
        if (sockRef.current) {
          sockRef.current.emit("queue_for_pool", { gameType: "brain_bet" });
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
    // Indian Poker answer phase: B or F.
    if (state.round.phase === "answer" && state.round.type === "indian_poker" && !state.myDecision) {
      let choice = null;
      if (input === "b" || input === "B") choice = "bet";
      else if (input === "f" || input === "F") choice = "fold";
      if (choice) {
        sockRef.current.emit("game_action", {
          gameId: state.match.gameId,
          action: { type: "indian_poker_decide", choice },
        });
      }
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

  // -------- auth + socket setup --------
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const token = await auth.getAccessToken({
          onPairing: ({ url, codeTail }) => {
            if (cancelled) return;
            dispatch({ type: "AUTH_PAIRING", url, codeTail });
          },
        });
        if (cancelled) return;
        tokenRef.current = token;
        const email = extractEmailFromJwt(token);
        dispatch({ type: "AUTH_CONNECTING", email });

        const backendUrl = config.readBackendUrl();
        const sock = io(backendUrl, {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 10,
          auth: { token },
        });
        sockRef.current = sock;
        wireSocket(sock, dispatch);
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

  // -------- render --------
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
      renderScene(state),
    ),

    state.toast ? h(Box, { marginTop: 1 },
      h(Text, { color: "yellow" }, state.toast),
    ) : null,

    h(Box, { marginTop: 1 },
      h(Text, { dimColor: true }, hint(state)),
    ),
  );
}

function hint(state) {
  switch (state.appPhase) {
    case "lobby": return "Press F to find a match. Q to quit.";
    case "searching": return "Press X to cancel queue. Q to quit.";
    case "in_match":
      if (state.round?.phase === "bet" && !state.myBet) return "Pick a bet: C/1/2/3/A/F. Q to quit.";
      if (state.round?.phase === "answer" && state.round.type === "indian_poker" && !state.myDecision) return "B = bet, F = fold. Q to quit.";
      return "Q to quit (forfeits).";
    case "match_end": return "Press any key to return to lobby. Q to quit.";
    case "error": return "Press Q to quit.";
    default: return "Press Q to quit.";
  }
}

function renderScene(state) {
  switch (state.appPhase) {
    case "auth":
      return h(Text, { color: "yellow" }, "Reading saved credentials…");
    case "pairing":
      return h(Box, { flexDirection: "column" },
        h(Text, { bold: true, color: "cyan" }, "Authorize this terminal in your browser."),
        h(Text, null, " "),
        h(Text, null, "We opened this URL for you (or copy/paste it):"),
        h(Text, { color: "blue" }, `  ${state.pairUrl}`),
        h(Text, null, " "),
        h(Text, { dimColor: true }, `Confirm the code shown there ends with: ${state.codeTail}`),
        h(Text, null, " "),
        h(Text, { color: "yellow" }, "Waiting for you to click Authorize…"),
      );
    case "connecting":
      return h(Box, { flexDirection: "column" },
        h(Text, { color: "yellow" }, "Connecting to the lounge…"),
        state.email ? h(Text, { dimColor: true }, `as ${state.email}`) : null,
      );
    case "lobby":
      return h(Box, { flexDirection: "column" },
        h(Text, { color: "green" },
          state.myHandle && state.email ? `Authenticated as ${state.email} · handle ${state.myHandle}` :
          state.email ? `Authenticated as ${state.email}` :
          "Connected.",
        ),
        h(Box, { marginTop: 1 },
          h(Text, { color: "cyan", bold: true }, "[F] Find a match"),
          h(Text, null, "    "),
          h(Text, { dimColor: true }, "Brain Bet · 5 min · 100-pt ante"),
        ),
        h(Box, { marginTop: 1 },
          h(Text, { dimColor: true }, "If no human pairs within 30s, a labeled `lounge-bot-NNN` joins."),
        ),
      );
    case "searching":
      return h(Box, { flexDirection: "column" },
        h(Text, { color: "yellow" }, "Searching the pool…"),
        state.poolWaiting ? renderSearchTimer(state.poolWaiting) : null,
      );
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
        h(Text, { color: "red" }, `Error: ${state.error}`),
        h(Text, { dimColor: true }, "Press Q to quit, then re-run `waiting-lounge play`."),
      );
    default:
      return h(Text, null, state.appPhase);
  }
}

function renderSearchTimer({ startedAt }) {
  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
  const botFillIn = Math.max(0, 30 - elapsedSec);
  return h(Box, { flexDirection: "column", marginTop: 1 },
    h(Text, { dimColor: true }, `${elapsedSec}s elapsed`),
    h(Text, { dimColor: true }, botFillIn > 0 ? `Bot fills in ~${botFillIn}s if no human pairs.` : "Bot should be joining any moment…"),
  );
}

function renderInMatch(state) {
  const { round, match, mySocketId, myHandle, myBet, myDecision, resolved, betSecondsLeft } = state;
  if (!round || !match) {
    return h(Text, null, "Waiting for round…");
  }
  const peerSocketId = match.peerSocketId;
  const myChips = round.chipStacks?.[mySocketId] ?? 0;
  const peerChips = peerSocketId ? (round.chipStacks?.[peerSocketId] ?? 0) : 0;
  const isBotMatch = match.peerHandle?.startsWith("lounge-bot-");

  return h(Box, { flexDirection: "column" },
    h(ChipBar, {
      myHandle: myHandle || "you",
      myChips,
      peerHandle: match.peerHandle,
      peerChips,
      pot: round.pot,
    }),
    h(Box, { marginTop: 1 },
      h(Text, { dimColor: true },
        `Round ${round.round} of ${round.total}`,
        isBotMatch ? "  ·  bot match (no points change hands)" : "",
      ),
    ),

    round.type === "indian_poker"
      ? h(IndianPokerRound, {
          payload: round.payload,
          phase: round.phase,
          myDecision,
          myHandle: myHandle || "you",
          peerHandle: match.peerHandle,
        })
      : h(PlaceholderRound, {
          roundType: round.type,
          payload: round.payload,
          phase: round.phase,
        }),

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

function wireSocket(sock, dispatch) {
  sock.on("connect", () => dispatch({ type: "SOCKET_CONNECTED" }));
  sock.on("disconnect", () => dispatch({ type: "SOCKET_DISCONNECTED" }));
  sock.on("connect_error", (err) =>
    dispatch({ type: "ERROR", message: err?.message || "connect_error" }),
  );

  sock.on("welcome", (msg) => {
    if (msg?.handle && msg?.socketId) {
      dispatch({ type: "WELCOME", handle: msg.handle, socketId: msg.socketId });
    }
  });

  sock.on("error_message", (msg) => {
    dispatch({ type: "TOAST", message: msg?.message || "error" });
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
        dispatch({ type: "DECISION_RECORDED", choice: p.choice });
        break;
      case "submission_recorded":
      case "pick_recorded":
      case "lock_recorded":
        // 4d will handle these when answer-input renderers land. For now,
        // these events are private echoes we don't need to react to.
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
