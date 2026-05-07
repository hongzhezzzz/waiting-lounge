import type { Server, Socket } from "socket.io";
import { v4 as uuid } from "uuid";
import { generateHandle } from "./lib/identity.js";
import {
  users,
  rooms,
  getQueue,
  removeFromQueue,
  removeFromAllQueues,
  registerDeviceSocket,
  unregisterDeviceSocket,
  getLastStatus,
  type UserInfo,
  type Room,
} from "./state.js";

const MAX_MESSAGE_LEN = 500;
const DEVICE_ID_PATTERN = /^[a-f0-9-]{8,64}$/i;

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    const handle = generateHandle();
    const me: UserInfo = {
      socketId: socket.id,
      handle,
      tag: null,
      roomId: null,
      deviceId: null,
      blocked: new Set(),
    };
    users.set(socket.id, me);

    socket.emit("welcome", { handle, socketId: socket.id });
    log("connected", { socketId: socket.id, handle });

    socket.on("register_device", (payload: { deviceId?: string }) => {
      const deviceId = (payload?.deviceId || "").toString().trim();
      if (!DEVICE_ID_PATTERN.test(deviceId)) {
        return socket.emit("error_message", { message: "Invalid device id." });
      }
      me.deviceId = deviceId;
      registerDeviceSocket(deviceId, socket.id);
      log("device_registered", { socketId: socket.id, deviceId: deviceId.slice(0, 8) });

      const last = getLastStatus(deviceId);
      if (last) {
        socket.emit("agent_status_update", {
          status: last.status,
          client: last.client,
          ts: last.timestamp,
        });
      }
    });

    socket.on("join_queue", (payload: { tag?: string }) => {
      const tag = (payload?.tag || "").toString().trim();
      if (!tag) return socket.emit("error_message", { message: "Missing tag." });
      if (me.roomId) return socket.emit("error_message", { message: "Already in a room." });

      removeFromAllQueues(socket.id);
      me.tag = tag;

      const queue = getQueue(tag);
      const peerIdx = queue.findIndex((peerId) => {
        if (peerId === socket.id) return false;
        const peer = users.get(peerId);
        if (!peer) return false;
        if (peer.blocked.has(me.handle)) return false;
        if (me.blocked.has(peer.handle)) return false;
        return true;
      });

      if (peerIdx === -1) {
        queue.push(socket.id);
        socket.emit("waiting", { tag });
        log("queued", { socketId: socket.id, handle, tag });
        return;
      }

      const peerId = queue.splice(peerIdx, 1)[0];
      const peer = users.get(peerId);
      if (!peer) return socket.emit("waiting", { tag });

      const roomId = uuid();
      const room: Room = { id: roomId, tag, members: [socket.id, peerId], createdAt: Date.now() };
      rooms.set(roomId, room);
      me.roomId = roomId;
      peer.roomId = roomId;

      socket.join(roomId);
      io.sockets.sockets.get(peerId)?.join(roomId);

      socket.emit("matched", { roomId, peerHandle: peer.handle, tag });
      io.to(peerId).emit("matched", { roomId, peerHandle: me.handle, tag });
      log("matched", { roomId, tag, a: me.handle, b: peer.handle });
    });

    socket.on("leave_queue", () => {
      removeFromAllQueues(socket.id);
      me.tag = null;
      socket.emit("left_queue", {});
    });

    socket.on("chat_message", (payload: { body?: string }) => {
      const body = (payload?.body || "").toString();
      if (!me.roomId) return socket.emit("error_message", { message: "Not in a room." });
      if (!body.trim()) return;
      if (body.length > MAX_MESSAGE_LEN) {
        return socket.emit("error_message", { message: `Message too long (max ${MAX_MESSAGE_LEN}).` });
      }
      socket.to(me.roomId).emit("chat_message", {
        from: me.handle,
        body,
        ts: Date.now(),
      });
      log("message", { roomId: me.roomId, from: me.handle, len: body.length });
    });

    socket.on("leave_room", () => {
      leaveRoom(socket, me, "left");
    });

    socket.on("report_user", (payload: { peerHandle?: string; reason?: string }) => {
      log("report", {
        reporter: me.handle,
        peer: (payload?.peerHandle || "").toString().slice(0, 64),
        reason: (payload?.reason || "").toString().slice(0, 200),
      });
      socket.emit("report_acknowledged", {});
    });

    socket.on("block_user", (payload: { peerHandle?: string }) => {
      const peer = (payload?.peerHandle || "").toString();
      if (peer) me.blocked.add(peer);
      log("block", { who: me.handle, blocked: peer });
      socket.emit("block_acknowledged", { peerHandle: peer });
    });

    socket.on("disconnect", () => {
      removeFromAllQueues(socket.id);
      unregisterDeviceSocket(socket.id);
      if (me.roomId) leaveRoom(socket, me, "disconnected");
      users.delete(socket.id);
      log("disconnected", { socketId: socket.id, handle });
    });
  });
}

function leaveRoom(socket: Socket, me: UserInfo, reason: "left" | "disconnected") {
  if (!me.roomId) return;
  const roomId = me.roomId;
  const room = rooms.get(roomId);
  me.roomId = null;
  if (!room) return;

  socket.to(roomId).emit("peer_left", { reason });
  socket.leave(roomId);

  for (const memberId of room.members) {
    if (memberId === socket.id) continue;
    const other = users.get(memberId);
    if (other) other.roomId = null;
  }
  rooms.delete(roomId);
  log("room_closed", { roomId, reason });
}

function log(event: string, data: Record<string, unknown>) {
  console.log(`[${new Date().toISOString()}] ${event}`, JSON.stringify(data));
}
