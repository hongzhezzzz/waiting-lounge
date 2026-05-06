// In-memory state. Replaced with Postgres + Redis in Phase 6.

export type SocketId = string;
export type RoomId = string;

export type UserInfo = {
  socketId: SocketId;
  handle: string;
  tag: string | null;
  roomId: RoomId | null;
  blocked: Set<string>;
};

export type Room = {
  id: RoomId;
  tag: string;
  members: SocketId[];
  createdAt: number;
};

export const users = new Map<SocketId, UserInfo>();
export const queues = new Map<string, SocketId[]>();
export const rooms = new Map<RoomId, Room>();

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
