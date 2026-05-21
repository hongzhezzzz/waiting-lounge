// In-memory state for ephemeral things (queues, rooms, device-socket map).
// Board posts moved to Postgres in Phase 6. Chat is intentionally
// session-only and never written to durable storage.
//
// Phase 11: live games are in-memory; antes are persisted to pending_refunds
// at game start so a cold-start refund can recover them.

export type SocketId = string;
export type RoomId = string;
export type DeviceId = string;
export type UserId = string;
export type GameId = string;

export type UserInfo = {
  socketId: SocketId;
  handle: string;
  tag: string | null;
  roomId: RoomId | null;
  deviceId: DeviceId | null;
  userId: UserId | null;
  email: string | null;
  blocked: Set<string>;
};

export type Room = {
  id: RoomId;
  tag: string;
  members: SocketId[];
  createdAt: number;
};

export type LastAgentStatus = {
  status: string;
  client: string;
  timestamp: number;
};

export type GameType = "spot_the_bug" | "brain_bet";
export type GameDuration = 1 | 5 | 10;

export type GamePlayer = {
  socketId: SocketId;
  userId: UserId;
  handle: string;
  score: number;
  disconnectedAt: number | null;
};

export type Game = {
  id: GameId;
  type: GameType;
  roomId: RoomId;
  players: GamePlayer[];
  pot: number;
  ante: number;
  durationMin: GameDuration;
  startedAt: number;
  endsAt: number;
  state: unknown; // type-specific (spot-the-bug round state, etc.)
  pendingRefundIds: string[]; // pending_refund row ids — cleared on settle
  resolved: boolean;
  // Bot fill (3b.3): when set, one of the players is a calibrated
  // backend-side bot. Bot games skip the chargeAntes/settleGame
  // pipeline entirely so no platform points move and the bot doesn't
  // pollute the leaderboard.
  isBotMatch?: boolean;
  botSocketId?: SocketId;
};

export const users = new Map<SocketId, UserInfo>();
export const queues = new Map<string, SocketId[]>();
export const rooms = new Map<RoomId, Room>();
export const deviceSockets = new Map<DeviceId, Set<SocketId>>();
// Hot in-memory cache of last status per device. Persisted to Postgres
// (device_last_status table) so a Render cold-start doesn't blank the
// badge — see setLastStatus / getLastStatus below.
export const deviceLastStatus = new Map<DeviceId, LastAgentStatus>();
export const games = new Map<GameId, Game>();
// Quick lookup: roomId -> gameId, for the disconnect/leave flow.
export const roomGame = new Map<RoomId, GameId>();

// Pending invites (Phase 14d). Each entry expires automatically after
// INVITE_TTL_MS (see sockets.ts). Cleared on accept/decline/expire/
// disconnect. In-memory by design — a 30 s lifetime survives Render
// cold-starts implicitly (a sleep wipes them and that's correct: the
// inviter and invitee can both retry from a fresh /lounge poll).
export type Invite = {
  id: string;
  inviterSocketId: SocketId;
  inviterUserId: UserId;
  inviterHandle: string;
  targetSocketId: SocketId;
  targetUserId: UserId;
  targetHandle: string;
  gameType: string;
  durationMin: GameDuration;
  ante: number;
  createdAt: number;
  expiryTimer: NodeJS.Timeout | null;
};
export const invites = new Map<string, Invite>();

// Stage 12b — hosted rooms.
//
// A HostedRoom is a not-yet-started game that one player has opened with
// chosen settings. Another player can join it by code, by browsing the
// public list, or — if visibility is "public" — by being matched into it
// via random pool (Stage 12c). Once both sides accept the match_preview,
// the room is consumed: the hosted entry is deleted and a Game is created
// via startGameBetween. If the host cancels or the room times out, the
// entry is removed and no game starts.
//
// In-memory only. A Render cold-start wipes all open rooms; that is
// correct — hosts will simply re-open.
export type RoomVisibility = "public" | "private";
export type HostedRoomCode = string; // 6 chars, no-ambiguity alphabet.

export type HostedRoom = {
  code: HostedRoomCode;
  hostSocketId: SocketId;
  hostUserId: UserId;
  hostHandle: string;
  gameType: GameType;
  durationMin: GameDuration;
  ante: number;
  visibility: RoomVisibility;
  createdAt: number;
  // Auto-cancel timer (10 min idle TTL).
  ttlTimer: NodeJS.Timeout | null;
  // When a joiner has been paired with this room, the room enters
  // "preview" — locked while we await both accepts. Stored as the
  // pending match preview id; null when the room is open and free.
  pendingPreviewId: string | null;
};
export const hostedRooms = new Map<HostedRoomCode, HostedRoom>();

// Stage 12b — match previews.
//
// Every pairing — random-pool match, code-join, browse-join, hosted-match
// — runs through a 15s preview window before chargeAntes/startGameBetween.
// Either side declining (or timing out) returns both players to lobby.
// If the joiner came in via a hosted room, declining re-opens the room.
export type MatchPreviewSource = "pool" | "hosted_room" | "invite";
export type MatchPreview = {
  id: string;
  aSocketId: SocketId;
  aUserId: UserId;
  aHandle: string;
  aAccepted: boolean;
  bSocketId: SocketId;
  bUserId: UserId;
  bHandle: string;
  bAccepted: boolean;
  gameType: GameType;
  durationMin: GameDuration;
  ante: number;
  source: MatchPreviewSource;
  // For hosted_room: the room's code, so we can re-open it on decline.
  hostedRoomCode: HostedRoomCode | null;
  createdAt: number;
  expiresAt: number;
  expiryTimer: NodeJS.Timeout | null;
};
export const matchPreviews = new Map<string, MatchPreview>();

export function getQueue(tag: string): SocketId[] {
  let q = queues.get(tag);
  if (!q) {
    q = [];
    queues.set(tag, q);
  }
  return q;
}

export function removeFromQueue(tag: string, socketId: SocketId) {
  const q = queues.get(tag);
  if (!q) return;
  const i = q.indexOf(socketId);
  if (i >= 0) q.splice(i, 1);
  if (q.length === 0) queues.delete(tag);
}

export function removeFromAllQueues(socketId: SocketId) {
  for (const tag of Array.from(queues.keys())) {
    removeFromQueue(tag, socketId);
  }
}

export function registerDeviceSocket(deviceId: DeviceId, socketId: SocketId) {
  let set = deviceSockets.get(deviceId);
  if (!set) {
    set = new Set();
    deviceSockets.set(deviceId, set);
  }
  set.add(socketId);
}

export function unregisterDeviceSocket(socketId: SocketId) {
  for (const [deviceId, set] of deviceSockets) {
    if (set.delete(socketId) && set.size === 0) {
      deviceSockets.delete(deviceId);
    }
  }
}

export function getSocketsForDevice(deviceId: DeviceId): SocketId[] {
  const set = deviceSockets.get(deviceId);
  if (!set) return [];
  return Array.from(set);
}

export function setLastStatus(deviceId: DeviceId, status: LastAgentStatus) {
  deviceLastStatus.set(deviceId, status);
  // Best-effort persist; never block the caller. Even if the DB write fails
  // the in-memory cache still serves until the dyno sleeps.
  void persistLastStatus(deviceId, status).catch((err) => {
    console.error("[device_last_status] persist failed", (err as Error).message);
  });
}

async function persistLastStatus(deviceId: DeviceId, status: LastAgentStatus) {
  // Lazy import to avoid a circular at module-load time.
  const { query } = await import("./db/index.js");
  await query(
    `insert into device_last_status (device_id, status, client, ts_ms)
     values ($1, $2, $3, $4)
     on conflict (device_id) do update set
       status = excluded.status,
       client = excluded.client,
       ts_ms = excluded.ts_ms,
       updated_at = now()`,
    [deviceId, status.status, status.client, status.timestamp],
  );
}

// Returns the last status for a device. Memory first; falls back to Postgres
// if the in-memory cache is empty (e.g. after a Render cold-start).
export async function getLastStatus(deviceId: DeviceId): Promise<LastAgentStatus | undefined> {
  const cached = deviceLastStatus.get(deviceId);
  if (cached) return cached;
  try {
    const { query } = await import("./db/index.js");
    const r = await query<{ status: string; client: string; ts_ms: string }>(
      `select status, client, ts_ms from device_last_status where device_id = $1`,
      [deviceId],
    );
    if (!r.rows[0]) return undefined;
    const restored: LastAgentStatus = {
      status: r.rows[0].status,
      client: r.rows[0].client,
      timestamp: Number(r.rows[0].ts_ms),
    };
    deviceLastStatus.set(deviceId, restored);
    return restored;
  } catch (err) {
    console.error("[device_last_status] lookup failed", (err as Error).message);
    return undefined;
  }
}
