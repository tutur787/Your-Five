import { buildSoccerPoolFrom } from "../gameEngine";
import type { SportRuntime } from "../runtimeTypes";
import { BUNDESLIGA_PLAYER_DATABASE } from "./bundesliga.generated";

export const BUNDESLIGA_RUNTIME: SportRuntime = {
  sport: "soccer",
  competition: "bundesliga-2025-26",
  poolVersion: "bundesliga-2025-26-v1",
  database: BUNDESLIGA_PLAYER_DATABASE,
  buildPool: (rng) => buildSoccerPoolFrom(BUNDESLIGA_PLAYER_DATABASE, rng),
};
