import {
  basketballCompetitionForPoolVersion,
  basketballCompetitionLabel,
  normalizeBasketballCompetition,
  normalizeBasketballCompetitionChoice,
  resolveBasketballCompetition,
  type BasketballCompetition,
  type BasketballCompetitionChoice,
} from "./basketballCompetitions";
import {
  footballCompetitionForPoolVersion,
  footballCompetitionLabel,
  normalizeFootballCompetition,
  normalizeFootballCompetitionChoice,
  resolveFootballCompetition,
  type FootballCompetition,
  type FootballCompetitionChoice,
} from "./footballCompetitions";
import type { Rng } from "./gameEngine";

export type Competition = BasketballCompetition | FootballCompetition;
export type CompetitionChoice = BasketballCompetitionChoice | FootballCompetitionChoice;

export function competitionForSport(
  sport: "basketball" | "soccer",
  value: unknown
): Competition {
  return sport === "soccer" ? normalizeFootballCompetition(value) : normalizeBasketballCompetition(value);
}

export function competitionChoiceForSport(
  sport: "basketball" | "soccer",
  value: unknown
): CompetitionChoice {
  return sport === "soccer" ? normalizeFootballCompetitionChoice(value) : normalizeBasketballCompetitionChoice(value);
}

export function resolveCompetitionForSport(
  sport: "basketball" | "soccer",
  choice: CompetitionChoice,
  rng: Rng = Math.random
): Competition {
  return sport === "soccer"
    ? resolveFootballCompetition(normalizeFootballCompetitionChoice(choice), rng)
    : resolveBasketballCompetition(normalizeBasketballCompetitionChoice(choice), rng);
}

export function competitionLabel(sport: "basketball" | "soccer", value: unknown): string {
  return sport === "soccer" ? footballCompetitionLabel(value) : basketballCompetitionLabel(value);
}

export function competitionForPoolVersion(
  sport: "basketball" | "soccer",
  version: unknown
): Competition | null {
  return sport === "soccer"
    ? footballCompetitionForPoolVersion(version)
    : basketballCompetitionForPoolVersion(version);
}
