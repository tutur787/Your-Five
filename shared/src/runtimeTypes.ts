import type { PlayerCard, Sport } from "./types";
import type { Rng } from "./gameEngine";

export interface SportRuntime {
  sport: Sport;
  poolVersion: string;
  database: readonly PlayerCard[];
  buildPool: (rng?: Rng) => PlayerCard[];
}

export const POOL_VERSIONS: Record<Sport, string> = {
  basketball: "nba-v1",
  soccer: "uefa-v1",
};
