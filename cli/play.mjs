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
import { EstimationRound } from "./components/rounds/Estimation.mjs";
import { MontyMirageRound } from "./components/rounds/MontyMirage.mjs";
import { ChickenRound } from "./components/rounds/Chicken.mjs";
import { BigORound } from "./components/rounds/BigO.mjs";
import { GeoTriviaRound } from "./components/rounds/GeoTrivia.mjs";
import { StockDirectionRound } from "./components/rounds/StockDirection.mjs";

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
  myAnswer: null,        // user's answer-phase lock (varies by round type)
  numericInput: "",      // in-progress text for numeric rounds (estimation/monty/stock magnitude)
  stockDir: null,        // sub-state for stock_direction: "up"|"down"|null
  resolved: null,        // last round_resolved payload

  end: null,             // game_resolved payload
  betSecondsLeft: null,

  // 4e: confirm dialog (currently only "forfeit") + reconnect banner.
  confirmDialog: null,   // null | "forfeit"
  reconnecting: false,   // socket dropped while in_match; waiting for re-attach
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
      };
    case "BET_TICK":
      return { ...state, betSecondsLeft: state.betSecondsLeft != null ? Math.max(0, state.betSecondsLeft - 1) : null };
    case "SHOW_CONFIRM":
      return { ...state, confirmDialog: action.dialogType };
    case "HIDE_CONFIRM":
      return { ...state, confirmDialog: null };
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

    state.reconnecting ? h(Box, {
      marginTop: 1,
      borderStyle: "round",
      borderColor: "yellow",
      paddingX: 1,
    },
      h(Text, { color: "yellow", bold: true }, "⟳ Reconnecting…"),
      h(Text, { dimColor: true }, "  Server has 10s grace; we'll re-sync the round automatically."),
    ) : null,

    state.confirmDialog === "forfeit" ? h(Box, {
      marginTop: 1,
      borderStyle: "double",
      borderColor: "red",
      paddingX: 2,
      paddingY: 0,
      flexDirection: "column",
    },
      h(Text, { color: "red", bold: true }, "Forfeit match?"),
      h(Text, null, "Press Y to forfeit (you'll lose this match), N to keep playing."),
      h(Text, { dimColor: true }, "  [Y] forfeit    [N] cancel"),
    ) : null,

    state.toast ? h(Box, { marginTop: 1 },
      h(Text, { color: "yellow" }, state.toast),
    ) : null,

    h(Box, { marginTop: 1 },
      h(Text, { dimColor: true }, hint(state)),
    ),
  );
}

function hint(state) {
  if (state.confirmDialog) return "[Y] confirm  [N] cancel";
  if (state.reconnecting) return "Reconnecting…  (Q to give up)";
  switch (state.appPhase) {
    case "lobby": return "Press F to find a match. Q to quit.";
    case "searching": return "Press X to cancel queue. Q to quit.";
    case "in_match":
      if (state.round?.phase === "bet" && !state.myBet) return "Pick a bet: C/1/2/3/A/F. Q to quit.";
      if (state.round?.phase === "answer" && !state.myAnswer) return answerHint(state);
      return "Q to quit (forfeits).";
    case "match_end": return "Press any key to return to lobby. Q to quit.";
    case "error": return "Press Q to quit.";
    default: return "Press Q to quit.";
  }
}

function answerHint(state) {
  const t = state.round?.type;
  if (t === "indian_poker") return "B = bet, F = fold. Q to quit.";
  if (t === "chicken") return "Pick 1–9 or 0 (=10). Q to quit.";
  if (t === "big_o" || t === "geo_trivia") return "Press 1–N to pick a choice. Q to quit.";
  if (t === "estimation" || t === "monty_mirage") return "Type a number, Enter to submit. Backspace to edit. Q to quit.";
  if (t === "stock_direction") {
    return state.stockDir == null
      ? "U = up, D = down. Q to quit."
      : "Type magnitude % then Enter. Backspace to change direction. Q to quit.";
  }
  return "Q to quit (forfeits).";
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
  const { round, match, mySocketId, myHandle, myBet, myAnswer, numericInput, stockDir, resolved, betSecondsLeft } = state;
  if (!round || !match) {
    return h(Text, null, "Waiting for round…");
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
