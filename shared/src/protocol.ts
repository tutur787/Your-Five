import { MatchAction, MatchState, SeatId, Sport } from "./types";
import type { FootballCompetition, FootballCompetitionChoice } from "./footballCompetitions";

/** Whether both seats in a room currently have a connected player. */
export interface SeatsFilled {
  A: boolean;
  B: boolean;
}

export type RoomKind = "private" | "matched";

export interface RoomMetadata {
  competition?: FootballCompetition;
  competitionChoice?: FootballCompetitionChoice;
  seatsFilled: SeatsFilled;
  seatNames: Partial<Record<SeatId, string>>;
  rematchReady: SeatsFilled;
  serverNow: number;
  turnDeadlineAt: number | null;
  reconnectingSeat: SeatId | null;
  reconnectDeadlineAt: number | null;
}

// --- /room/:code messages ---

/** Sent by the client over the room WebSocket. Every message carries a client-generated `id` so the
 * matching server ack can be correlated back to the right pending promise (raw WebSocket has no
 * built-in ack mechanism the way Socket.IO did). */
export type RoomClientMessage =
  | { id: string; type: "startDraft" }
  | { id: string; type: "setNickname"; nickname: string }
  | { id: string; type: "setRematchReady"; ready: boolean }
  | { id: string; type: "action"; action: MatchAction };

/** Sent by the server over the room WebSocket. */
export type RoomServerMessage =
  | { type: "joined"; seat: SeatId; token: string; sport: Sport; competition?: FootballCompetition; roomKind: RoomKind; state: MatchState | null; seatsFilled: SeatsFilled; metadata?: RoomMetadata }
  | { type: "state"; state: MatchState; metadata?: RoomMetadata }
  | { type: "roomUpdate"; seatsFilled: SeatsFilled; metadata?: RoomMetadata }
  | { type: "opponentLeft"; seat: SeatId; reconnectDeadlineAt?: number | null }
  | { type: "matchCancelled"; reason: "opponent_no_show" }
  | { type: "ack"; id: string; ok: boolean; error?: string }
  | { type: "error"; error: string };

// --- /matchmaking messages ---
// No client->server message type is needed: connecting to the socket IS "find a match," and closing
// it IS "cancel matchmaking" — the server only needs to react to open/close, never a payload.

/** Sent by the server over the matchmaking WebSocket. */
export type MatchmakingServerMessage =
  | { type: "waiting" }
  | {
      type: "matchFound";
      code: string;
      seat: SeatId;
      token: string;
      sport: Sport;
      competition?: FootballCompetition;
      competitionDraw?: {
        choices: [FootballCompetition, FootballCompetition];
        selected: FootballCompetition;
        durationMs: number;
      };
    }
  | { type: "error"; error: string };
