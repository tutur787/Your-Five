import type { SoccerRole } from "../../shared/src/types";
import {
  CACHE_ROOT,
  COMMON_METRICS,
  cachedFetch,
  finite,
  mapConcurrent,
  per90,
  percentage,
  roleFromOfficial,
  shortCode,
  statMap,
  type LeagueConfig,
  type LeagueSnapshot,
  type NormalizedClub,
  type NormalizedPlayer,
  type RawSource,
} from "./model";

const JSON_HEADERS = { Accept: "application/json" };
const LALIGA_HEADERS = { Accept: "application/json", "Ocp-Apim-Subscription-Key": "c13c3a8e2f6b46da9c5c425cf61fab3e" };
const SERIE_HEADERS = { Accept: "text/plain", "x-api-version": "1.0" };
const LIGUE_HEADERS = { application: "ligue1", platform: "web", "client-version": "4.0.0", "client-language": "en-GB" };

const BUNDESLIGA_METRICS = [
  { key: "goalsPerAppearance", category: "attack", direction: "higher", roles: ["DEF", "MID", "ATT"], weight: 3 },
  { key: "shotsPerAppearance", category: "attack", direction: "higher", roles: ["MID", "ATT"], weight: 1.5 },
  { key: "assistsPerAppearance", category: "creation", direction: "higher", roles: ["DEF", "MID", "ATT"], weight: 2.5 },
  // The official ranking only publishes pass completion for a qualifying subset. Using it would
  // make missingness depend on performance, so it remains display-only and is excluded from scoring.
  { key: "ballActionsPerAppearance", category: "control", direction: "higher", roles: ["DEF", "MID", "ATT"], weight: 1.5 },
  { key: "tacklesWonPerAppearance", category: "defense", direction: "higher", roles: ["DEF", "MID", "ATT"], weight: 2.5 },
  { key: "aerialDuelsWonPerAppearance", category: "defense", direction: "higher", roles: ["DEF", "MID", "ATT"], weight: 1.5 },
  { key: "savesPerAppearance", category: "goalkeeping", direction: "higher", roles: ["GK"], weight: 4 },
  { key: "cleanSheetPct", category: "goalkeeping", direction: "higher", roles: ["GK"], weight: 2.5 },
  { key: "goalsConcededPerMatch", category: "goalkeeping", direction: "lower", roles: ["GK"], weight: 2 },
] as const satisfies LeagueConfig["metrics"];

const CONFIGS = {
  premierLeague: {
    competition: "premier-league-2025-26", exportName: "PREMIER_LEAGUE_PLAYER_DATABASE", runtimeName: "PREMIER_LEAGUE_RUNTIME",
    label: "Premier League 2025-26", poolVersion: "premier-league-2025-26-v1", clubs: 20, matches: 380,
    sourceHome: "https://www.premierleague.com/stats/top/players/appearances", metrics: COMMON_METRICS,
  },
  laliga: {
    competition: "laliga-2025-26", exportName: "LALIGA_PLAYER_DATABASE", runtimeName: "LALIGA_RUNTIME",
    label: "LaLiga 2025-26", poolVersion: "laliga-2025-26-v1", clubs: 20, matches: 380,
    sourceHome: "https://www.laliga.com/en-GB/stats/laliga-easports/scorers", metrics: COMMON_METRICS,
  },
  serieA: {
    competition: "serie-a-2025-26", exportName: "SERIE_A_PLAYER_DATABASE", runtimeName: "SERIE_A_RUNTIME",
    label: "Serie A 2025-26", poolVersion: "serie-a-2025-26-v1", clubs: 20, matches: 380,
    sourceHome: "https://www.legaseriea.it/serie-a/statistiche/index", metrics: COMMON_METRICS,
  },
  bundesliga: {
    competition: "bundesliga-2025-26", exportName: "BUNDESLIGA_PLAYER_DATABASE", runtimeName: "BUNDESLIGA_RUNTIME",
    label: "Bundesliga 2025-26", poolVersion: "bundesliga-2025-26-v1", clubs: 18, matches: 306,
    sourceHome: "https://www.bundesliga.com/en/bundesliga/stats/players", metrics: BUNDESLIGA_METRICS,
  },
  ligue1: {
    competition: "ligue-1-2025-26", exportName: "LIGUE_1_PLAYER_DATABASE", runtimeName: "LIGUE_1_RUNTIME",
    label: "Ligue 1 2025-26", poolVersion: "ligue-1-2025-26-v1", clubs: 18, matches: 306,
    sourceHome: "https://ligue1.com/en/articles/l1_article_5183-ligue-1-mcdonald-s-2025-26-the-key-player-stats", metrics: COMMON_METRICS,
  },
} as const satisfies Record<string, LeagueConfig>;

export type SourceKey = keyof typeof CONFIGS;
export const LEAGUE_CONFIGS = CONFIGS;

function json(body: string, label: string): any {
  try { return JSON.parse(body); } catch { throw new Error(`${label}: official source returned invalid JSON`); }
}

function normalizedName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tallyResult(clubs: Map<string, NormalizedClub>, homeId: string, awayId: string, homeScore: number, awayScore: number): void {
  const home = clubs.get(homeId);
  const away = clubs.get(awayId);
  if (!home || !away) throw new Error(`Unknown club in match: ${homeId} v ${awayId}`);
  home.matches += 1;
  away.matches += 1;
  home.goalsFor += homeScore;
  home.goalsAgainst += awayScore;
  away.goalsFor += awayScore;
  away.goalsAgainst += homeScore;
  home.points += homeScore > awayScore ? 3 : homeScore === awayScore ? 1 : 0;
  away.points += awayScore > homeScore ? 3 : homeScore === awayScore ? 1 : 0;
}

interface StartRecord {
  sourceId: string;
  identity: string;
  name: string;
  officialPosition: string;
  clubId: string;
  clubName: string;
  clubCode: string;
  starts: number;
  appearances: number;
  minutes: number;
  sourceUrls: Set<string>;
  aggregate?: Record<string, number>;
}

function addStart(map: Map<string, StartRecord>, row: Omit<StartRecord, "starts" | "appearances" | "minutes" | "sourceUrls"> & { minutes?: number; sourceUrl: string; aggregate?: Record<string, number> }): void {
  const key = `${row.clubId}:${row.sourceId}`;
  const current = map.get(key);
  if (current) {
    current.starts += 1;
    current.appearances += 1;
    current.minutes += row.minutes ?? 0;
    current.sourceUrls.add(row.sourceUrl);
    if (row.aggregate) {
      current.aggregate ??= {};
      for (const [metric, value] of Object.entries(row.aggregate)) current.aggregate[metric] = (current.aggregate[metric] ?? 0) + value;
    }
  } else {
    map.set(key, {
      ...row,
      starts: 1,
      appearances: 1,
      minutes: row.minutes ?? 0,
      sourceUrls: new Set([row.sourceUrl]),
      aggregate: row.aggregate ? { ...row.aggregate } : undefined,
    });
  }
}

function selectTopEleven(records: Iterable<StartRecord>): StartRecord[] {
  const byClub = new Map<string, StartRecord[]>();
  for (const record of records) byClub.set(record.clubId, [...(byClub.get(record.clubId) ?? []), record]);
  return [...byClub.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([, players]) => players
    .sort((a, b) => b.starts - a.starts || b.minutes - a.minutes || b.appearances - a.appearances || a.sourceId.localeCompare(b.sourceId))
    .slice(0, 11));
}

function metricsFromTotals(stats: Record<string, number>, minutes: number, appearances: number): Record<string, number | undefined> {
  const goals = stats.goals ?? stats.totalGoals ?? stats.shotsAtGoalSuccessful;
  const assists = stats.assists ?? stats.totalAssists;
  const shotsOnTarget = stats.shotsOnTarget ?? stats.totalShotsOnTarget;
  const shots = stats.shots ?? stats.totalShots;
  const passes = stats.passes ?? stats.totalPasses;
  const accuratePasses = stats.accuratePasses;
  const saves = stats.saves;
  const shotsFaced = stats.shotsFaced ?? (saves !== undefined && stats.goalsConceded !== undefined ? saves + stats.goalsConceded : undefined);
  return {
    goalsPerAppearance: appearances > 0 && goals !== undefined ? goals / appearances : undefined,
    assistsPerAppearance: appearances > 0 && assists !== undefined ? assists / appearances : undefined,
    shotsPerAppearance: appearances > 0 && shots !== undefined ? shots / appearances : undefined,
    ballActionsPerAppearance: appearances > 0 && stats.ballActions !== undefined ? stats.ballActions / appearances : undefined,
    tacklesWonPerAppearance: appearances > 0 && stats.tacklesWon !== undefined ? stats.tacklesWon / appearances : undefined,
    aerialDuelsWonPerAppearance: appearances > 0 && stats.aerialDuelsWon !== undefined ? stats.aerialDuelsWon / appearances : undefined,
    savesPerAppearance: appearances > 0 && saves !== undefined ? saves / appearances : undefined,
    goalsPer90: per90(goals, minutes),
    assistsPer90: per90(assists, minutes),
    shotsOnTargetPer90: per90(shotsOnTarget, minutes),
    shotAccuracyPct: percentage(shotsOnTarget, shots),
    keyPassesPer90: per90(stats.keyPasses, minutes),
    passCompletionPct: stats.passCompletionPct ?? percentage(accuratePasses, passes),
    progressiveActionsPer90: per90(stats.progressiveActions, minutes),
    forwardPassesPer90: per90(stats.forwardPasses, minutes),
    tacklesWonPer90: per90(stats.tacklesWon, minutes),
    interceptionsPer90: per90(stats.interceptions, minutes),
    recoveriesPer90: per90(stats.recoveries, minutes),
    clearancesPer90: per90(stats.clearances, minutes),
    savePct: stats.savePct ?? percentage(saves, shotsFaced),
    cleanSheetPct: percentage(stats.cleanSheets, appearances),
    goalsConcededPerMatch: appearances > 0 && stats.goalsConceded !== undefined ? stats.goalsConceded / appearances : undefined,
    claimsPer90: per90(stats.claims, minutes),
  };
}

function playerFromStart(record: StartRecord, stats: Record<string, number>, sources: string[]): NormalizedPlayer {
  const minutes = finite(stats.minutes) ?? record.minutes;
  const appearances = Math.max(record.starts, finite(stats.appearances) ?? record.appearances);
  return {
    id: `${record.clubId}:${record.sourceId}`,
    identity: record.identity,
    name: record.name,
    role: roleFromOfficial(record.officialPosition),
    officialPosition: record.officialPosition,
    clubId: record.clubId,
    clubName: record.clubName,
    clubCode: record.clubCode,
    starts: record.starts,
    minutes,
    appearances,
    totals: stats,
    metrics: metricsFromTotals(stats, minutes, appearances),
    sources,
  };
}

async function pulsePages(path: string, cachePrefix: string, offline: boolean): Promise<{ rows: any[]; sources: RawSource[] }> {
  const rows: any[] = [];
  const sources: RawSource[] = [];
  let next: string | null = null;
  let page = 0;
  do {
    const separator = path.includes("?") ? "&" : "?";
    const url = `https://sdp-prem-prod.premier-league-prod.pulselive.com/api${path}${separator}_limit=100${next ? `&_next=${encodeURIComponent(next)}` : ""}`;
    const fetched = await cachedFetch("premier-league", `${cachePrefix}-${page}`, url, { headers: JSON_HEADERS }, offline);
    const payload = json(fetched.body, `Premier League ${cachePrefix}`);
    if (!Array.isArray(payload.data)) throw new Error(`Premier League ${cachePrefix}: missing data array`);
    rows.push(...payload.data);
    sources.push(fetched.source);
    next = payload.pagination?._next ?? null;
    page += 1;
  } while (next);
  return { rows, sources };
}

export async function loadPremierLeague(offline: boolean): Promise<LeagueSnapshot> {
  const config = CONFIGS.premierLeague;
  const [teamPages, matchPages, statPages] = await Promise.all([
    pulsePages("/v1/competitions/8/seasons/2025/teams", "teams", offline),
    pulsePages("/v2/matches?competition=8&season=2025", "matches", offline),
    pulsePages("/v3/competitions/8/seasons/2025/players/stats/leaderboard", "stats", offline),
  ]);
  const clubs = new Map<string, NormalizedClub>(teamPages.rows.map((team) => [String(team.id), { id: String(team.id), name: team.shortName ?? team.name, code: team.abbr, points: 0, matches: 0, goalsFor: 0, goalsAgainst: 0 }]));
  const matches = matchPages.rows.filter((match) => match.period === "FullTime");
  for (const match of matches) tallyResult(clubs, String(match.homeTeam.id), String(match.awayTeam.id), Number(match.homeTeam.score), Number(match.awayTeam.score));
  const starts = new Map<string, StartRecord>();
  const lineupRows = await mapConcurrent(matches, 1, async (match, index) => {
    if (!offline) await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    const url = `https://sdp-prem-prod.premier-league-prod.pulselive.com/api/v3/matches/${match.matchId}/lineups`;
    const fetched = await cachedFetch("premier-league", `lineup-${index}-${match.matchId}`, url, { headers: JSON_HEADERS }, offline);
    const lineup = json(fetched.body, `Premier League lineup ${match.matchId}`);
    for (const [side, team] of [["home_team", match.homeTeam], ["away_team", match.awayTeam]] as const) {
      const club = clubs.get(String(team.id))!;
      const ids = new Set((lineup[side]?.formation?.lineup ?? []).flat().map(String));
      if (ids.size !== 11) throw new Error(`Premier League match ${match.matchId}: ${club.name} has ${ids.size} starters`);
      for (const player of lineup[side].players.filter((candidate: any) => ids.has(String(candidate.id)))) {
        addStart(starts, { sourceId: String(player.id), identity: `pl:${player.id}`, name: player.knownName ?? `${player.firstName} ${player.lastName}`, officialPosition: player.position, clubId: club.id, clubName: club.name, clubCode: club.code, sourceUrl: url });
      }
    }
    return fetched.source;
  });
  const statsById = new Map(statPages.rows.map((row) => [String(row.playerMetadata.id), row.stats]));
  const players = selectTopEleven(starts.values()).map((record) => {
    const stats = statsById.get(record.sourceId) ?? {};
    const accuratePasses = stats.successfulPasses
      ?? (stats.successfulPassesOwnHalf !== undefined && stats.successfulPassesOppositionHalf !== undefined
        ? stats.successfulPassesOwnHalf + stats.successfulPassesOppositionHalf
        : undefined);
    const totals = {
      minutes: stats.timePlayed, appearances: stats.appearances, goals: finite(stats.goals) ?? 0, assists: finite(stats.goalAssists) ?? 0,
      shotsOnTarget: finite(stats.shotsOnTargetIncGoals ?? stats.shotsOnTarget) ?? 0,
      shots: finite(stats.totalShots) ?? 0,
      passes: stats.totalPasses,
      accuratePasses,
      keyPasses: finite(stats.keyPassesAttemptAssists ?? stats.keyPasses) ?? 0,
      tacklesWon: finite(stats.tacklesWon ?? stats.wonTackles) ?? 0,
      interceptions: finite(stats.interceptions) ?? 0,
      recoveries: finite(stats.recoveries ?? stats.ballRecoveries) ?? 0,
      clearances: finite(stats.totalClearances) ?? 0,
      forwardPasses: finite(stats.forwardPasses) ?? 0,
      saves: stats.savesMade ?? stats.saves,
      goalsConceded: stats.goalsConceded,
      cleanSheets: finite(stats.cleanSheets) ?? 0,
      claims: stats.goodHighClaim,
    };
    return playerFromStart(record, totals, [...record.sourceUrls, ...statPages.sources.map((source) => source.url)]);
  });
  return { config, clubs: [...clubs.values()], players, matchIds: matches.map((match) => String(match.matchId)), sources: [...teamPages.sources, ...matchPages.sources, ...statPages.sources, ...lineupRows] };
}

async function laligaStats(offline: boolean): Promise<{ rows: any[]; sources: RawSource[] }> {
  const rows: any[] = [];
  const sources: RawSource[] = [];
  for (let offset = 0; ; offset += 100) {
    const url = `https://apim.laliga.com/public-service/api/v1/subscriptions/laliga-easports-2025/players/rankings?limit=100&offset=${offset}&orderField=stat.total_mins_played_ranking&orderType=ASC`;
    const fetched = await cachedFetch("laliga", `stats-${offset}`, url, { headers: LALIGA_HEADERS }, offline);
    const payload = json(fetched.body, "LaLiga rankings");
    rows.push(...payload.player_rankings);
    sources.push(fetched.source);
    if (rows.length >= payload.total) break;
  }
  return { rows, sources };
}

export async function loadLaliga(offline: boolean): Promise<LeagueSnapshot> {
  const config = CONFIGS.laliga;
  const [matchPages, rankings] = await Promise.all([
    Promise.all([0, 100, 200, 300].map(async (offset) => {
      const url = `https://apim.laliga.com/public-service/api/v1/matches?subscriptionSlug=laliga-easports-2025&seasonYear=2025&limit=100&offset=${offset}`;
      return cachedFetch("laliga", `matches-${offset}`, url, { headers: LALIGA_HEADERS }, offline);
    })),
    laligaStats(offline),
  ]);
  const matches: any[] = matchPages.flatMap((page) => json(page.body, "LaLiga matches").matches).filter((match: any) => match.status === "FullTime");
  const clubs = new Map<string, NormalizedClub>();
  for (const match of matches) for (const team of [match.home_team, match.away_team]) clubs.set(String(team.id), { id: String(team.id), name: team.nickname, code: team.shortname, points: 0, matches: 0, goalsFor: 0, goalsAgainst: 0 });
  for (const match of matches) tallyResult(clubs, String(match.home_team.id), String(match.away_team.id), Number(match.home_score), Number(match.away_score));
  const rankingsByOptaId = new Map(rankings.rows.map((row) => [String(row.opta_id), row]));
  const rankingsByClubName = new Map(rankings.rows.map((row) => [`${row.team.id}:${normalizedName(row.nickname ?? row.name)}`, row]));
  const starts = new Map<string, StartRecord>();
  const lineupSources = await mapConcurrent(matches, 10, async (match, index) => {
    const url = `https://www.laliga.com/en-GB/match/${match.slug}`;
    const fetched = await cachedFetch("laliga", `lineup-${index}-${match.id}`, url, {}, offline);
    const script = fetched.body.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    if (!script) throw new Error(`LaLiga match ${match.id}: __NEXT_DATA__ missing`);
    const lineups = json(script, `LaLiga lineup ${match.id}`).props?.pageProps?.data?.lineups;
    for (const [side, team] of [["home", match.home_team], ["away", match.away_team]] as const) {
      const club = clubs.get(String(team.id))!;
      const eleven = lineups?.[side]?.starts;
      if (!Array.isArray(eleven) || eleven.length !== 11) throw new Error(`LaLiga match ${match.id}: ${club.name} has ${eleven?.length ?? 0} starters`);
      for (const player of eleven) {
        const photoUrl = Object.values(player.photos ?? {})
          .flatMap((sizes: any) => Object.values(sizes ?? {}))
          .find((value) => typeof value === "string") as string | undefined;
        const matchingRanking = rankingsByClubName.get(`${club.id}:${normalizedName(player.person.nickname ?? player.person.name)}`);
        const optaId = photoUrl?.match(/\/(p\d+)\//)?.[1] ?? matchingRanking?.opta_id;
        if (!optaId) throw new Error(`LaLiga match ${match.id}: official player ID missing for ${player.person?.name ?? player.id}`);
        addStart(starts, { sourceId: optaId, identity: `opta:${optaId}`, name: player.person.nickname ?? player.person.name, officialPosition: "pending", clubId: club.id, clubName: club.name, clubCode: club.code, sourceUrl: url });
      }
    }
    return fetched.source;
  });
  const selected = selectTopEleven(starts.values());
  const rolesByOptaId = new Map(rankings.rows.flatMap((row) => row.position?.name ? [[String(row.opta_id), row.position.name] as const] : []));
  const rankingTeams = [...new Map(rankings.rows.map((row) => [String(row.team.id), row.team])).values()];
  const squadSources = await mapConcurrent(rankingTeams.flatMap((team) => [2023, 2024, 2025].map((seasonYear) => ({ team, seasonYear }))), 8, async ({ team, seasonYear }) => {
    const url = `https://apim.laliga.com/public-service/api/v1/teams/${team.slug}/squad?limit=60&offset=0&orderField=id&orderType=DESC&seasonYear=${seasonYear}`;
    const fetched = await cachedFetch("laliga", `squad-${team.id}-${seasonYear}`, url, { headers: LALIGA_HEADERS }, offline);
    const payload = json(fetched.body, `LaLiga ${team.nickname} ${seasonYear} squad`);
    if (!Array.isArray(payload.squads)) throw new Error(`LaLiga: official squad missing for ${team.nickname} (${seasonYear})`);
    for (const squad of payload.squads) {
      if (squad.opta_id && squad.position?.name) rolesByOptaId.set(String(squad.opta_id), squad.position.name);
    }
    return fetched.source;
  });
  const missingRoles = selected.filter((record) => !rolesByOptaId.has(record.sourceId));
  const roleProfileSources = await mapConcurrent(missingRoles, 8, async (record) => {
    const row = rankingsByOptaId.get(record.sourceId) ?? rankingsByClubName.get(`${record.clubId}:${normalizedName(record.name)}`);
    if (!row?.slug) throw new Error(`LaLiga: official profile missing for ${record.name} (${record.sourceId})`);
    const url = `https://www.laliga.com/en-GB/player/${row.slug}`;
    const fetched = await cachedFetch("laliga", `profile-${record.sourceId}`, url, {}, offline);
    const script = fetched.body.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    if (!script) throw new Error(`LaLiga: official profile data missing for ${record.name}`);
    const profile = json(script, `LaLiga profile ${record.name}`).props?.pageProps?.player;
    const officialPosition = profile?.squads?.find((squad: any) => squad.position?.name)?.position?.name;
    if (!officialPosition) throw new Error(`LaLiga: official profile role missing for ${record.name}`);
    rolesByOptaId.set(record.sourceId, officialPosition);
    return fetched.source;
  });
  const players = selected.map((record) => {
    const row = rankingsByOptaId.get(record.sourceId) ?? rankingsByClubName.get(`${record.clubId}:${normalizedName(record.name)}`);
    const officialPosition = rolesByOptaId.get(record.sourceId);
    if (!row || !officialPosition) throw new Error(`LaLiga: official statistics identity or role missing for ${record.name} (${record.sourceId})`);
    const stats = statMap(row?.stats);
    const totals = {
      minutes: stats.total_mins_played, appearances: stats.total_games, goals: stats.total_goals ?? 0, assists: stats.total_assists ?? 0,
      shotsOnTarget: stats.total_ontarget_attempt ?? 0, shots: stats.total_scoring_att ?? 0,
      passes: stats.total_pass, accuratePasses: stats.total_accurate_pass,
      keyPasses: stats.total_att_assist ?? 0, tacklesWon: stats.total_won_tackle ?? 0,
      interceptions: stats.total_interception ?? 0,
      clearances: stats.total_clearance ?? 0, saves: stats.total_saves, goalsConceded: stats.total_goals_conceded,
      cleanSheets: stats.total_clean_sheet ?? 0, claims: stats.total_good_high_claim,
      forwardPasses: stats.total_fwd_zone_pass ?? 0,
    };
    const identity = `opta:${row.opta_id}`;
    return playerFromStart({ ...record, sourceId: row.opta_id, identity, officialPosition }, totals, [...record.sourceUrls, ...rankings.sources.map((source) => source.url), ...squadSources.map((source) => source.url), ...roleProfileSources.map((source) => source.url)]);
  });
  return { config, clubs: [...clubs.values()], players, matchIds: matches.map((match: any) => String(match.id)), sources: [...matchPages.map((page) => page.source), ...rankings.sources, ...lineupSources, ...squadSources, ...roleProfileSources] };
}

const SERIE_BASE = "https://api-sdp.legaseriea.it/v1/serie-a/football";
const SERIE_SEASON = "serie-a::Football_Season::5f0e080fc3a44073984b75b3a8e06a8a";

export async function loadSerieA(offline: boolean): Promise<LeagueSnapshot> {
  const config = CONFIGS.serieA;
  const season = encodeURIComponent(SERIE_SEASON);
  const [matchesFetch, statsFetch] = await Promise.all([
    cachedFetch("serie-a", "matches", `${SERIE_BASE}/seasons/${season}/matches`, { headers: SERIE_HEADERS }, offline),
    cachedFetch("serie-a", "stats", `${SERIE_BASE}/seasons/${season}/stats/players?category=General&pageNumElement=500&orderBy=games-played&direction=desc`, { headers: SERIE_HEADERS }, offline),
  ]);
  const matchesPayload = json(matchesFetch.body, "Serie A matches");
  const matches: any[] = matchesPayload.matches.filter((match: any) => String(match.status ?? match.matchStatus ?? "").toLowerCase().includes("full") || match.isMatchFinished === true);
  const statsPayload = json(statsFetch.body, "Serie A player statistics");
  const clubs = new Map<string, NormalizedClub>();
  for (const match of matchesPayload.matches) {
    for (const team of [match.home, match.away, match.homeTeam, match.awayTeam].filter(Boolean)) {
      const id = String(team.teamId ?? team.id);
      clubs.set(id, { id, name: team.shortName ?? team.officialName ?? team.name, code: team.acronymName ?? team.abbr ?? shortCode(team.shortName ?? team.name), points: 0, matches: 0, goalsFor: 0, goalsAgainst: 0 });
    }
  }
  const starts = new Map<string, StartRecord>();
  const lineupSources = await mapConcurrent(matchesPayload.matches as any[], 12, async (match, index) => {
    const matchId = String(match.matchId ?? match.id);
    const url = `${SERIE_BASE}/seasons/${season}/matches/${encodeURIComponent(matchId)}/lineups`;
    const fetched = await cachedFetch("serie-a", `lineup-${index}-${matchId.split("::").at(-1)}`, url, { headers: SERIE_HEADERS }, offline);
    const lineup = json(fetched.body, `Serie A lineup ${matchId}`);
    for (const side of ["home", "away"] as const) {
      const team = lineup[side];
      const club = clubs.get(String(team.teamId)) ?? { id: String(team.teamId), name: team.shortName, code: team.acronymName, points: 0, matches: 0, goalsFor: 0, goalsAgainst: 0 };
      clubs.set(club.id, club);
      if (!Array.isArray(team.fielded) || team.fielded.length !== 11) throw new Error(`Serie A ${matchId}: ${club.name} has ${team.fielded?.length ?? 0} starters`);
      for (const player of team.fielded) addStart(starts, { sourceId: String(player.playerId), identity: player.providerId ? `opta:${String(player.providerId).split(":").at(-1)}` : `serie-a:${player.playerId}`, name: player.shortName ?? player.shirtName, officialPosition: player.roleLabel, clubId: club.id, clubName: club.name, clubCode: club.code, sourceUrl: url });
    }
    const homeScore = finite(match.providerHomeScore ?? match.homeScore ?? match.homeScorePush);
    const awayScore = finite(match.providerAwayScore ?? match.awayScore ?? match.awayScorePush);
    if (lineup.home && lineup.away && homeScore !== undefined && awayScore !== undefined) tallyResult(clubs, String(lineup.home.teamId), String(lineup.away.teamId), homeScore, awayScore);
    return fetched.source;
  });
  if ([...clubs.values()].every((club) => club.matches === 0)) {
    for (const match of matchesPayload.matches) {
      const home = match.home ?? match.homeTeam;
      const away = match.away ?? match.awayTeam;
      const homeScore = finite(match.providerHomeScore ?? match.homeScore ?? match.homeScorePush ?? match.score?.home?.fulltime);
      const awayScore = finite(match.providerAwayScore ?? match.awayScore ?? match.awayScorePush ?? match.score?.away?.fulltime);
      if (home && away && homeScore !== undefined && awayScore !== undefined) tallyResult(clubs, String(home.teamId ?? home.id), String(away.teamId ?? away.id), homeScore, awayScore);
    }
  }
  const statsById = new Map(statsPayload.players.map((row: any) => [String(row.playerId), row]));
  const players = selectTopEleven(starts.values()).map((record) => {
    const row: any = statsById.get(record.sourceId);
    const stats = Object.fromEntries((row?.stats ?? []).flatMap((entry: any) => {
      const value = finite(entry.statsValue);
      return value === undefined ? [] : [[entry.statsId, value]];
    }));
    const totals = {
      minutes: stats["minutes-played"], appearances: stats["games-played"], goals: stats.goals ?? stats.Goals ?? 0,
      assists: stats.assists ?? stats["Goal Assists"] ?? 0,
      shotsOnTarget: stats["on-target-scoring-attempts"] ?? stats["Shots On Target ( inc goals )"] ?? 0,
      shots: stats["total-scoring-attempts"] ?? stats["Total Shots"] ?? 0,
      passes: stats["Total Passes"],
      accuratePasses: stats["Total Successful Passes ( Excl Crosses & Corners )"],
      passCompletionPct: stats["accurate-pass-percentage"], keyPasses: stats["total-attacking-assist"],
      tacklesWon: stats["tackles-won"] ?? stats["Tackles Won"] ?? 0,
      interceptions: stats.Interceptions ?? 0,
      recoveries: stats.Recoveries ?? 0,
      clearances: stats["Total Clearances"] ?? 0,
      forwardPasses: stats["Forward Passes"] ?? 0,
      saves: stats["Saves Made"],
      goalsConceded: stats["goals-conceded"] ?? stats["Goals Conceded"],
      cleanSheets: stats["Clean sheets"],
      savePct: stats.totalSavePerc,
      claims: stats.highClaim ?? stats.Catches,
    };
    return playerFromStart({ ...record, officialPosition: row?.roleLabel ?? record.officialPosition }, totals, [...record.sourceUrls, statsFetch.source.url]);
  });
  return { config, clubs: [...clubs.values()], players, matchIds: matchesPayload.matches.map((match: any) => String(match.matchId ?? match.id)), sources: [matchesFetch.source, statsFetch.source, ...lineupSources] };
}

function bundesligaLineup(body: string, matchId: string, teamName: string): string[] {
  const scripts = [...body.matchAll(/<script[^>]+id="lineup-event-schema-[^"]+"[^>]*>([\s\S]*?)<\/script>/g)];
  const article = scripts.map((match) => json(match[1], `Bundesliga lineup ${matchId}`).articleBody).find(Boolean);
  if (!article) throw new Error(`Bundesliga ${matchId}: lineup schema missing`);
  const escaped = teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const section = article.match(new RegExp(`Starting line-up ${escaped}:\\n([^\\n]+)`))?.[1];
  if (!section) throw new Error(`Bundesliga ${matchId}: lineup missing for ${teamName}`);
  return section.split(/\s+-\s+|,\s+/).map((name: string) => name.trim()).filter(Boolean);
}

async function bundesligaMetric(metric: string, offline: boolean): Promise<{ rows: any[]; source: RawSource }> {
  const url = `https://wapp.bapi.bundesliga.com/all/DFL-COM-000001/seasons/DFL-SEA-0001K9/stats/playerRankings/${metric}.json`;
  const fetched = await cachedFetch("bundesliga", `metric-${metric}`, url, { headers: JSON_HEADERS }, offline);
  const payload = json(fetched.body, `Bundesliga ${metric}`);
  return { rows: payload && typeof payload === "object" ? Object.values(payload) : [], source: fetched.source };
}

export async function loadBundesliga(offline: boolean): Promise<LeagueSnapshot> {
  const config = CONFIGS.bundesliga;
  const matchesUrl = "https://wapp.bapi.bundesliga.com/all/DFL-COM-000001/seasons/DFL-SEA-0001K9/matches.json";
  const matchesFetch = await cachedFetch("bundesliga", "matches", matchesUrl, { headers: JSON_HEADERS }, offline);
  const matches = Object.values(json(matchesFetch.body, "Bundesliga matches")) as any[];
  const clubs = new Map<string, NormalizedClub>();
  for (const match of matches) for (const team of [match.teams.home, match.teams.away]) clubs.set(String(team.dflDatalibraryClubId), { id: String(team.dflDatalibraryClubId), name: team.nameFull, code: team.threeLetterCode, points: 0, matches: 0, goalsFor: 0, goalsAgainst: 0 });
  for (const match of matches) tallyResult(clubs, String(match.teams.home.dflDatalibraryClubId), String(match.teams.away.dflDatalibraryClubId), Number(match.score.home.fulltime), Number(match.score.away.fulltime));
  const starts = new Map<string, StartRecord>();
  const profileSlugsByName = new Map<string, string>();
  const lineupSources = await mapConcurrent(matches, 10, async (match, index) => {
    const url = `https://www.bundesliga.com/en/bundesliga/matchday/2025-2026/${match.matchday}/${match.slugs.slugLong}/lineup`;
    const fetched = await cachedFetch("bundesliga", `lineup-${index}-${match.matchId}`, url, {}, offline);
    for (const playerLink of fetched.body.matchAll(/href="\/en\/player\/([^"]+)"[^>]*>[\s\S]{0,900}?class="name lastName">([^<]+)<\/span>/g)) {
      profileSlugsByName.set(normalizedName(playerLink[2]), playerLink[1]);
    }
    for (const side of ["home", "away"] as const) {
      const team = match.teams[side];
      const names = bundesligaLineup(fetched.body, match.matchId, team.nameFull);
      if (names.length !== 11) throw new Error(`Bundesliga ${match.matchId}: ${team.nameFull} has ${names.length} starters`);
      const goalsConceded = Number(match.score[side === "home" ? "away" : "home"].fulltime);
      const aggregate = { goalsConceded, cleanSheets: goalsConceded === 0 ? 1 : 0 };
      for (const name of names) addStart(starts, { sourceId: normalizedName(name), identity: `bundesliga-name:${normalizedName(name)}`, name, officialPosition: "", clubId: team.dflDatalibraryClubId, clubName: team.nameFull, clubCode: team.threeLetterCode, sourceUrl: url, aggregate });
    }
    return fetched.source;
  });
  const metricNames = ["shotsAtGoalSuccessful", "assists", "shotsAtGoal", "tacklingGamesWon", "tacklingGamesAirWon"];
  const metricPages = await Promise.all(metricNames.map((metric) => bundesligaMetric(metric, offline)));
  const infoByName = new Map<string, any>();
  for (let index = 0; index < metricPages.length; index += 1) for (const row of metricPages[index].rows) {
    const key = normalizedName(row.name);
    const current = infoByName.get(key) ?? { id: row.dflDatalibraryObjectId, slug: row.slug, clubId: row.club?.dflDatalibraryClubId, stats: {} };
    current.stats[metricNames[index]] = row.value;
    infoByName.set(key, current);
  }
  const selected = selectTopEleven(starts.values());
  const profiles = await mapConcurrent(selected, 10, async (record) => {
    const leaderboardInfo = infoByName.get(normalizedName(record.name));
    const slug = leaderboardInfo?.slug ?? profileSlugsByName.get(normalizedName(record.name));
    if (!slug) throw new Error(`Bundesliga: no official profile for ${record.name}`);
    const url = `https://www.bundesliga.com/en/player/${slug}`;
    const fetched = await cachedFetch("bundesliga", `profile-${slug}`, url, {}, offline);
    const role = fetched.body.match(/class="club-player-details"[^>]*>[\s\S]{0,180}?(Goalkeeper|Defender|Midfielder|Striker)/)?.[1];
    if (!role) throw new Error(`Bundesliga: role missing for ${record.name}`);
    const headerStart = fetched.body.indexOf("<h1");
    const header = fetched.body.slice(headerStart, headerStart + 5_000);
    const officialId = leaderboardInfo?.id ?? header.match(/\/player\/(dfl-obj-[a-z0-9]+)-dfl-clu-/i)?.[1]?.toUpperCase();
    if (!officialId) throw new Error(`Bundesliga: official player ID missing for ${record.name}`);
    const statsUrl = `https://wapp.bapi.bundesliga.com/all/DFL-COM-000001/seasons/DFL-SEA-0001K9/stats/playerPage/${officialId}/seasonStats.json`;
    const statsFetch = await cachedFetch("bundesliga", `season-${officialId}`, statsUrl, { headers: JSON_HEADERS }, offline);
    const seasonStats = json(statsFetch.body, `Bundesliga stats ${record.name}`);
    return {
      info: { ...leaderboardInfo, id: officialId, slug },
      role: role === "Striker" ? "Forward" : role,
      stats: { ...(leaderboardInfo?.stats ?? {}), ...Object.fromEntries(Object.entries(seasonStats).map(([key, value]: [string, any]) => [key, value?.value])) },
      sources: [fetched.source, statsFetch.source],
    };
  });
  const players = selected.map((record, index) => {
    const { info, role, stats, sources } = profiles[index];
    const appearances = finite(stats.matchesPlayed) ?? record.starts;
    const totals = {
      appearances,
      goals: finite(stats.shotsAtGoalSuccessful) ?? 0,
      assists: finite(stats.assists) ?? 0,
      shots: finite(stats.shotsAtGoal) ?? 0,
      shotsOnTarget: finite(stats.shotsOnTarget) ?? 0,
      tacklesWon: finite(stats.tacklingGamesWon) ?? 0,
      aerialDuelsWon: finite(stats.tacklingGamesAirWon) ?? 0,
      passes: stats.ballActions,
      ballActions: stats.ballActions,
      passCompletionPct: stats.passesFromPlayRatio ?? stats.passingEfficiency,
      saves: stats.goalkeeperSaves ?? stats.shotsSaved,
      goalsConceded: record.aggregate?.goalsConceded,
      cleanSheets: record.aggregate?.cleanSheets,
    };
    return playerFromStart({ ...record, sourceId: info.id, identity: `bundesliga:${info.id}`, officialPosition: role }, totals, [...record.sourceUrls, ...sources.map((source) => source.url)]);
  });
  return { config, clubs: [...clubs.values()], players, matchIds: matches.map((match) => String(match.matchId)), sources: [matchesFetch.source, ...metricPages.map((page) => page.source), ...lineupSources, ...profiles.flatMap((profile) => profile.sources)] };
}

function ligueRole(value: number): { role: SoccerRole; label: string } {
  const roles: Record<number, { role: SoccerRole; label: string }> = { 1: { role: "GK", label: "Goalkeeper" }, 2: { role: "DEF", label: "Defender" }, 3: { role: "MID", label: "Midfielder" }, 4: { role: "ATT", label: "Forward" } };
  if (!roles[value]) throw new Error(`Unsupported Ligue 1 position: ${value}`);
  return roles[value];
}

export async function loadLigue1(offline: boolean): Promise<LeagueSnapshot> {
  const config = CONFIGS.ligue1;
  const calendarUrl = "https://ma-api.ligue1.fr/championship-calendar/1?season=2025";
  const calendarFetch = await cachedFetch("ligue-1", "calendar", calendarUrl, { headers: LIGUE_HEADERS }, offline);
  const calendar = json(calendarFetch.body, "Ligue 1 calendar");
  const matchIds = [...new Set(JSON.stringify(calendar).match(/l1_championship_match_\d+/g) ?? [])];
  const starts = new Map<string, StartRecord>();
  const clubs = new Map<string, NormalizedClub>();
  const matchSources = await mapConcurrent(matchIds, 10, async (matchId, index) => {
    const url = `https://ma-api.ligue1.fr/championship-match/${matchId}`;
    const fetched = await cachedFetch("ligue-1", `match-${index}-${matchId.split("_").at(-1)}`, url, { headers: LIGUE_HEADERS }, offline);
    const match = json(fetched.body, `Ligue 1 match ${matchId}`);
    for (const side of ["home", "away"] as const) {
      const team = match[side];
      clubs.set(team.clubId, {
        id: team.clubId,
        name: team.clubIdentity.shortName,
        code: team.clubIdentity.trigram,
        points: clubs.get(team.clubId)?.points ?? 0,
        matches: clubs.get(team.clubId)?.matches ?? 0,
        goalsFor: clubs.get(team.clubId)?.goalsFor ?? 0,
        goalsAgainst: clubs.get(team.clubId)?.goalsAgainst ?? 0,
      });
    }
    tallyResult(clubs, match.home.clubId, match.away.clubId, Number(match.home.score), Number(match.away.score));
    for (const side of ["home", "away"] as const) {
      const team = match[side];
      const starters = Object.values(team.players).filter((player: any) => player.startedMatch) as any[];
      if (starters.length !== 11) throw new Error(`Ligue 1 ${matchId}: ${team.clubIdentity.shortName} has ${starters.length} starters`);
      for (const player of starters) {
        const position = ligueRole(Number(player.position));
        const s = player.stats ?? {};
        const minutes = finite(player.minutesPlayed);
        if (minutes === undefined) throw new Error(`Ligue 1 ${matchId}: minutes missing for ${player.playerIdentity?.lastName ?? player.id}`);
        const aggregate = Object.fromEntries([
          ["goals", player.goals], ["assists", player.goalsAssists], ["shots", s.total_scoring_att],
          ["shotsOnTarget", s.ontarget_scoring_att], ["passes", s.total_pass], ["accuratePasses", s.accurate_pass],
          ["keyPasses", s.total_att_assist], ["tacklesWon", s.won_tackle], ["interceptions", s.interception],
          ["recoveries", s.ball_recovery], ["clearances", s.total_clearance], ["saves", s.saves],
          ["goalsConceded", s.goals_conceded], ["cleanSheets", s.clean_sheet], ["claims", s.good_high_claim],
          ["forwardPasses", s.fwd_pass],
        ].map(([key, rawValue]) => [key, finite(rawValue) ?? 0]));
        addStart(starts, {
          sourceId: String(player.playerIdentity.shortOptaId ?? player.id), identity: `opta:${player.playerIdentity.shortOptaId ?? player.id}`,
          name: `${player.playerIdentity.firstName} ${player.playerIdentity.lastName}`.trim(), officialPosition: position.label,
          clubId: team.clubId, clubName: team.clubIdentity.shortName, clubCode: team.clubIdentity.trigram,
          minutes, sourceUrl: url, aggregate,
        });
      }
    }
    return fetched.source;
  });
  const players = selectTopEleven(starts.values()).map((record) => playerFromStart(record, { ...(record.aggregate ?? {}), minutes: record.minutes, appearances: record.appearances }, [...record.sourceUrls]));
  return { config, clubs: [...clubs.values()], players, matchIds, sources: [calendarFetch.source, ...matchSources] };
}

export const SOURCE_LOADERS: Record<SourceKey, (offline: boolean) => Promise<LeagueSnapshot>> = {
  premierLeague: loadPremierLeague,
  laliga: loadLaliga,
  serieA: loadSerieA,
  bundesliga: loadBundesliga,
  ligue1: loadLigue1,
};
