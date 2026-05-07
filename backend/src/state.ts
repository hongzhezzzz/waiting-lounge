// In-memory state. Replaced with Postgres + Redis in Phase 6.

export type SocketId = string;
export type RoomId = string;
export type PostId = string;
export type DeviceId = string;

export type UserInfo = {
  socketId: SocketId;
  handle: string;
  tag: string | null;
  roomId: RoomId | null;
  deviceId: DeviceId | null;
  blocked: Set<string>;
};

export type Room = {
  id: RoomId;
  tag: string;
  members: SocketId[];
  createdAt: number;
};

export type BoardPost = {
  id: PostId;
  handle: string;
  tag: string;
  body: string;
  createdAt: number;
  expiresAt: number;
  reportCount: number;
};

export const users = new Map<SocketId, UserInfo>();
export const queues = new Map<string, SocketId[]>();
export const rooms = new Map<RoomId, Room>();
export const boardPosts = new Map<PostId, BoardPost>();
export const deviceSockets = new Map<DeviceId, Set<SocketId>>();

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

export function sweepExpiredPosts(now = Date.now()): number {
  let removed = 0;
  for (const [id, post] of boardPosts) {
    if (post.expiresAt <= now) {
      boardPosts.delete(id);
      removed++;
    }
  }
  return removed;
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
