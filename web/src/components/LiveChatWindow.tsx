"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSocket } from "@/lib/socket";
import { STARTER_PROMPTS } from "@/lib/fakeData";
import { ReportBlockControls } from "./ReportBlockControls";

type Message = {
  id: string;
  from: "me" | "peer" | "system";
  body: string;
  ts: number;
};

type Phase = "connecting" | "waiting" | "matched" | "peer_left" | "error";

function timeShort(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function LiveChatWindow({ tag }: { tag: string }) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [myHandle, setMyHandle] = useState<string>("");
  const [peerHandle, setPeerHandle] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const joinedRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();

    function tryJoin() {
      if (joinedRef.current) return;
      joinedRef.current = true;
      setPhase("waiting");
      socket.emit("join_queue", { tag });
    }

    function onWelcome(p: { handle: string }) {
      setMyHandle(p.handle);
      tryJoin();
    }
    function onWaiting() {
      setPhase("waiting");
    }
    function onMatched(p: { roomId: string; peerHandle: string }) {
      setPeerHandle(p.peerHandle);
      setPhase("matched");
      setMessages([
        {
          id: "system-match",
          from: "system",
          body:
            "Matched with another waiting builder. This chat disappears when either person leaves. Do not share secrets, code, credentials, or private project details.",
          ts: Date.now(),
        },
      ]);
    }
    function onChatMessage(p: { from: string; body: string; ts: number }) {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), from: "peer", body: p.body, ts: p.ts },
      ]);
    }
    function onPeerLeft() {
      setPhase("peer_left");
      setMessages((m) => [
        ...m,
        {
          id: "system-peer-left",
          from: "system",
          body: "Your peer left.",
          ts: Date.now(),
        },
      ]);
    }
    function onErrorMessage(p: { message: string }) {
      setErrMsg(p.message);
    }

    socket.on("welcome", onWelcome);
    socket.on("waiting", onWaiting);
    socket.on("matched", onMatched);
    socket.on("chat_message", onChatMessage);
    socket.on("peer_left", onPeerLeft);
    socket.on("error_message", onErrorMessage);

    if (socket.connected) {
      // Already connected before we mounted: server already sent welcome.
      // But if we never got it, force a join attempt anyway.
      tryJoin();
    }

    return () => {
      socket.off("welcome", onWelcome);
      socket.off("waiting", onWaiting);
      socket.off("matched", onMatched);
      socket.off("chat_message", onChatMessage);
      socket.off("peer_left", onPeerLeft);
      socket.off("error_message", onErrorMessage);
      socket.emit("leave_room");
      socket.emit("leave_queue");
    };
  }, [tag]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function send(body: string) {
    if (!body.trim()) return;
    const socket = getSocket();
    socket.emit("chat_message", { body });
    setMessages((m) => [...m, { id: crypto.randomUUID(), from: "me", body, ts: Date.now() }]);
    setDraft("");
  }

  // ----- render branches -----

  if (phase === "connecting" || phase === "waiting") {
    return (
      <div className="card p-10 text-center space-y-3">
        <div className="text-4xl">◖</div>
        <div className="text-ink font-medium">
          {phase === "connecting" ? "Connecting…" : `Waiting for someone in ${tag}…`}
        </div>
        <div className="text-sm text-muted">
          {myHandle && (
            <>
              You are <span className="font-mono text-ink">{myHandle}</span>.{" "}
            </>
          )}
          Open a second browser window on the same tag to match yourself.
        </div>
        <div className="pt-3">
          <Link href="/board" className="btn-secondary text-sm py-2">
            Browse the board while you wait
          </Link>
        </div>
        {errMsg && <div className="text-sm text-amber pt-2">{errMsg}</div>}
      </div>
    );
  }

  if (phase === "peer_left") {
    return (
      <div className="card p-10 text-center space-y-4">
        <div className="text-ink font-medium">Your peer left.</div>
        <div className="text-sm text-muted">
          Conversations don&apos;t persist. That&apos;s the deal.
        </div>
        <div className="flex gap-2 justify-center pt-2">
          <Link href={`/chat?tag=${encodeURIComponent(tag)}`} className="btn-primary">
            Find a new match
          </Link>
          <Link href="/board" className="btn-secondary">
            Go to board
          </Link>
        </div>
      </div>
    );
  }

  // phase === "matched"
  return (
    <div className="card flex flex-col h-[70vh]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sage-soft text-sage-deep flex items-center justify-center font-mono text-xs">
            {peerHandle.slice(0, 2)}
          </div>
          <div>
            <div className="text-sm font-medium text-ink">{peerHandle}</div>
            <div className="text-xs text-muted">
              Matched on {tag} · this chat disappears when either of you leaves
            </div>
          </div>
        </div>
        <ReportBlockControls />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((m) => {
          if (m.from === "system") {
            return (
              <div key={m.id} className="text-xs text-muted text-center max-w-md mx-auto py-2">
                {m.body}
              </div>
            );
          }
          const mine = m.from === "me";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                  mine ? "bg-sage text-white" : "bg-bg border border-line text-ink"
                }`}
              >
                <div>{m.body}</div>
                <div className={`text-[10px] mt-1 ${mine ? "text-sage-soft" : "text-muted"}`}>
                  {timeShort(m.ts)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line px-5 py-3">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {STARTER_PROMPTS.slice(0, 3).map((s) => (
            <button
              key={s}
              onClick={() => setDraft(s)}
              type="button"
              className="text-xs text-muted hover:text-sage-deep underline-offset-2 hover:underline"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say something vague about your wait…"
            className="flex-1 rounded-2xl border border-line bg-bg px-4 py-2 text-sm focus:outline-none focus:border-sage"
            maxLength={500}
          />
          <button type="submit" className="btn-primary text-sm py-2">
            Send
          </button>
        </form>
        {errMsg && <div className="text-xs text-amber mt-2">{errMsg}</div>}
      </div>
    </div>
  );
}
