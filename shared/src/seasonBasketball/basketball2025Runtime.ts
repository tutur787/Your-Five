import { buildBasketballPoolFrom } from "../gameEngine";
import type { BasketballPlayerCard } from "../types";
import type { SportRuntime } from "../runtimeTypes";
import { BASKETBALL_POOL_VERSIONS } from "../basketballCompetitions";
import { BASKETBALL_2025_DATABASE } from "./basketball2025Data";

export const BASKETBALL_2025_POOL_VERSION = BASKETBALL_POOL_VERSIONS["nba-2025-26"];

export function attachBasketball2025Chemistry(players: readonly BasketballPlayerCard[]): BasketballPlayerCard[] {
  return players.map((player) => ({
    ...player,
    chemistryWith: player.chemistryWith?.filter((id) => players.some((candidate) => candidate.id === id)) ?? [],
  }));
}

const DATABASE = attachBasketball2025Chemistry(BASKETBALL_2025_DATABASE);

export const BASKETBALL_2025_RUNTIME: SportRuntime = {
  sport: "basketball",
  competition: "nba-2025-26",
  poolVersion: BASKETBALL_2025_POOL_VERSION,
  database: DATABASE,
  buildPool: (rng) => attachBasketball2025Chemistry(buildBasketballPoolFrom(DATABASE, rng)),
};
