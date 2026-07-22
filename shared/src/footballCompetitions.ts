import type { Rng } from "./gameEngine";

export type FootballCompetition =
  | "uefa-all-time"
  | "premier-league-2025-26"
  | "laliga-2025-26"
  | "serie-a-2025-26"
  | "bundesliga-2025-26"
  | "ligue-1-2025-26";

export type FootballCompetitionChoice = FootballCompetition | "random";

export const DEFAULT_FOOTBALL_COMPETITION: FootballCompetition = "uefa-all-time";
export const DEFAULT_FOOTBALL_COMPETITION_CHOICE: FootballCompetitionChoice = DEFAULT_FOOTBALL_COMPETITION;

export const FOOTBALL_COMPETITIONS: readonly FootballCompetition[] = [
  "uefa-all-time",
  "premier-league-2025-26",
  "laliga-2025-26",
  "serie-a-2025-26",
  "bundesliga-2025-26",
  "ligue-1-2025-26",
];

export const FOOTBALL_COMPETITION_CHOICES: readonly FootballCompetitionChoice[] = [
  "random",
  ...FOOTBALL_COMPETITIONS,
];

export const FOOTBALL_COMPETITION_LABELS: Record<FootballCompetitionChoice, string> = {
  random: "Random",
  "uefa-all-time": "UEFA Champions League (All-Time)",
  "premier-league-2025-26": "Premier League 2025/26",
  "laliga-2025-26": "LaLiga 2025/26",
  "serie-a-2025-26": "Serie A 2025/26",
  "bundesliga-2025-26": "Bundesliga 2025/26",
  "ligue-1-2025-26": "Ligue 1 2025/26",
};

export const FOOTBALL_POOL_VERSIONS: Record<FootballCompetition, string> = {
  "uefa-all-time": "uefa-v6",
  "premier-league-2025-26": "premier-league-2025-26-v3",
  "laliga-2025-26": "laliga-2025-26-v3",
  "serie-a-2025-26": "serie-a-2025-26-v2",
  "bundesliga-2025-26": "bundesliga-2025-26-v3",
  "ligue-1-2025-26": "ligue-1-2025-26-v2",
};

export function footballCompetitionForPoolVersion(value: unknown): FootballCompetition | null {
  const entry = Object.entries(FOOTBALL_POOL_VERSIONS).find(([, version]) => version === value);
  return entry ? entry[0] as FootballCompetition : null;
}

export function footballCompetitionLabel(value: unknown): string {
  return FOOTBALL_COMPETITION_LABELS[normalizeFootballCompetition(value)];
}

export function isFootballCompetition(value: unknown): value is FootballCompetition {
  return typeof value === "string" && FOOTBALL_COMPETITIONS.includes(value as FootballCompetition);
}

export function isFootballCompetitionChoice(value: unknown): value is FootballCompetitionChoice {
  return value === "random" || isFootballCompetition(value);
}

export function normalizeFootballCompetition(value: unknown): FootballCompetition {
  return isFootballCompetition(value) ? value : DEFAULT_FOOTBALL_COMPETITION;
}

export function normalizeFootballCompetitionChoice(value: unknown): FootballCompetitionChoice {
  return isFootballCompetitionChoice(value) ? value : DEFAULT_FOOTBALL_COMPETITION_CHOICE;
}

export function resolveFootballCompetition(
  choice: FootballCompetitionChoice,
  rng: Rng = Math.random
): FootballCompetition {
  if (choice !== "random") return choice;
  return FOOTBALL_COMPETITIONS[Math.min(FOOTBALL_COMPETITIONS.length - 1, Math.floor(rng() * FOOTBALL_COMPETITIONS.length))];
}
