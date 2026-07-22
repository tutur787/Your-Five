import { buildSoccerPoolFrom } from "../gameEngine";
import type { SportRuntime } from "../runtimeTypes";
import { PREMIER_LEAGUE_PLAYER_DATABASE } from "./premierLeague.generated";

export const PREMIER_LEAGUE_RUNTIME: SportRuntime = {
  sport: "soccer",
  competition: "premier-league-2025-26",
  poolVersion: "premier-league-2025-26-v1",
  database: PREMIER_LEAGUE_PLAYER_DATABASE,
  buildPool: (rng) => buildSoccerPoolFrom(PREMIER_LEAGUE_PLAYER_DATABASE, rng),
};
