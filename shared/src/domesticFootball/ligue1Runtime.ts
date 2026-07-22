import { buildSoccerPoolFrom } from "../gameEngine";
import type { SportRuntime } from "../runtimeTypes";
import { LIGUE_1_PLAYER_DATABASE } from "./ligue1.generated";

export const LIGUE_1_RUNTIME: SportRuntime = {
  sport: "soccer",
  competition: "ligue-1-2025-26",
  poolVersion: "ligue-1-2025-26-v1",
  database: LIGUE_1_PLAYER_DATABASE,
  buildPool: (rng) => buildSoccerPoolFrom(LIGUE_1_PLAYER_DATABASE, rng),
};
