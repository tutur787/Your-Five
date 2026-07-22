import type { Rng } from "./gameEngine";

export type BasketballCompetition = "nba-all-time" | "nba-2025-26";
export type BasketballCompetitionChoice = BasketballCompetition | "random";

export const DEFAULT_BASKETBALL_COMPETITION: BasketballCompetition = "nba-all-time";
export const DEFAULT_BASKETBALL_COMPETITION_CHOICE: BasketballCompetitionChoice = DEFAULT_BASKETBALL_COMPETITION;

export const BASKETBALL_COMPETITIONS: readonly BasketballCompetition[] = [
  "nba-all-time",
  "nba-2025-26",
];

export const BASKETBALL_COMPETITION_CHOICES: readonly BasketballCompetitionChoice[] = [
  "random",
  ...BASKETBALL_COMPETITIONS,
];

export const BASKETBALL_COMPETITION_LABELS: Record<BasketballCompetitionChoice, string> = {
  random: "Random",
  "nba-all-time": "NBA All-Time",
  "nba-2025-26": "NBA 2025/26",
};

export const BASKETBALL_POOL_VERSIONS: Record<BasketballCompetition, string> = {
  "nba-all-time": "nba-v1",
  "nba-2025-26": "nba-2025-26-v1",
};

export function basketballCompetitionForPoolVersion(value: unknown): BasketballCompetition | null {
  const entry = Object.entries(BASKETBALL_POOL_VERSIONS).find(([, version]) => version === value);
  return entry ? entry[0] as BasketballCompetition : null;
}

export function basketballCompetitionLabel(value: unknown): string {
  return BASKETBALL_COMPETITION_LABELS[normalizeBasketballCompetition(value)];
}

export function isBasketballCompetition(value: unknown): value is BasketballCompetition {
  return typeof value === "string" && BASKETBALL_COMPETITIONS.includes(value as BasketballCompetition);
}

export function isBasketballCompetitionChoice(value: unknown): value is BasketballCompetitionChoice {
  return value === "random" || isBasketballCompetition(value);
}

export function normalizeBasketballCompetition(value: unknown): BasketballCompetition {
  return isBasketballCompetition(value) ? value : DEFAULT_BASKETBALL_COMPETITION;
}

export function normalizeBasketballCompetitionChoice(value: unknown): BasketballCompetitionChoice {
  return isBasketballCompetitionChoice(value) ? value : DEFAULT_BASKETBALL_COMPETITION_CHOICE;
}

export function resolveBasketballCompetition(
  choice: BasketballCompetitionChoice,
  rng: Rng = Math.random
): BasketballCompetition {
  if (choice !== "random") return choice;
  return BASKETBALL_COMPETITIONS[Math.min(BASKETBALL_COMPETITIONS.length - 1, Math.floor(rng() * BASKETBALL_COMPETITIONS.length))];
}
