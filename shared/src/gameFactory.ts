import { seededRng } from "./dailySeed";
import { createMatchFromPool, type Rng } from "./gameEngine";
import { BASKETBALL_RUNTIME } from "./basketballRuntime";
import { SOCCER_RUNTIME } from "./soccerRuntime";
import type { BasketballPlayerCard, MatchState, PlayerCard, SoccerPlayerCard, Sport } from "./types";
import { POOL_VERSIONS, type SportRuntime } from "./runtimeTypes";
import { normalizeFootballCompetition, type FootballCompetition } from "./footballCompetitions";

export { POOL_VERSIONS };

function randomIdentifier(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function runtimeForSport(sport: Sport, competition?: FootballCompetition): SportRuntime {
  if (sport === "soccer" && normalizeFootballCompetition(competition) !== "uefa-all-time") {
    throw new Error("Domestic football runtimes must be loaded through their competition-specific module.");
  }
  return sport === "soccer" ? SOCCER_RUNTIME : BASKETBALL_RUNTIME;
}

export function buildPool(rng?: Rng): BasketballPlayerCard[];
export function buildPool(sport: "basketball", rng?: Rng): BasketballPlayerCard[];
export function buildPool(sport: "soccer", rng?: Rng): SoccerPlayerCard[];
export function buildPool(sport: Sport, rng?: Rng): PlayerCard[];
export function buildPool(sportOrRng: Sport | Rng = "basketball", maybeRng?: Rng): PlayerCard[] {
  const sport = typeof sportOrRng === "function" ? "basketball" : sportOrRng;
  const rng = typeof sportOrRng === "function" ? sportOrRng : maybeRng;
  return runtimeForSport(sport).buildPool(rng);
}

export function createMatch(rng?: Rng): MatchState;
export function createMatch(sport: Sport, rng?: Rng): MatchState;
export function createMatch(sportOrRng: Sport | Rng = "basketball", maybeRng?: Rng): MatchState {
  const sport = typeof sportOrRng === "function" ? "basketball" : sportOrRng;
  const suppliedRng = typeof sportOrRng === "function" ? sportOrRng : maybeRng;
  const poolSeed = suppliedRng ? undefined : randomIdentifier();
  const runtime = runtimeForSport(sport);
  return createMatchFromPool(sport, runtime.buildPool(suppliedRng ?? seededRng(poolSeed as string)), {
    matchId: randomIdentifier(),
    poolSeed,
    poolVersion: runtime.poolVersion,
    competition: runtime.competition,
  });
}

export function createSeededMatch(sport: Sport, poolSeed: string, matchId = randomIdentifier()): MatchState {
  const runtime = runtimeForSport(sport);
  return createMatchFromPool(sport, runtime.buildPool(seededRng(poolSeed)), {
    matchId,
    poolSeed,
    poolVersion: runtime.poolVersion,
    competition: runtime.competition,
  });
}
