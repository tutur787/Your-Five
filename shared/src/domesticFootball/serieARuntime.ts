import { buildSoccerPoolFrom } from "../gameEngine";
import type { SportRuntime } from "../runtimeTypes";
import { SERIE_A_PLAYER_DATABASE } from "./serieA.generated";

export const SERIE_A_RUNTIME: SportRuntime = {
  sport: "soccer",
  competition: "serie-a-2025-26",
  poolVersion: "serie-a-2025-26-v1",
  database: SERIE_A_PLAYER_DATABASE,
  buildPool: (rng) => buildSoccerPoolFrom(SERIE_A_PLAYER_DATABASE, rng),
};
