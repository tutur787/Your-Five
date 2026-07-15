import { io, Socket } from "socket.io-client";

/**
 * Opens a connection to the Socket.IO server. In production the client and server are deployed
 * separately (e.g. client on Vercel, server on Railway/Fly), so the server's real URL must be
 * supplied via VITE_SERVER_URL at build time — otherwise socket.io-client defaults to same-origin,
 * which is wrong once they're on different domains. In local dev VITE_SERVER_URL is left unset and
 * the Vite dev-server proxy (see vite.config.ts) forwards /socket.io to localhost:4000 instead.
 */
export function createSocket(): Socket {
  return io(import.meta.env.VITE_SERVER_URL);
}
