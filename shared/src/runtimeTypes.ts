import type { PlayerCard, Sport } from "./types";
import type { Rng } from "./gameEngine";
import type { FootballCompetition } from "./footballCompetitions";
import { FOOTBALL_POOL_VERSIONS } from "./footballCompetitions";

export interface SportRuntime {
  sport: Sport;
  /** Present for football runtimes and always resolved, never `random`. */
  competition?: FootballCompetition;
  poolVersion: string;
  database: readonly PlayerCard[];
  buildPool: (rng?: Rng) => PlayerCard[];
}

export const POOL_VERSIONS: Record<Sport, string> = {
  basketball: "nba-v1",
  soccer: FOOTBALL_POOL_VERSIONS["uefa-all-time"],
};
