import { buildBasketballPoolFrom } from "./gameEngine";
import { areTeammates, PLAYER_DATABASE } from "./players";
import type { BasketballPlayerCard } from "./types";
import type { SportRuntime } from "./runtimeTypes";

export const BASKETBALL_POOL_VERSION = "nba-v1";

export function attachBasketballChemistry(players: readonly BasketballPlayerCard[]): BasketballPlayerCard[] {
  return players.map((player) => ({
    ...player,
    chemistryWith: players
      .filter((candidate) => candidate.id !== player.id && areTeammates(player.name, candidate.name))
      .map((candidate) => candidate.id),
  }));
}

const BASKETBALL_DATABASE_WITH_CHEMISTRY = attachBasketballChemistry(PLAYER_DATABASE);

export const BASKETBALL_RUNTIME: SportRuntime = {
  sport: "basketball",
  poolVersion: BASKETBALL_POOL_VERSION,
  database: BASKETBALL_DATABASE_WITH_CHEMISTRY,
  buildPool: (rng) => attachBasketballChemistry(buildBasketballPoolFrom(BASKETBALL_DATABASE_WITH_CHEMISTRY, rng)),
};
