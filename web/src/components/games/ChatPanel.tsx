"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { getSocket } from "@/lib/socket";

const MAX_LEN = 500;
const STORAGE_KEY = "wl.chatPanelOpen";

type Msg = { id: string; from: "me" | "peer"; body: string; ts: number };

// In-game chat panel. Renders inline (not floating), default expanded
// so users notice it without hunting for a corner button. Collapsible
// to a thin strip when the user wants more vertical room for the game
// content.
export function ChatPanel({
  myHandle,
  peerHandle,
}: {
  myHandle: string | null;
  peerHandle: string | null;
}) {
  const [open, setOpen] = useState<boolean>(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // Hydrate panel-open state from localStorage on mount. Default to
  // open if no preference stored (new behavior — was default-closed
  // previously, but users weren't noticing the floating button).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "0") setOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    if (open) setUnread(0);
  }, [open]);

  // Backend emits chat_message to the OTHER side only; our own messages
  // are rendered optimistically on send.
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

  return (
    <div className="mt-6 card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 border-b border-line bg-bg/50 hover:bg-bg transition"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm">
          <MessageCircle className="w-4 h-4 text-sage-deep" />
          <span className="font-medium text-ink">Chat</span>
          {peerHandle && (
            <span className="font-mono text-xs text-muted">vs {peerHandle}</span>
          )}
          {!open && unread > 0 && (
            <span className="ml-1 bg-sage-deep text-white text-xs px-1.5 rounded-full font-mono">
              {unread}
            </span>
          )}
        </span>
        <span className="text-muted">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <>
          <div ref={scrollRef} className="px-4 py-2 max-h-48 overflow-y-auto space-y-1 text-sm">
            {messages.length === 0 ? (
              <p className="text-muted text-xs italic text-center py-3">
                No messages yet. Type below — opponent sees only your handle, not your real name.
              </p>
            ) : (
              messages.map((m) => (
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
              ))
            )}
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
              placeholder="Type a message…"
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
        </>
      )}
    </div>
  );
}

function cryptoRand(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
