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
  invites,
  type UserInfo,
  type Room,
  type Game,
  type GameDuration,
  type GameType,
  type GamePlayer,
  type Invite,
} from "./state.js";
import { verifySupabaseJwt } from "./auth/supabase.js";
import { getOrCreateUser, getBalance } from "./auth/userStore.js";
import { chargeAntes } from "./games/transferPoints.js";
import { buildRunner, liveRunners, getRunner } from "./games/index.js";

const MAX_MESSAGE_LEN = 500;
const DEVICE_ID_PATTERN = /^[a-f0-9-]{8,64}$/i;
const ALLOWED_GAME_TYPES: ReadonlyArray<GameType> = ["spot_the_bug", "brain_bet"];
const ALLOWED_DURATIONS: ReadonlyArray<GameDuration> = [1, 5, 10];
const INVITE_TTL_MS = 30_000;
// Pool matchmaking ("Find a match") uses fixed defaults so all
// queueing players land in the same per-gameType bucket.
const POOL_DEFAULT_DURATION: GameDuration = 5;
const POOL_DEFAULT_ANTE = 100;
// 3b.3 — Bot fill. If a pool-queued human waits this long without
// a real peer arriving, spawn a calibrated bot to play with them.
// Bot games skip chargeAntes/settleGame entirely so no platform
// points change hands and the bot doesn't pollute the leaderboard.
const POOL_BOT_FILL_MS = 30_000;
const poolBotTimers = new Map<string, NodeJS.Timeout>();

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

// Idle = signed-in user, not in any room. We don't filter out users currently
// in a queue — accepting an invite will pull them out. Dedupes by userId so
// one user opening multiple tabs shows only once.
function getIdleUsers(excludeSocketId?: string, excludeUserId?: string) {
  const seen = new Map<string, { handle: string; userId: string; socketId: string }>();
  for (const [socketId, info] of users) {
    if (!info.userId) continue;
    if (info.roomId) continue;
    if (excludeSocketId && socketId === excludeSocketId) continue;
    if (excludeUserId && info.userId === excludeUserId) continue;
    if (seen.has(info.userId)) continue;
    seen.set(info.userId, { handle: info.handle, userId: info.userId, socketId });
  }
  return Array.from(seen.values());
}

// Spawns a bot to play with the queued human. Builds a Game with one
// real player + one synthetic "lounge-bot" entry, registers it with the
// runner, and starts. The runner detects isBotMatch and (a) skips
// chargeAntes/settleGame entirely and (b) auto-acts for the bot's
// socketId on each phase change.
function startBotMatchFor(
  io: Server,
  humanSocketId: string,
  gameType: GameType,
  durationMin: GameDuration,
  ante: number,
): boolean {
  const human = users.get(humanSocketId);
  if (!human || !human.userId || human.roomId) return false;

  // Synthetic bot identity — never inserted into `users` Map, never
  // hits the DB. Handle prefix `lounge-bot-` is the public signal the
  // frontend uses to render the robot icon and "no points" notice.
  const botSocketId = `bot:${uuid()}`;
  const botUserId = `bot:${uuid()}`;
  const botHandle = `lounge-bot-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;

  removeFromAllQueues(humanSocketId);
  removeFromGameQueues(humanSocketId);

  const roomId = uuid();
  const players: GamePlayer[] = [
    { socketId: humanSocketId, userId: human.userId, handle: human.handle, score: 0, disconnectedAt: null },
    { socketId: botSocketId, userId: botUserId, handle: botHandle, score: 0, disconnectedAt: null },
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
    pendingRefundIds: [],
    resolved: false,
    isBotMatch: true,
    botSocketId,
  };
  games.set(game.id, game);
  roomGame.set(roomId, game.id);

  human.roomId = roomId;
  io.sockets.sockets.get(humanSocketId)?.join(roomId);

  const runner = buildRunner(game, io);
  liveRunners.set(game.id, runner);

  io.to(humanSocketId).emit("game_started", {
    gameId: game.id,
    roomId,
    gameType,
    durationMin,
    ante,
    peerHandle: botHandle,
  });
  log("bot_match_started", { gameId: game.id, type: gameType, human: human.handle, bot: botHandle });

  runner.start();
  return true;
}

// Drives the actual game start once two specific socket ids are committed
// to playing each other. Used by both queue_for_game and accept_invite.
// Returns true on success, false if anything went wrong (caller emits
// the error).
async function startGameBetween(
  io: Server,
  aSocketId: string,
  bSocketId: string,
  gameType: GameType,
  durationMin: GameDuration,
  ante: number,
): Promise<boolean> {
  const a = users.get(aSocketId);
  const b = users.get(bSocketId);
  if (!a || !b || !a.userId || !b.userId) return false;
  if (a.userId === b.userId) return false;
  if (a.roomId || b.roomId) return false;

  // Pull both out of any chat/game queues they may be in.
  removeFromAllQueues(aSocketId);
  removeFromAllQueues(bSocketId);
  removeFromGameQueues(aSocketId);
  removeFromGameQueues(bSocketId);

  let charge;
  try {
    charge = await chargeAntes({
      gameType,
      durationMin,
      ante,
      playerAId: a.userId,
      playerBId: b.userId,
    });
  } catch (err) {
    log("charge_antes_failed", { reason: (err as Error).message });
    io.to(aSocketId).emit("error_message", { message: "Could not start game (insufficient points)." });
    io.to(bSocketId).emit("error_message", { message: "Could not start game (insufficient points)." });
    return false;
  }

  const roomId = uuid();
  const players: GamePlayer[] = [
    { socketId: aSocketId, userId: a.userId, handle: a.handle, score: 0, disconnectedAt: null },
    { socketId: bSocketId, userId: b.userId, handle: b.handle, score: 0, disconnectedAt: null },
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
  (game as Game & { gameRoundId?: string }).gameRoundId = charge.gameRoundId;
  games.set(game.id, game);
  roomGame.set(roomId, game.id);

  a.roomId = roomId;
  b.roomId = roomId;
  io.sockets.sockets.get(aSocketId)?.join(roomId);
  io.sockets.sockets.get(bSocketId)?.join(roomId);

  const runner = buildRunner(game, io);
  liveRunners.set(game.id, runner);

  io.to(aSocketId).emit("game_started", { gameId: game.id, roomId, gameType, durationMin, ante, peerHandle: b.handle });
  io.to(bSocketId).emit("game_started", { gameId: game.id, roomId, gameType, durationMin, ante, peerHandle: a.handle });
  log("game_started", { gameId: game.id, type: gameType, ante, players: [a.handle, b.handle] });

  runner.start();
  return true;
}

function cancelInvite(io: Server, inviteId: string, reason: "expired" | "cancelled" | "declined" | "consumed") {
  const inv = invites.get(inviteId);
  if (!inv) return;
  if (inv.expiryTimer) clearTimeout(inv.expiryTimer);
  invites.delete(inviteId);
  if (reason === "expired") {
    io.to(inv.inviterSocketId).emit("invite_expired", { inviteId, reason });
    io.to(inv.targetSocketId).emit("invite_expired", { inviteId, reason });
  } else if (reason === "declined") {
    io.to(inv.inviterSocketId).emit("invite_declined", { inviteId });
  }
}

// On disconnect, kill any invite either side of which involves the dropped socket.
function cleanupInvitesForSocket(io: Server, socketId: string) {
  for (const inv of Array.from(invites.values())) {
    if (inv.inviterSocketId === socketId || inv.targetSocketId === socketId) {
      cancelInvite(io, inv.id, "expired");
    }
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

    socket.on("register_device", async (payload: { deviceId?: string }) => {
      const deviceId = (payload?.deviceId || "").toString().trim();
      if (!DEVICE_ID_PATTERN.test(deviceId)) {
        return socket.emit("error_message", { message: "Invalid device id." });
      }
      me.deviceId = deviceId;
      registerDeviceSocket(deviceId, socket.id);
      log("device_registered", { socketId: socket.id, deviceId: deviceId.slice(0, 8) });

      const last = await getLastStatus(deviceId);
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
      const ok = await startGameBetween(io, socket.id, peerId, gameType, durationMin, ante);
      if (!ok) {
        // Peer vanished or charge failed — re-queue self.
        q.push(socket.id);
        socket.emit("game_waiting", { gameType, durationMin, ante });
      }
    });

    socket.on("cancel_game_queue", () => {
      removeFromGameQueues(socket.id);
      const t = poolBotTimers.get(socket.id);
      if (t) {
        clearTimeout(t);
        poolBotTimers.delete(socket.id);
      }
      socket.emit("game_queue_cancelled", {});
    });

    // Pool matchmaking — single shared queue per gameType with fixed
    // defaults, so any two players hitting "Find a match" pair up. Falls
    // through to the same `gameQueueKey` map as queue_for_game, meaning
    // an explicit-tuple queueer with the same defaults will also pair.
    socket.on("queue_for_pool", async (payload: { gameType?: string }) => {
      if (!me.userId) {
        return socket.emit("error_message", { message: "Sign in to play games." });
      }
      const gameType = (payload?.gameType || "").toString() as GameType;
      if (!ALLOWED_GAME_TYPES.includes(gameType)) {
        return socket.emit("error_message", { message: "Invalid game type." });
      }

      if (me.roomId) await cleanupCurrentRoom(socket, me);

      const balance = await getBalance(me.userId);
      if (balance == null || balance < POOL_DEFAULT_ANTE) {
        return socket.emit("error_message", {
          message: `Not enough points (${balance ?? 0} < ${POOL_DEFAULT_ANTE}).`,
        });
      }

      const durationMin = POOL_DEFAULT_DURATION;
      const ante = POOL_DEFAULT_ANTE;
      const key = gameQueueKey(gameType, durationMin, ante);
      const q = getGameQueue(key);

      const peerIdx = q.findIndex((peerId) => {
        if (peerId === socket.id) return false;
        const peer = users.get(peerId);
        if (!peer || !peer.userId) return false;
        if (peer.userId === me.userId) return false;
        return true;
      });

      if (peerIdx === -1) {
        q.push(socket.id);
        socket.emit("pool_waiting", { gameType, durationMin, ante });
        log("pool_queued", { socketId: socket.id, key });
        // Schedule bot fill if no real peer arrives within the window.
        const existing = poolBotTimers.get(socket.id);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          poolBotTimers.delete(socket.id);
          // Re-check the world — only fill if the human is still
          // waiting and not yet in a game.
          const meNow = users.get(socket.id);
          if (!meNow || meNow.roomId) return;
          // Pull them out of the queue (the bot match replaces it).
          removeFromGameQueues(socket.id);
          startBotMatchFor(io, socket.id, gameType, durationMin, ante);
        }, POOL_BOT_FILL_MS);
        poolBotTimers.set(socket.id, timer);
        return;
      }

      // Real peer found — cancel any pending bot timer for either
      // side, then pair.
      const peerId = q.splice(peerIdx, 1)[0];
      for (const sid of [socket.id, peerId]) {
        const t = poolBotTimers.get(sid);
        if (t) {
          clearTimeout(t);
          poolBotTimers.delete(sid);
        }
      }
      const ok = await startGameBetween(io, socket.id, peerId, gameType, durationMin, ante);
      if (!ok) {
        q.push(socket.id);
        socket.emit("pool_waiting", { gameType, durationMin, ante });
      }
    });

    // Bot-now: skip the pool wait, start a bot match immediately.
    // Same preconditions as queue_for_pool. Triggered by the [B] key
    // in the TUI lobby and the "Play bot now" button on the web lobby.
    socket.on("start_bot_match_now", async (payload: { gameType?: string }) => {
      if (!me.userId) {
        return socket.emit("error_message", { message: "Sign in to play games." });
      }
      const gameType = (payload?.gameType || "").toString() as GameType;
      if (!ALLOWED_GAME_TYPES.includes(gameType)) {
        return socket.emit("error_message", { message: "Invalid game type." });
      }
      if (me.roomId) await cleanupCurrentRoom(socket, me);
      const balance = await getBalance(me.userId);
      if (balance == null || balance < POOL_DEFAULT_ANTE) {
        return socket.emit("error_message", {
          message: `Not enough points (${balance ?? 0} < ${POOL_DEFAULT_ANTE}).`,
        });
      }
      // Cancel any pending pool-bot timer + remove from any queues —
      // we're going straight to bot, no waiting room.
      const existing = poolBotTimers.get(socket.id);
      if (existing) {
        clearTimeout(existing);
        poolBotTimers.delete(socket.id);
      }
      removeFromGameQueues(socket.id);
      startBotMatchFor(io, socket.id, gameType, POOL_DEFAULT_DURATION, POOL_DEFAULT_ANTE);
    });

    socket.on("list_idle_users", () => {
      const list = getIdleUsers(socket.id, me.userId ?? undefined);
      socket.emit("idle_users", { users: list });
    });

    socket.on("invite_to_game", async (payload: { targetSocketId?: string; gameType?: string; durationMin?: number; ante?: number }) => {
      if (!me.userId) return socket.emit("error_message", { message: "Sign in to invite." });
      const targetSocketId = (payload?.targetSocketId || "").toString();
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
      const target = users.get(targetSocketId);
      if (!target || !target.userId) {
        return socket.emit("error_message", { message: "That user is no longer online." });
      }
      if (target.userId === me.userId) {
        return socket.emit("error_message", { message: "You can't invite yourself." });
      }
      if (me.roomId || target.roomId) {
        return socket.emit("error_message", { message: "One of you is already in a room." });
      }
      const balance = await getBalance(me.userId);
      if (balance == null || balance < ante) {
        return socket.emit("error_message", { message: `Not enough points (${balance ?? 0} < ${ante}).` });
      }

      const inviteId = uuid();
      const invite: Invite = {
        id: inviteId,
        inviterSocketId: socket.id,
        inviterUserId: me.userId,
        inviterHandle: me.handle,
        targetSocketId,
        targetUserId: target.userId,
        targetHandle: target.handle,
        gameType,
        durationMin,
        ante,
        createdAt: Date.now(),
        expiryTimer: null,
      };
      invite.expiryTimer = setTimeout(() => cancelInvite(io, inviteId, "expired"), INVITE_TTL_MS);
      invites.set(inviteId, invite);

      socket.emit("invite_sent", { inviteId, targetHandle: target.handle, expiresAt: Date.now() + INVITE_TTL_MS });
      io.to(targetSocketId).emit("incoming_invite", {
        inviteId,
        inviterHandle: me.handle,
        gameType,
        durationMin,
        ante,
        expiresAt: Date.now() + INVITE_TTL_MS,
      });
      log("invite_sent", { inviteId, from: me.handle, to: target.handle, gameType });
    });

    socket.on("accept_invite", async (payload: { inviteId?: string }) => {
      const inviteId = (payload?.inviteId || "").toString();
      const inv = invites.get(inviteId);
      if (!inv) return socket.emit("error_message", { message: "Invite no longer available." });
      if (inv.targetSocketId !== socket.id) {
        return socket.emit("error_message", { message: "That invite isn't for you." });
      }
      // Pull from in-memory before we await — prevents a double-accept.
      if (inv.expiryTimer) clearTimeout(inv.expiryTimer);
      invites.delete(inviteId);

      const ok = await startGameBetween(
        io,
        inv.inviterSocketId,
        inv.targetSocketId,
        inv.gameType as GameType,
        inv.durationMin,
        inv.ante,
      );
      if (!ok) {
        socket.emit("error_message", { message: "Could not start game — try again from the lounge." });
        io.to(inv.inviterSocketId).emit("error_message", { message: "Could not start game — try again from the lounge." });
      }
      log("invite_accepted", { inviteId, inviter: inv.inviterHandle, target: inv.targetHandle, ok });
    });

    socket.on("decline_invite", (payload: { inviteId?: string }) => {
      const inviteId = (payload?.inviteId || "").toString();
      const inv = invites.get(inviteId);
      if (!inv) return;
      if (inv.targetSocketId !== socket.id) return;
      cancelInvite(io, inviteId, "declined");
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

    // Replay current round_start to the requester. Called by the game
    // page on mount so a client that arrived after round_start was
    // emitted can sync up. Idempotent — duplicate replays just re-render
    // the same state.
    socket.on("request_round_state", (payload: { gameId?: string }) => {
      const gameId = (payload?.gameId || "").toString();
      const game = games.get(gameId);
      if (!game) return;
      // Only players in this game can request its state. Match by
      // current socketId or by userId (to handle the rare case where
      // the player reconnected with a new socket since game start).
      const isPlayer = game.players.some(
        (p) => p.socketId === socket.id || (me.userId != null && p.userId === me.userId),
      );
      if (!isPlayer) return;
      const runner = getRunner(gameId);
      if (!runner) return;
      runner.replayCurrentState(socket.id);
    });

    socket.on("disconnect", () => {
      removeFromAllQueues(socket.id);
      removeFromGameQueues(socket.id);
      unregisterDeviceSocket(socket.id);
      cleanupInvitesForSocket(io, socket.id);
      const botTimer = poolBotTimers.get(socket.id);
      if (botTimer) {
        clearTimeout(botTimer);
        poolBotTimers.delete(socket.id);
      }

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
