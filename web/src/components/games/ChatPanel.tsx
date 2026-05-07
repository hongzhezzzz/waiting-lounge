"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";

const MAX_LEN = 500;
const STORAGE_KEY = "wl.chatPanelOpen";

type Msg = { id: string; from: "me" | "peer"; body: string; ts: number };

export function ChatPanel({
  myHandle,
  peerHandle,
}: {
  myHandle: string | null;
  peerHandle: string | null;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // Hydrate panel-open state from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpen(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  // Persist on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    if (open) setUnread(0);
  }, [open]);

  // Listen for incoming chat events. Backend emits `chat_message` to the
  // other side only — our own messages are rendered optimistically on send.
  useEffect(() => {
    const socket = getSocket();
    function onPeer(p: { from: string; body: string; ts: number }) {
      setMessages((m) => [
        ...m,
        { id: cryptoRand(), from: "peer", body: p.body, ts: p.ts },
      ]);
      if (!openRef.current) setUnread((n) => n + 1);
    }
    socket.on("chat_message", onPeer);
    return () => {
      socket.off("chat_message", onPeer);
    };
  }, []);

  // Auto-scroll on new messages when open.
  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    if (body.length > MAX_LEN) return;
    getSocket().emit("chat_message", { body });
    setMessages((m) => [...m, { id: cryptoRand(), from: "me", body, ts: Date.now() }]);
    setDraft("");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 px-4 py-2 rounded-full border border-line bg-surface shadow hover:border-sage hover:bg-sage-soft transition flex items-center gap-2 text-sm"
        aria-label="Open chat"
      >
        <span>💬 Chat</span>
        {unread > 0 && (
          <span className="bg-sage-deep text-white text-xs px-1.5 rounded-full font-mono">{unread}</span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-30 w-80 max-h-[24rem] flex flex-col card overflow-hidden shadow-lg">
      <div className="flex items-center justify-between border-b border-line px-3 py-2 bg-bg/80 backdrop-blur">
        <span className="text-xs text-muted uppercase tracking-wider">
          Chat {peerHandle && <span className="font-mono normal-case ml-1 text-ink">vs {peerHandle}</span>}
        </span>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-ink" aria-label="Close chat">×</button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1 text-sm">
        {messages.length === 0 && (
          <p className="text-muted text-xs italic text-center py-2">
            No messages yet. Type below — peer can see your handle, not your real name.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.from === "me" ? "text-right" : "text-left"}>
            <span
              className={`inline-block px-2 py-1 rounded ${
                m.from === "me" ? "bg-sage-soft text-sage-deep" : "bg-line/40 text-ink"
              }`}
            >
              <span className="font-mono text-xs text-muted mr-1">
                {m.from === "me" ? myHandle ?? "you" : peerHandle ?? "peer"}:
              </span>
              {m.body}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={MAX_LEN}
          placeholder="Type…"
          className="flex-1 text-sm px-2 py-1 border border-line rounded bg-surface focus:outline-none focus:border-sage"
        />
        <button
          onClick={send}
          disabled={draft.trim().length === 0}
          className="text-sm px-3 py-1 rounded bg-sage-deep text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function cryptoRand(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
