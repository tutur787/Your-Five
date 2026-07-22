import { CompetitionChoice, MatchAction, MatchmakingServerMessage, RoomServerMessage, Sport } from "@fiveaside/shared/core";

const ACK_TIMEOUT_MS = 7000;
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const ROOM_TOKEN_PREFIX = "your-five:room-token:";
export const CLIENT_ID_KEY = "your-five:client-id";
export const ONLINE_NICKNAME_KEY = "your-five:nickname";

export function normalizeOnlineNickname(value: string): string | null {
  const nickname = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!nickname) return "";
  const length = [...nickname].length;
  if (length < 2 || length > 16) return null;
  return /^[\p{L}\p{N} '_-]+$/u.test(nickname) ? nickname : null;
}

export function getClientId(): string {
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function getOnlineNickname(): string {
  try {
    const stored = window.localStorage.getItem(ONLINE_NICKNAME_KEY) ?? "";
    return normalizeOnlineNickname(stored) ?? "";
  } catch {
    return "";
  }
}

export function storeOnlineNickname(nickname: string): void {
  const normalized = normalizeOnlineNickname(nickname);
  if (normalized === null) return;
  try {
    if (normalized) window.localStorage.setItem(ONLINE_NICKNAME_KEY, normalized);
    else window.localStorage.removeItem(ONLINE_NICKNAME_KEY);
  } catch {
    // The nickname remains in the current input when storage is unavailable.
  }
}

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
export async function createRoomCode(sport: Sport, competition?: CompetitionChoice): Promise<{ code: string; token: string; sport: Sport }> {
  const query = new URLSearchParams({ sport });
  if (competition) query.set("competition", competition);
  const res = await fetch(`${httpBase()}/rooms/new?${query}`, {
    headers: { "X-Your-Five-Client": getClientId() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? "Could not reach the server.");
  }
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
  return { code: data.code, token: data.token, sport };
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
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
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
    this.ws.addEventListener("open", () => handlers.onOpen?.());
    this.ws.addEventListener("message", (event) => this.handleMessage(event, handlers.onMessage));
    this.ws.addEventListener("close", (event) => {
      this.rejectPending(new Error("Disconnected from the server."));
      handlers.onClose?.(event);
    });
  }

  startDraft(): Promise<void> {
    return this.request({ type: "startDraft" });
  }

  action(action: MatchAction): Promise<void> {
    return this.request({ type: "action", action });
  }

  setNickname(nickname: string): Promise<void> {
    return this.request({ type: "setNickname", nickname });
  }

  setRematchReady(ready: boolean): Promise<void> {
    return this.request({ type: "setRematchReady", ready });
  }

  close(): void {
    this.rejectPending(new Error("Connection closed."));
    this.ws.close();
  }

  private request(message: { type: "startDraft" } | { type: "setNickname"; nickname: string } | { type: "setRematchReady"; ready: boolean } | { type: "action"; action: MatchAction }): Promise<void> {
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
export function connectMatchmaking(sport: Sport, competition: CompetitionChoice | undefined, onMessage: (message: MatchmakingServerMessage) => void): WebSocket {
  const query = new URLSearchParams({ sport, client: getClientId() });
  if (competition) query.set("competition", competition);
  const ws = new WebSocket(socketUrl(`/matchmaking?${query}`));
  ws.addEventListener("message", (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // Ignore malformed messages.
    }
  });
  return ws;
}
