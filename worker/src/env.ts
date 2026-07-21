import type { AccountDO } from "./accountDO";
import type { MatchmakingDO } from "./matchmakingDO";
import type { RoomDO } from "./roomDO";

export interface Env {
  ACCOUNTS: DurableObjectNamespace<AccountDO>;
  ROOMS: DurableObjectNamespace<RoomDO>;
  MATCHMAKING: DurableObjectNamespace<MatchmakingDO>;
  ROOM_CREATE_LIMITER: RateLimit;
  MATCHMAKING_LIMITER: RateLimit;
  FRONTEND_ORIGIN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}
