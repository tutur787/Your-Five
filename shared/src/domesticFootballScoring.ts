import type { SoccerPerformance, SoccerRole } from "./types";

export type DomesticMetricDirection = "higher" | "lower";

export interface DomesticMetricDefinition {
  key: string;
  category: keyof Pick<SoccerPerformance, "attack" | "creation" | "control" | "defense" | "goalkeeping">;
  direction: DomesticMetricDirection;
  roles: readonly SoccerRole[];
  weight: number;
}

export interface DomesticScoringCard {
  id: string;
  role: SoccerRole;
  starts: number;
  metrics: Readonly<Record<string, number | undefined>>;
}

export interface DomesticScoringResult {
  quality: number;
  performance: Pick<SoccerPerformance, "attack" | "creation" | "control" | "defense" | "goalkeeping">;
  metricPercentiles: Record<string, number>;
  reliability: number;
}

const CATEGORIES = ["attack", "creation", "control", "defense", "goalkeeping"] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function percentile(value: number, population: readonly number[], direction: DomesticMetricDirection): number {
  if (population.length <= 1) return 50;
  const below = population.filter((candidate) => candidate < value).length;
  const equal = population.filter((candidate) => candidate === value).length;
  const ascending = ((below + Math.max(0, equal - 1) / 2) / (population.length - 1)) * 100;
  return direction === "higher" ? ascending : 100 - ascending;
}

function weightedMean(values: Array<{ value: number; weight: number }>, fallback = 50): number {
  const weight = values.reduce((sum, entry) => sum + entry.weight, 0);
  return weight > 0 ? values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / weight : fallback;
}

/** Scores one completed domestic league on one complete, league-and-role-specific metric set. */
export function scoreDomesticLeague(
  cards: readonly DomesticScoringCard[],
  definitions: readonly DomesticMetricDefinition[]
): Map<string, DomesticScoringResult> {
  const results = new Map<string, DomesticScoringResult>();
  for (const card of cards) {
    const applicable = definitions.filter((definition) => definition.roles.includes(card.role));
    const missing = applicable.filter((definition) => !Number.isFinite(card.metrics[definition.key]));
    if (missing.length > 0) {
      throw new Error(`${card.id}: missing scoring metrics ${missing.map((definition) => definition.key).join(", ")}`);
    }
    const reliability = clamp(card.starts / 20, 0, 1);
    const metricPercentiles: Record<string, number> = {};

    for (const definition of applicable) {
      const value = card.metrics[definition.key]!;
      const population = cards
        .filter((candidate) => candidate.role === card.role)
        .map((candidate) => candidate.metrics[definition.key])
        .filter((candidate): candidate is number => candidate !== undefined && Number.isFinite(candidate));
      const observed = percentile(value, population, definition.direction);
      metricPercentiles[definition.key] = 50 + (observed - 50) * reliability;
    }

    const categoryValues = Object.fromEntries(CATEGORIES.map((category) => {
      const values = applicable
        .filter((definition) => definition.category === category && metricPercentiles[definition.key] !== undefined)
        .map((definition) => ({ value: metricPercentiles[definition.key], weight: definition.weight }));
      return [category, weightedMean(values) / 5];
    })) as DomesticScoringResult["performance"];

    const qualityPercentile = weightedMean(applicable
      .map((definition) => ({ value: metricPercentiles[definition.key], weight: definition.weight })));

    results.set(card.id, {
      quality: clamp(6 + qualityPercentile * 0.12, 6, 18),
      performance: categoryValues,
      metricPercentiles,
      reliability,
    });
  }
  return results;
}

export function domesticTeamSuccess(pointsPerMatch: number, leaguePointsPerMatch: readonly number[]): number {
  return clamp((percentile(pointsPerMatch, leaguePointsPerMatch, "higher") - 50) / 25, -2, 2);
}
