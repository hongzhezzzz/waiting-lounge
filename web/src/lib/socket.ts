"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (typeof window === "undefined") {
    throw new Error("getSocket() called on the server");
  }
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
    socket = io(url, {
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
