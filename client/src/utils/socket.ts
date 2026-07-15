import { MatchAction, MatchmakingServerMessage, RoomServerMessage } from "@fiveaside/shared";

const ACK_TIMEOUT_MS = 7000;
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const ROOM_TOKEN_PREFIX = "your-five:room-token:";

/** Base URL of the worker for plain HTTP requests. In local dev this is empty and requests go
 * same-origin through the Vite dev-server proxy (see vite.config.ts); in production it's the
 * worker's real URL, supplied at build time since the client and worker are on different domains. */
function httpBase(): string {
  return (import.meta.env.VITE_SERVER_URL ?? "").replace(/\/$/, "");
}

function socketUrl(path: string): string {
  const base = import.meta.env.VITE_SERVER_URL;
  if (base) return base.replace(/\/$/, "").replace(/^http/, "ws") + path;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

/** Reserves a private room and returns the creator's durable seat token. */
export async function createRoomCode(): Promise<{ code: string; token: string }> {
  const res = await fetch(`${httpBase()}/rooms/new`);
  if (!res.ok) throw new Error("Could not reach the server.");
  const data: unknown = await res.json();
  if (
    typeof data !== "object" ||
    data === null ||
    !("code" in data) ||
    !("token" in data) ||
    typeof data.code !== "string" ||
    typeof data.token !== "string" ||
    !ROOM_CODE_PATTERN.test(data.code) ||
    !data.token
  ) {
    throw new Error("The server returned an invalid room.");
  }
  return { code: data.code, token: data.token };
}

export function getStoredRoomToken(code: string): string | null {
  try {
    return window.sessionStorage.getItem(`${ROOM_TOKEN_PREFIX}${code.toUpperCase()}`);
  } catch {
    return null;
  }
}

export function storeRoomToken(code: string, token: string): void {
  try {
    window.sessionStorage.setItem(`${ROOM_TOKEN_PREFIX}${code.toUpperCase()}`, token);
  } catch {
    // Storage can be disabled by browser privacy settings; the active socket still works.
  }
}

interface RoomSocketHandlers {
  onMessage: (message: RoomServerMessage) => void;
  onClose?: () => void;
}

/**
 * Thin wrapper around a raw WebSocket connected to /room/:code. Raw WebSocket has no built-in ack
 * mechanism the way Socket.IO did, so requests carry a client-generated id and `send()` returns a
 * promise that resolves once the matching `{type: "ack", id}` message arrives, or rejects after
 * ACK_TIMEOUT_MS.
 */
export class RoomSocket {
  readonly ws: WebSocket;
  private pending = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: number }>();

  constructor(code: string, token: string | null, handlers: RoomSocketHandlers) {
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    this.ws = new WebSocket(socketUrl(`/room/${encodeURIComponent(code)}${query}`));
    this.ws.addEventListener("message", (event) => this.handleMessage(event, handlers.onMessage));
    this.ws.addEventListener("close", () => {
      this.rejectPending(new Error("Disconnected from the server."));
      handlers.onClose?.();
    });
  }

  startDraft(): Promise<void> {
    return this.request({ type: "startDraft" });
  }

  action(action: MatchAction): Promise<void> {
    return this.request({ type: "action", action });
  }

  close(): void {
    this.rejectPending(new Error("Connection closed."));
    this.ws.close();
  }

  private request(message: { type: "startDraft" } | { type: "action"; action: MatchAction }): Promise<void> {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Still connecting to the server."));
    }
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Timed out waiting for a response."));
      }, ACK_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ ...message, id }));
    });
  }

  private handleMessage(event: MessageEvent, onMessage: (message: RoomServerMessage) => void): void {
    let message: RoomServerMessage;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === "ack") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.ok) pending.resolve();
      else pending.reject(new Error(message.error ?? "Request failed."));
      return;
    }
    onMessage(message);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

/** Connects to the shared matchmaking queue. This protocol needs no client->server payloads:
 * connecting IS "find a match," and closing the socket IS "cancel matchmaking." */
export function connectMatchmaking(onMessage: (message: MatchmakingServerMessage) => void): WebSocket {
  const ws = new WebSocket(socketUrl("/matchmaking"));
  ws.addEventListener("message", (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // Ignore malformed messages.
    }
  });
  return ws;
}
