"use client";

import { useEffect, useRef, useState } from "react";
import { FAKE_CHAT, FAKE_HANDLES, STARTER_PROMPTS, type FakeMessage } from "@/lib/fakeData";
import { ReportBlockControls } from "./ReportBlockControls";

function timeShort(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatWindow({ peerHandle = FAKE_HANDLES[0] }: { peerHandle?: string }) {
  const [messages, setMessages] = useState<FakeMessage[]>(FAKE_CHAT);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function send(body: string) {
    if (!body.trim()) return;
    setMessages((m) => [...m, { id: crypto.randomUUID(), from: "me", body, ts: Date.now() }]);
    setDraft("");
    // Fake a peer reply on the demo path
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          from: "peer",
          body: "(demo) — totally feel that. mine just renamed three things for no reason.",
          ts: Date.now(),
        },
      ]);
    }, 1200);
  }

  return (
    <div className="card flex flex-col h-[70vh]">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sage-soft text-sage-deep flex items-center justify-center font-mono text-xs">
            {peerHandle.slice(0, 2)}
          </div>
          <div>
            <div className="text-sm font-medium text-ink">{peerHandle}</div>
            <div className="text-xs text-muted">Matched · this chat disappears when either of you leaves</div>
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
      </div>
    </div>
  );
}
