"use client";

import { useEffect, useState } from "react";

export type Snippet = {
  id: string;
  language: string;
  code: string[];
};

type Click = { line: number; correct: boolean };

export type SpotTheBugView = {
  round: number;
  total: number;
  snippet: Snippet;
  endsAt: number;
  scores: Record<string, number>;
  myHandle: string | null;
  peerHandle: string | null;
  // After resolve, server tells us the correct line.
  resolved?: {
    buggyLine: number;
    explanation: string;
    winnerSocketId: string | null;
    clicks: Record<string, number>;
    mySocketId: string | null;
  };
  // Has THIS browser locked in a click?
  myClick: number | null;
  onClickLine: (line: number) => void;
};

export function SpotTheBugRound(p: SpotTheBugView) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const remaining = Math.max(0, Math.ceil((p.endsAt - now) / 1000));

  const resolved = p.resolved;
  const buggyLine = resolved?.buggyLine ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">
          Round <span className="font-mono text-ink">{p.round}</span> / <span className="font-mono">{p.total}</span>
        </span>
        <span className="text-muted">
          {p.myHandle && (
            <>
              <span className="font-mono text-ink">{p.myHandle}</span>{" "}
              <span className="font-mono text-sage-deep">{p.scores[p.myHandle] ?? 0}</span>
            </>
          )}
          <span className="mx-2">·</span>
          {p.peerHandle && (
            <>
              <span className="font-mono text-ink">{p.peerHandle}</span>{" "}
              <span className="font-mono text-sage-deep">{p.scores[p.peerHandle] ?? 0}</span>
            </>
          )}
        </span>
        <span className="font-mono text-sm">
          {resolved ? <span className="text-muted">resolved</span> : <span className={remaining <= 5 ? "text-amber-700" : "text-ink"}>{remaining}s</span>}
        </span>
      </div>

      <div className="card p-4 overflow-hidden">
        <div className="text-xs text-muted mb-2 font-mono">{p.snippet.language}</div>
        <pre className="font-mono text-sm leading-7 select-none">
          {p.snippet.code.map((line, idx) => {
            const lineNum = idx + 1;
            const clicked = p.myClick === lineNum;
            const isCorrectLine = buggyLine === lineNum;
            const wasMyWrongClick = resolved && p.myClick === lineNum && !isCorrectLine;

            const base = "block px-3 py-1 rounded transition";
            const interactive = !resolved && p.myClick == null;
            const cls = [
              base,
              interactive ? "cursor-pointer hover:bg-sage-soft/50" : "cursor-default",
              clicked && !resolved ? "bg-sage-soft" : "",
              resolved && isCorrectLine ? "bg-sage-soft text-sage-deep" : "",
              wasMyWrongClick ? "bg-amber-100 text-amber-900" : "",
            ].join(" ");

            return (
              <code
                key={lineNum}
                onClick={() => interactive && p.onClickLine(lineNum)}
                className={cls}
              >
                <span className="text-muted mr-3 inline-block w-6 text-right">{lineNum}</span>
                {line || " "}
              </code>
            );
          })}
        </pre>
      </div>

      {!resolved && (
        <p className="text-xs text-muted">Click the line containing the bug. Wrong click = no second chance this round.</p>
      )}

      {resolved && (
        <div className="card p-4 space-y-1 text-sm">
          {resolved.winnerSocketId === null ? (
            <p className="font-medium text-muted">Round draw — neither found it.</p>
          ) : resolved.winnerSocketId === resolved.mySocketId ? (
            <p className="font-medium text-sage-deep">You spotted it.</p>
          ) : (
            <p className="font-medium text-amber-700">Opponent spotted it.</p>
          )}
          <p className="text-muted">
            Bug was on line <span className="font-mono text-ink">{resolved.buggyLine}</span>.
          </p>
          {resolved.explanation && <p className="text-muted italic">{resolved.explanation}</p>}
        </div>
      )}
    </div>
  );
}
