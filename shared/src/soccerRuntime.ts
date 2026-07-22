import { buildSoccerPoolFrom } from "./gameEngine";
import { SOCCER_PLAYER_DATABASE } from "./soccerPlayers";
import type { SportRuntime } from "./runtimeTypes";

export const SOCCER_POOL_VERSION = "uefa-v6";

export const SOCCER_RUNTIME: SportRuntime = {
  sport: "soccer",
  competition: "uefa-all-time",
  poolVersion: SOCCER_POOL_VERSION,
  database: SOCCER_PLAYER_DATABASE,
  buildPool: (rng) => buildSoccerPoolFrom(SOCCER_PLAYER_DATABASE, rng),
};
