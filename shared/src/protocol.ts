import { MatchAction, MatchState, SeatId, Sport } from "./types";

/** Whether both seats in a room currently have a connected player. */
export interface SeatsFilled {
  A: boolean;
  B: boolean;
}

export type RoomKind = "private" | "matched";

// --- /room/:code messages ---

/** Sent by the client over the room WebSocket. Every message carries a client-generated `id` so the
 * matching server ack can be correlated back to the right pending promise (raw WebSocket has no
 * built-in ack mechanism the way Socket.IO did). */
export type RoomClientMessage =
  | { id: string; type: "startDraft" }
  | { id: string; type: "action"; action: MatchAction };

/** Sent by the server over the room WebSocket. */
export type RoomServerMessage =
  | { type: "joined"; seat: SeatId; token: string; sport: Sport; roomKind: RoomKind; state: MatchState | null; seatsFilled: SeatsFilled }
  | { type: "state"; state: MatchState }
  | { type: "roomUpdate"; seatsFilled: SeatsFilled }
  | { type: "opponentLeft"; seat: SeatId }
  | { type: "ack"; id: string; ok: boolean; error?: string }
  | { type: "error"; error: string };

// --- /matchmaking messages ---
// No client->server message type is needed: connecting to the socket IS "find a match," and closing
// it IS "cancel matchmaking" — the server only needs to react to open/close, never a payload.

/** Sent by the server over the matchmaking WebSocket. */
export type MatchmakingServerMessage =
  | { type: "waiting" }
  | { type: "matchFound"; code: string; seat: SeatId; token: string; sport: Sport }
  | { type: "error"; error: string };
