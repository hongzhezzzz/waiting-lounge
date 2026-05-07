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
};

export const users = new Map<SocketId, UserInfo>();
export const queues = new Map<string, SocketId[]>();
export const rooms = new Map<RoomId, Room>();
export const deviceSockets = new Map<DeviceId, Set<SocketId>>();
export const deviceLastStatus = new Map<DeviceId, LastAgentStatus>();
export const games = new Map<GameId, Game>();
// Quick lookup: roomId -> gameId, for the disconnect/leave flow.
export const roomGame = new Map<RoomId, GameId>();

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
}

export function getLastStatus(deviceId: DeviceId): LastAgentStatus | undefined {
  return deviceLastStatus.get(deviceId);
}
