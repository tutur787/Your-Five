import type { MatchmakingDO } from "./matchmakingDO";
import type { RoomDO } from "./roomDO";

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  MATCHMAKING: DurableObjectNamespace<MatchmakingDO>;
}
