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
  games,
  roomGame,
  type UserInfo,
  type Room,
  type Game,
  type GameDuration,
  type GameType,
  type GamePlayer,
} from "./state.js";
import { verifySupabaseJwt } from "./auth/supabase.js";
import { getOrCreateUser, getBalance } from "./auth/userStore.js";
import { chargeAntes } from "./games/transferPoints.js";
import { buildRunner, liveRunners, getRunner } from "./games/index.js";

const MAX_MESSAGE_LEN = 500;
const DEVICE_ID_PATTERN = /^[a-f0-9-]{8,64}$/i;
const ALLOWED_GAME_TYPES: ReadonlyArray<GameType> = ["spot_the_bug", "brain_bet"];
const ALLOWED_DURATIONS: ReadonlyArray<GameDuration> = [1, 5, 10];

// Game-mode queue: per (gameType, durationMin, ante) tuple.
const gameQueues = new Map<string, string[]>();
function gameQueueKey(t: GameType, d: GameDuration, ante: number): string {
  return `${t}:${d}:${ante}`;
}
function getGameQueue(key: string): string[] {
  let q = gameQueues.get(key);
  if (!q) { q = []; gameQueues.set(key, q); }
  return q;
}
function removeFromGameQueues(socketId: string) {
  for (const [key, q] of Array.from(gameQueues.entries())) {
    const i = q.indexOf(socketId);
    if (i >= 0) q.splice(i, 1);
    if (q.length === 0) gameQueues.delete(key);
  }
}

// Cleans up whatever room the user is currently in, so a fresh queue request
// can proceed. Chat room → leave + notify peer. Game room → abort the game
// (refund both antes — see resolver.abort). No-op if not in a room.
async function cleanupCurrentRoom(socket: Socket, me: UserInfo) {
  if (!me.roomId) return;
  const gameId = roomGame.get(me.roomId);
  if (gameId) {
    const runner = getRunner(gameId);
    if (runner) await runner.abort("user_requeued");
  }
  // Always clear chat-room state too (works whether the room was chat or game).
  if (me.roomId) leaveRoomBySocket(socket, me, "left");
}

export function registerSocketHandlers(io: Server) {
  // Optional JWT auth: if a token is present and valid, attach userId/email
  // to socket.data. Anonymous connections still work for chat/board/lounge.
  io.use(async (socket, next) => {
    const token =
      (socket.handshake.auth && (socket.handshake.auth as { token?: string }).token) ||
      (socket.handshake.query && (socket.handshake.query.token as string));
    if (!token) return next();
    try {
      const claims = await verifySupabaseJwt(String(token));
      const user = await getOrCreateUser(claims.email);
      socket.data.userId = user.id;
      socket.data.email = user.email;
      socket.data.handle = user.handle;
    } catch (err) {
      // Invalid token = silently anonymous. We do not block the connection so
      // expired-session users still see the lounge and can re-sign-in.
      log("auth_invalid", { reason: (err as Error).message });
    }
    next();
  });

  io.on("connection", (socket: Socket) => {
    const handle: string = (socket.data?.handle as string) || generateHandle();
    const me: UserInfo = {
      socketId: socket.id,
      handle,
      tag: null,
      roomId: null,
      deviceId: null,
      userId: (socket.data?.userId as string) ?? null,
      email: (socket.data?.email as string) ?? null,
      blocked: new Set(),
    };
    users.set(socket.id, me);

    socket.emit("welcome", { handle, socketId: socket.id, authed: !!me.userId });
    log("connected", { socketId: socket.id, handle, authed: !!me.userId });

    // If the new socket carries a userId that has an active game with a
    // pending disconnect, hand it back to the runner.
    if (me.userId) {
      for (const game of games.values()) {
        const player = game.players.find((p) => p.userId === me.userId);
        if (!player || game.resolved) continue;
        const runner = getRunner(game.id);
        if (!runner) continue;
        const reattached = runner.handleReconnect(socket.id, me.userId);
        if (reattached) {
          me.roomId = game.roomId;
          socket.join(game.roomId);
          socket.emit("game_reattached", { gameId: game.id, roomId: game.roomId });
        }
      }
    }

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

    socket.on("join_queue", async (payload: { tag?: string }) => {
      const tag = (payload?.tag || "").toString().trim();
      if (!tag) return socket.emit("error_message", { message: "Missing tag." });

      // Lenient: if the user navigated away from a previous chat/game without
      // cleaning up, reset state instead of blocking.
      if (me.roomId) await cleanupCurrentRoom(socket, me);

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

    socket.on("queue_for_game", async (payload: { gameType?: string; durationMin?: number; ante?: number }) => {
      if (!me.userId) {
        return socket.emit("error_message", { message: "Sign in to play games." });
      }
      const gameType = (payload?.gameType || "").toString() as GameType;
      const durationMin = Number(payload?.durationMin) as GameDuration;
      const ante = Number(payload?.ante);
      if (!ALLOWED_GAME_TYPES.includes(gameType)) {
        return socket.emit("error_message", { message: "Invalid game type." });
      }
      if (!ALLOWED_DURATIONS.includes(durationMin)) {
        return socket.emit("error_message", { message: "Invalid duration." });
      }
      if (!Number.isInteger(ante) || ante < 10 || ante > 1000) {
        return socket.emit("error_message", { message: "Invalid ante." });
      }

      // Lenient cleanup, same as join_queue.
      if (me.roomId) await cleanupCurrentRoom(socket, me);

      const balance = await getBalance(me.userId);
      if (balance == null || balance < ante) {
        return socket.emit("error_message", { message: `Not enough points (${balance ?? 0} < ${ante}).` });
      }

      const key = gameQueueKey(gameType, durationMin, ante);
      const q = getGameQueue(key);

      // Find a peer in this exact-match queue (different userId).
      const peerIdx = q.findIndex((peerId) => {
        if (peerId === socket.id) return false;
        const peer = users.get(peerId);
        if (!peer || !peer.userId) return false;
        if (peer.userId === me.userId) return false;
        return true;
      });

      if (peerIdx === -1) {
        q.push(socket.id);
        socket.emit("game_waiting", { gameType, durationMin, ante });
        log("game_queued", { socketId: socket.id, key });
        return;
      }

      const peerId = q.splice(peerIdx, 1)[0];
      const peer = users.get(peerId);
      if (!peer || !peer.userId) {
        // Peer vanished — re-queue self.
        q.push(socket.id);
        return socket.emit("game_waiting", { gameType, durationMin, ante });
      }

      // Match — charge antes, create game, build runner, broadcast game_started.
      removeFromGameQueues(socket.id);

      let charge;
      try {
        charge = await chargeAntes({
          gameType,
          durationMin,
          ante,
          playerAId: me.userId,
          playerBId: peer.userId,
        });
      } catch (err) {
        log("charge_antes_failed", { reason: (err as Error).message });
        socket.emit("error_message", { message: "Could not start game (insufficient points)." });
        io.to(peerId).emit("error_message", { message: "Could not start game (peer issue)." });
        return;
      }

      const roomId = uuid();
      const players: GamePlayer[] = [
        { socketId: socket.id, userId: me.userId, handle: me.handle, score: 0, disconnectedAt: null },
        { socketId: peerId, userId: peer.userId, handle: peer.handle, score: 0, disconnectedAt: null },
      ];
      const game: Game = {
        id: uuid(),
        type: gameType,
        roomId,
        players,
        pot: ante * 2,
        ante,
        durationMin,
        startedAt: Date.now(),
        endsAt: Date.now() + durationMin * 60_000,
        state: null,
        pendingRefundIds: charge.pendingRefundIds,
        resolved: false,
      };
      // Stash the gameRoundId on the game object so the resolver can use it.
      (game as Game & { gameRoundId?: string }).gameRoundId = charge.gameRoundId;
      games.set(game.id, game);
      roomGame.set(roomId, game.id);

      me.roomId = roomId;
      peer.roomId = roomId;
      socket.join(roomId);
      io.sockets.sockets.get(peerId)?.join(roomId);

      const runner = buildRunner(game, io);
      liveRunners.set(game.id, runner);

      socket.emit("game_started", { gameId: game.id, roomId, gameType, durationMin, ante, peerHandle: peer.handle });
      io.to(peerId).emit("game_started", { gameId: game.id, roomId, gameType, durationMin, ante, peerHandle: me.handle });
      log("game_started", { gameId: game.id, type: gameType, ante, players: [me.handle, peer.handle] });

      runner.start();
    });

    socket.on("cancel_game_queue", () => {
      removeFromGameQueues(socket.id);
      socket.emit("game_queue_cancelled", {});
    });

    socket.on("game_action", (payload: { gameId?: string; action?: unknown }) => {
      const gameId = (payload?.gameId || "").toString();
      const game = games.get(gameId);
      if (!game) return;
      if (!game.players.some((p) => p.socketId === socket.id)) return;
      const runner = getRunner(gameId);
      if (!runner) return;
      runner.handleAction(socket.id, payload.action);
    });

    socket.on("disconnect", () => {
      removeFromAllQueues(socket.id);
      removeFromGameQueues(socket.id);
      unregisterDeviceSocket(socket.id);

      // If this socket is in an active game, notify the runner (grace timer).
      if (me.roomId) {
        const gameId = roomGame.get(me.roomId);
        if (gameId) {
          const runner = getRunner(gameId);
          runner?.handleDisconnect(socket.id);
        }
      }

      if (me.roomId && !roomGame.has(me.roomId)) {
        // Chat room (not a game) — original behavior.
        leaveRoom(socket, me, "disconnected");
      }
      users.delete(socket.id);
      log("disconnected", { socketId: socket.id, handle });
    });
  });
}

// Wrapper that lets the helper above use leaveRoom without a forward-ref dance.
function leaveRoomBySocket(socket: Socket, me: UserInfo, reason: "left" | "disconnected") {
  return leaveRoom(socket, me, reason);
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
