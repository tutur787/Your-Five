import type { PlayerCard, Sport } from "./types";
import type { Rng } from "./gameEngine";
import type { Competition } from "./competitions";
import { BASKETBALL_POOL_VERSIONS } from "./basketballCompetitions";
import { FOOTBALL_POOL_VERSIONS } from "./footballCompetitions";

export interface SportRuntime {
  sport: Sport;
  /** Always resolved for competition-aware runtimes, never `random`. */
  competition?: Competition;
  poolVersion: string;
  database: readonly PlayerCard[];
  buildPool: (rng?: Rng) => PlayerCard[];
}

export const POOL_VERSIONS: Record<Sport, string> = {
  basketball: BASKETBALL_POOL_VERSIONS["nba-all-time"],
  soccer: FOOTBALL_POOL_VERSIONS["uefa-all-time"],
};
