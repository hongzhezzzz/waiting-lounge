"use client";

// Recent-activity ticker: last few game results and board posts so the
// lounge feels alive even at 0 idle players. Fed by the /api/lounge/stats
// endpoint (already polled by HomeStatusCards on the homepage).

type GameEvent = {
  kind: "game";
  ts: number;
  gameType: string;
  outcome: "win" | "tie";
  winnerHandle: string | null;
  loserHandle: string | null;
};
type PostEvent = {
  kind: "post";
  ts: number;
  handle: string;
  tag: string;
  snippet: string;
};
export type RecentEvent = GameEvent | PostEvent;

const GAME_LABELS: Record<string, string> = {
  brain_bet: "Brain Bet",
  spot_the_bug: "Spot the Bug",
};

function relTime(ts: number): string {
  const dt = Date.now() - ts;
  if (dt < 60_000) return "just now";
  if (dt < 3_600_000) return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h ago`;
  return `${Math.floor(dt / 86_400_000)}d ago`;
}

export function LoungeTicker({ events }: { events: RecentEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ul className="space-y-1.5 text-xs text-muted">
      {events.map((e, i) => (
        <li key={`${e.kind}-${e.ts}-${i}`} className="flex items-baseline gap-2">
          {e.kind === "game" ? (
            e.outcome === "tie" ? (
              <span>
                tie at {GAME_LABELS[e.gameType] ?? e.gameType}
              </span>
            ) : (
              <span>
                <span className="font-mono text-ink">{e.winnerHandle}</span>{" "}
                beat <span className="font-mono">{e.loserHandle}</span> at{" "}
                {GAME_LABELS[e.gameType] ?? e.gameType}
              </span>
            )
          ) : (
            <span>
              new post in <span className="text-ink">{e.tag}</span>
              {" — "}
              <span className="italic">{e.snippet}</span>
            </span>
          )}
          <span className="ml-auto whitespace-nowrap text-muted/70">{relTime(e.ts)}</span>
        </li>
      ))}
    </ul>
  );
}
