import { buildSoccerPoolFrom } from "./gameEngine";
import { SOCCER_PLAYER_DATABASE } from "./soccerPlayers";
import type { SportRuntime } from "./runtimeTypes";

export const SOCCER_POOL_VERSION = "uefa-v1";

export const SOCCER_RUNTIME: SportRuntime = {
  sport: "soccer",
  poolVersion: SOCCER_POOL_VERSION,
  database: SOCCER_PLAYER_DATABASE,
  buildPool: (rng) => buildSoccerPoolFrom(SOCCER_PLAYER_DATABASE, rng),
};
