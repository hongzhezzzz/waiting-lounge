// Common types and a tiny interface every game runner implements.
import type { Server } from "socket.io";
import type { Game, GameId, SocketId, UserId } from "../state.js";

export interface GameRunner {
  start(): void;
  handleAction(socketId: SocketId, action: unknown): void;
  handleDisconnect(socketId: SocketId): void;
  handleReconnect(socketId: SocketId, userId: UserId): boolean;
  // Re-emits the current round_start (and the resolved payload, if any)
  // to one specific socket. Called when the client mounts the game page
  // and asks for state via `request_round_state`. Covers the race where
  // the original round_start was emitted before the client's game page
  // had mounted and subscribed to game_state_update.
  replayCurrentState(socketId: SocketId): void;
  abort(reason: string): Promise<void>;
}

export type GameRunnerCtor = new (game: Game, io: Server) => GameRunner;

// Map from game type to runner constructor.
export const gameRegistry = new Map<string, GameRunnerCtor>();

export function registerGame(type: string, ctor: GameRunnerCtor) {
  gameRegistry.set(type, ctor);
}

export function buildRunner(game: Game, io: Server): GameRunner {
  const Ctor = gameRegistry.get(game.type);
  if (!Ctor) throw new Error(`Unknown game type: ${game.type}`);
  return new Ctor(game, io);
}

// Live runners keyed by gameId.
export const liveRunners = new Map<GameId, GameRunner>();

export function getRunner(gameId: GameId): GameRunner | undefined {
  return liveRunners.get(gameId);
}
