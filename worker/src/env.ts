import type { MatchmakingDO } from "./matchmakingDO";
import type { RoomDO } from "./roomDO";

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  MATCHMAKING: DurableObjectNamespace<MatchmakingDO>;
  ROOM_CREATE_LIMITER: RateLimit;
  MATCHMAKING_LIMITER: RateLimit;
}
