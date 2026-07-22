import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DomesticMetricDefinition } from "../../shared/src/domesticFootballScoring";
import type { FootballCompetition } from "../../shared/src/footballCompetitions";
import type { SoccerRole } from "../../shared/src/types";

export const ROOT = resolve(import.meta.dirname, "../..");
export const CACHE_ROOT = resolve(ROOT, ".cache/football-data");
export const OUTPUT_ROOT = resolve(ROOT, "shared/src/domesticFootball");

export interface LeagueConfig {
  competition: Exclude<FootballCompetition, "uefa-all-time">;
  exportName: string;
  runtimeName: string;
  label: string;
  poolVersion: string;
  clubs: number;
  matches: number;
  sourceHome: string;
  metrics: readonly DomesticMetricDefinition[];
}

export interface RawSource {
  url: string;
  retrievedAt: string;
  contentHash: string;
  cachePath: string;
}

export interface NormalizedClub {
  id: string;
  name: string;
  code: string;
  points: number;
  matches: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface NormalizedPlayer {
  id: string;
  identity: string;
  name: string;
  role: SoccerRole;
  officialPosition: string;
  clubId: string;
  clubName: string;
  clubCode: string;
  starts: number;
  minutes: number;
  appearances: number;
  totals: Record<string, number | undefined>;
  metrics: Record<string, number | undefined>;
  sources: string[];
}

export interface LeagueSnapshot {
  config: LeagueConfig;
  clubs: NormalizedClub[];
  players: NormalizedPlayer[];
  matchIds: string[];
  sources: RawSource[];
}

export const COMMON_METRICS: readonly DomesticMetricDefinition[] = [
  { key: "goalsPer90", category: "attack", direction: "higher", roles: ["DEF", "MID", "ATT"], weight: 3 },
  { key: "shotsOnTargetPer90", category: "attack", direction: "higher", roles: ["MID", "ATT"], weight: 1.5 },
  { key: "shotAccuracyPct", category: "attack", direction: "higher", roles: ["MID", "ATT"], weight: 1 },
  { key: "assistsPer90", category: "creation", direction: "higher", roles: ["DEF", "MID", "ATT"], weight: 2.5 },
  { key: "keyPassesPer90", category: "creation", direction: "higher", roles: ["DEF", "MID", "ATT"], weight: 2 },
  { key: "passCompletionPct", category: "control", direction: "higher", roles: ["GK", "DEF", "MID", "ATT"], weight: 2 },
  { key: "forwardPassesPer90", category: "control", direction: "higher", roles: ["DEF", "MID", "ATT"], weight: 2 },
  { key: "tacklesWonPer90", category: "defense", direction: "higher", roles: ["DEF", "MID", "ATT"], weight: 2.5 },
  { key: "interceptionsPer90", category: "defense", direction: "higher", roles: ["DEF", "MID"], weight: 2 },
  { key: "recoveriesPer90", category: "defense", direction: "higher", roles: ["DEF", "MID", "ATT"], weight: 1.5 },
  { key: "clearancesPer90", category: "defense", direction: "higher", roles: ["GK", "DEF"], weight: 1.5 },
  { key: "savePct", category: "goalkeeping", direction: "higher", roles: ["GK"], weight: 4 },
  { key: "cleanSheetPct", category: "goalkeeping", direction: "higher", roles: ["GK"], weight: 2.5 },
  { key: "goalsConcededPerMatch", category: "goalkeeping", direction: "lower", roles: ["GK"], weight: 2 },
  { key: "claimsPer90", category: "goalkeeping", direction: "higher", roles: ["GK"], weight: 1 },
] as const;

export function finite(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function per90(value: unknown, minutes: number): number | undefined {
  const parsed = finite(value);
  return parsed === undefined || minutes <= 0 ? undefined : (parsed * 90) / minutes;
}

export function percentage(part: unknown, whole: unknown): number | undefined {
  const numerator = finite(part);
  const denominator = finite(whole);
  return numerator === undefined || denominator === undefined || denominator <= 0
    ? undefined
    : (numerator / denominator) * 100;
}

export function roleFromOfficial(value: unknown): SoccerRole {
  const label = String(value ?? "").trim().toLowerCase();
  if (["goalkeeper", "portero", "torwart", "gardien"].includes(label)) return "GK";
  if (["defender", "defensa", "abwehr", "défenseur", "defenseur"].includes(label)) return "DEF";
  if (["midfielder", "centrocampista", "mittelfeld", "milieu"].includes(label)) return "MID";
  if (["forward", "striker", "delantero", "angriff", "attaquant"].includes(label)) return "ATT";
  throw new Error(`Unsupported official position label: ${String(value)}`);
}

export function shortCode(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
}

export function statMap(entries: unknown, key = "name", value = "stat"): Record<string, number> {
  if (!Array.isArray(entries)) return {};
  return Object.fromEntries(entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const metric = String(row[key] ?? "");
    const amount = finite(row[value]);
    return metric && amount !== undefined ? [[metric, amount]] : [];
  }));
}

export async function cachedFetch(
  league: string,
  key: string,
  url: string,
  options: RequestInit = {},
  offline = false
): Promise<{ body: string; source: RawSource }> {
  const cachePath = resolve(CACHE_ROOT, league, `${key}.cache`);
  const metaPath = `${cachePath}.json`;
  let body: string;
  let retrievedAt = new Date().toISOString();
  try {
    if (!offline) throw new Error("refresh");
    body = await readFile(cachePath, "utf8");
    try {
      const metadata = JSON.parse(await readFile(metaPath, "utf8")) as { retrievedAt?: string };
      retrievedAt = metadata.retrievedAt ?? "offline-cache";
    } catch {
      retrievedAt = (await stat(cachePath)).mtime.toISOString();
    }
  } catch {
    if (offline) throw new Error(`Missing offline cache: ${cachePath}`);
    let response: Response | null = null;
    let networkError: unknown;
    for (let attempt = 0; attempt < 7; attempt += 1) {
      try {
        response = await fetch(url, options);
        networkError = undefined;
      } catch (error) {
        networkError = error;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(20_000, 750 * 2 ** attempt)));
        continue;
      }
      if (response.ok) break;
      if (response.status !== 429 && response.status < 500) break;
      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(20_000, 750 * 2 ** attempt);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    }
    if (!response?.ok) {
      const detail = networkError instanceof Error ? networkError.message : response?.statusText ?? "error";
      throw new Error(`${response?.status ?? "network"} ${detail}: ${url}`);
    }
    body = await response.text();
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, body);
    await writeFile(metaPath, `${JSON.stringify({ retrievedAt, url }, null, 2)}\n`);
  }
  return {
    body,
    source: {
      url,
      retrievedAt,
      contentHash: createHash("sha256").update(body).digest("hex"),
      cachePath: cachePath.slice(ROOT.length + 1),
    },
  };
}

export async function mapConcurrent<T, R>(values: readonly T[], concurrency: number, fn: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await fn(values[index], index);
    }
  }));
  return output;
}

export function validateSnapshot(snapshot: LeagueSnapshot): void {
  const { config, clubs, players, matchIds } = snapshot;
  if (clubs.length !== config.clubs) throw new Error(`${config.label}: expected ${config.clubs} clubs, found ${clubs.length}`);
  if (matchIds.length !== config.matches || new Set(matchIds).size !== config.matches) {
    throw new Error(`${config.label}: expected ${config.matches} unique finished matches, found ${new Set(matchIds).size}`);
  }
  const clubIds = new Set(clubs.map((club) => club.id));
  for (const club of clubs) {
    const selected = players.filter((player) => player.clubId === club.id);
    if (selected.length !== 11) throw new Error(`${config.label}: ${club.name} has ${selected.length} selected players, expected 11`);
  }
  if (players.length !== config.clubs * 11) throw new Error(`${config.label}: expected ${config.clubs * 11} cards, found ${players.length}`);
  if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error(`${config.label}: duplicate card IDs`);
  for (const player of players) {
    if (!clubIds.has(player.clubId)) throw new Error(`${config.label}: unknown club for ${player.name}`);
    if (!player.name || !player.identity || player.starts <= 0 || player.minutes < 0 || player.appearances < player.starts) {
      throw new Error(`${config.label}: invalid starter record for ${player.name || player.id}`);
    }
    roleFromOfficial(player.officialPosition);
    for (const [key, value] of Object.entries(player.metrics)) {
      if (value !== undefined && !Number.isFinite(value)) throw new Error(`${config.label}: non-finite ${key} for ${player.name}`);
    }
    const missingScoringMetrics = config.metrics
      .filter((definition) => definition.roles.includes(player.role))
      .filter((definition) => !Number.isFinite(player.metrics[definition.key]));
    if (missingScoringMetrics.length > 0) {
      throw new Error(`${config.label}: ${player.name} is missing formula inputs ${missingScoringMetrics.map((definition) => definition.key).join(", ")}`);
    }
    const goals = finite(player.totals.goals ?? player.totals.totalGoals ?? player.totals.shotsAtGoalSuccessful);
    const shotsOnTarget = finite(player.totals.shotsOnTarget ?? player.totals.totalShotsOnTarget);
    const shots = finite(player.totals.shots ?? player.totals.totalShots);
    if ((goals ?? 0) > 0 && shotsOnTarget === undefined) {
      throw new Error(`${config.label}: missing shots on target for goal scorer ${player.name}`);
    }
    if (goals !== undefined && shotsOnTarget !== undefined && shotsOnTarget < goals) {
      throw new Error(`${config.label}: shots on target (${shotsOnTarget}) are lower than goals (${goals}) for ${player.name}`);
    }
    if (shots !== undefined && shotsOnTarget !== undefined && shotsOnTarget > shots) {
      throw new Error(`${config.label}: shots on target (${shotsOnTarget}) exceed total shots (${shots}) for ${player.name}`);
    }
  }
  const roleCounts = Object.fromEntries(["GK", "DEF", "MID", "ATT"].map((role) => [role, players.filter((player) => player.role === role).length]));
  if (roleCounts.GK < 3 || roleCounts.DEF < 4 || roleCounts.MID < 4 || roleCounts.ATT < 7) {
    throw new Error(`${config.label}: insufficient pool role coverage ${JSON.stringify(roleCounts)}`);
  }

  const categoryRequirements: Record<SoccerRole, Partial<Record<DomesticMetricDefinition["category"], number>>> = {
    GK: { goalkeeping: 2 },
    DEF: { control: 1, defense: 2 },
    MID: { attack: 1, creation: 1, control: 1, defense: 1 },
    ATT: { attack: 2, creation: 1, control: 1 },
  };
  for (const role of ["GK", "DEF", "MID", "ATT"] as const) {
    const rolePlayers = players.filter((player) => player.role === role);
    for (const [category, minimum] of Object.entries(categoryRequirements[role])) {
      const sufficientlyCovered = config.metrics.filter((definition) => (
        definition.category === category
        && definition.roles.includes(role)
        && rolePlayers.filter((player) => Number.isFinite(player.metrics[definition.key])).length / rolePlayers.length >= 0.8
      )).length;
      if (sufficientlyCovered < minimum) {
        throw new Error(`${config.label}: ${role} requires ${minimum} well-covered ${category} metrics, found ${sufficientlyCovered}`);
      }
    }
  }
}
