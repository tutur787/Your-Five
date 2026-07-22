import { buildSoccerPoolFrom } from "../gameEngine";
import type { SportRuntime } from "../runtimeTypes";
import { LALIGA_PLAYER_DATABASE } from "./laliga.generated";

export const LALIGA_RUNTIME: SportRuntime = {
  sport: "soccer",
  competition: "laliga-2025-26",
  poolVersion: "laliga-2025-26-v3",
  database: LALIGA_PLAYER_DATABASE,
  buildPool: (rng) => buildSoccerPoolFrom(LALIGA_PLAYER_DATABASE, rng),
};
