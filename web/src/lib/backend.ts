const PROD_BACKEND_URL = "https://waiting-lounge.onrender.com";

export function getBackendUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_SOCKET_URL;
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:4000";
    }
    return PROD_BACKEND_URL;
  }
  return "http://localhost:4000";
}
