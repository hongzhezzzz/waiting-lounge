"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
let currentToken: string | null = null;

function backendUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "http://localhost:4000"
      : "https://waiting-lounge.onrender.com")
  );
}

export function getSocket(): Socket {
  if (typeof window === "undefined") {
    throw new Error("getSocket() called on the server");
  }
  if (!socket) {
    socket = io(backendUrl(), {
      autoConnect: true,
      transports: ["websocket", "polling"],
      auth: currentToken ? { token: currentToken } : undefined,
    });
  }
  return socket;
}

// Update the auth token used by the singleton socket. If the token changed,
// the socket reconnects so the server sees the new identity.
export function setSocketAuthToken(token: string | null) {
  if (currentToken === token) return;
  currentToken = token;
  if (socket) {
    socket.auth = token ? { token } : {};
    socket.disconnect();
    socket.connect();
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
