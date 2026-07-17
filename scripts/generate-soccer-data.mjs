import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOCCER_SELECTION_ALIASES, SOCCER_SELECTION_EDITIONS } from "./soccer-selections.mjs";
import { SOCCER_OFFICIAL_HONORS } from "./soccer-honors.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "soccer-data", "uefa");
const OUTPUT = join(ROOT, "shared", "src", "soccerPlayers.generated.ts");
const PROVENANCE_OUTPUT = join(ROOT, "shared", "src", "soccerPlayers.provenance.json");
const VERIFY_ONLY = process.argv.includes("--verify");
const RECALCULATE_ONLY = process.argv.includes("--recalculate");
const API_BOOTSTRAP = "https://www.uefa.com/uefachampionsleague/history/seasons/2001/statistics/";
const API_BASE = {
  competition: "https://compstats.uefa.com/v2",
  match: "https://match.uefa.com/v5",
  matchStats: "https://matchstats.uefa.com/v2",
};
const SOURCE_REVISION = `uefa-v2-${createHash("sha256")
  .update(JSON.stringify([SOCCER_SELECTION_EDITIONS, SOCCER_OFFICIAL_HONORS]))
  .digest("hex")
  .slice(0, 12)}`;
const PAGE_SIZE = 500;

const normalize = (value) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();
const slug = (value) => normalize(value).replace(/ /g, "-");
const round = (value, digits = 3) => Number(value.toFixed(digits));
const rate = (value, minutes) => minutes > 0 ? value * 90 / minutes : 0;

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }));
  return results;
}

async function cachedJson(relativePath, url, apiKey) {
  const path = join(CACHE, relativePath);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    if (VERIFY_ONLY) throw new Error(`Missing cached UEFA source file: ${relativePath}`);
    const response = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!response.ok) throw new Error(`UEFA API ${response.status}: ${url}`);
    const body = await response.text();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return JSON.parse(body);
  }
}

async function discoverApiKey() {
  const response = await fetch(API_BOOTSTRAP);
  if (!response.ok) throw new Error(`Could not load UEFA API bootstrap (${response.status}).`);
  const html = await response.text();
  const match = html.match(/window\.apiKey\s*=\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error("UEFA statistics page did not expose its public API key.");
  return match[1];
}

function playerNames(row) {
  const player = row.player ?? {};
  const translations = player.translations ?? {};
  const first = translations.firstName?.EN;
  const last = translations.lastName?.EN;
  return [
    player.internationalName,
    translations.name?.EN,
    translations.shortName?.EN,
    first && last ? `${first} ${last}` : null,
  ].filter(Boolean);
}

function resolvePlayer(entry, rankingRows, editionKey) {
  const wanted = [entry.name, ...(SOCCER_SELECTION_ALIASES[entry.name] ?? [])].map(normalize);
  const byPlayer = new Map();
  for (const row of rankingRows) {
    if (!row.playerId || !row.player) continue;
    const playerId = String(row.playerId);
    const existing = byPlayer.get(playerId) ?? { row, minutes: 0 };
    existing.minutes += statValue(row, "minutes_played_official");
    byPlayer.set(playerId, existing);
  }
  const candidates = [...byPlayer.values()].map(({ row, minutes }) => {
    const names = playerNames(row).map(normalize);
    const exact = wanted.some((name) => names.includes(name));
    const tokenMatch = wanted.some((name) => {
      const tokens = name.split(" ");
      return names.some((candidate) => tokens.every((token) => candidate.split(" ").includes(token)));
    });
    return { row, minutes, score: exact ? 2 : tokenMatch ? 1 : 0 };
  }).filter(({ score }) => score > 0);
  const bestScore = Math.max(0, ...candidates.map(({ score }) => score));
  const exactMatches = candidates.filter(({ score }) => score === bestScore);
  const mostMinutes = Math.max(0, ...exactMatches.map(({ minutes }) => minutes));
  const best = exactMatches.filter(({ minutes }) => minutes === mostMinutes);
  if (best.length !== 1) {
    const names = best.map(({ row }) => `${row.playerId}:${playerNames(row).join("/")}`).join(", ");
    throw new Error(`${editionKey}: ${entry.name} resolved to ${best.length} UEFA players${names ? ` (${names})` : ""}.`);
  }
  const bestBirthDates = new Set(best.map(({ row }) => row.player?.birthDate).filter(Boolean));
  if (bestBirthDates.size > 1) throw new Error(`${editionKey}: ${entry.name} matched multiple equally active birth dates.`);
  const selectedBirthDate = best[0].row.player?.birthDate;
  const identityMatches = selectedBirthDate
    ? exactMatches.filter(({ row }) => row.player?.birthDate === selectedBirthDate)
    : best;
  return {
    row: best[0].row,
    playerIds: [...new Set(identityMatches.map(({ row }) => String(row.playerId)))],
  };
}

async function rankingPage(apiKey, competitionId, seasonYear, offset) {
  const params = new URLSearchParams({
    competitionId: String(competitionId),
    seasonYear: String(seasonYear),
    stats: "minutes_played_official",
    offset: String(offset),
    limit: String(PAGE_SIZE),
    order: "DESC",
  });
  params.append("optionalFields", "PLAYER");
  params.append("optionalFields", "TEAM");
  return cachedJson(
    `rankings/${competitionId}/${seasonYear}/${offset}.json`,
    `${API_BASE.competition}/player-ranking?${params}`,
    apiKey
  );
}

async function rankingRowsForEdition(apiKey, edition) {
  const firstYear = Number(edition.window.from.slice(0, 4));
  const lastYear = Number(edition.window.to.slice(0, 4));
  const seasons = [...new Set([firstYear - 1, firstYear, lastYear])];
  const competitions = edition.window.competition === "ucl" ? [1] : [1, 14];
  const rows = [];
  for (const competitionId of competitions) {
    for (const seasonYear of seasons) {
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await rankingPage(apiKey, competitionId, seasonYear, offset);
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
    }
  }
  return rows;
}

async function matchesForPlayerId(apiKey, edition, playerId) {
  const matches = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const params = new URLSearchParams({
      playerId,
      fromDate: edition.window.from,
      toDate: edition.window.to,
      limit: String(limit),
      offset: String(offset),
      order: "ASC",
    });
    const page = await cachedJson(
      `matches/${edition.key}/${playerId}/${offset}.json`,
      `${API_BASE.match}/matches?${params}`,
      apiKey
    );
    matches.push(...page);
    if (page.length < limit) break;
  }
  return matches.filter((match) => {
    const clubCompetition = match.competition?.teamCategory === "CLUB" && match.competition?.region === "CONTINENTAL";
    const tournamentMatch = !["PREQUALIFYING", "QUALIFYING"].includes(match.round?.phase);
    const requestedCompetition = edition.window.competition !== "ucl" || String(match.competition?.id) === "1";
    return clubCompetition && tournamentMatch && requestedCompetition;
  });
}

async function matchesForCard(apiKey, edition, playerIds) {
  const matches = (await mapLimit(playerIds, 4, (playerId) => matchesForPlayerId(apiKey, edition, playerId))).flat();
  return [...new Map(matches.map((match) => [String(match.id), match])).values()];
}

async function matchStatistics(apiKey, matchId) {
  return cachedJson(
    `match-stats/${matchId}.json`,
    `${API_BASE.matchStats}/player-statistics/${matchId}?optionalFields=PLAYER&optionalFields=TEAM`,
    apiKey
  );
}

const statMaybe = (row, name) => {
  const value = row?.statistics?.find((stat) => stat.name === name)?.value;
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${row?.playerId ?? "unknown player"}: non-numeric ${name}.`);
  return parsed;
};

const statValue = (row, name) => statMaybe(row, name) ?? 0;

const OPTIONAL_METRIC_COVERAGE = 0.7;

function deriveAdvancedStats(playerRows, totalMinutes) {
  const totals = new Map();
  const trackedMinutes = new Map();
  const collect = (key, value, minutes) => {
    if (value === null) return;
    totals.set(key, (totals.get(key) ?? 0) + value);
    trackedMinutes.set(key, (trackedMinutes.get(key) ?? 0) + minutes);
  };

  for (const { row, minutes } of playerRows) {
    collect("tacklesWon", statMaybe(row, "tackles_won"), minutes);
    collect("recoveries", statMaybe(row, "recovered_ball"), minutes);
    collect("clearances", statMaybe(row, "clearance_completed"), minutes);
    collect("progressiveDeliveries", statMaybe(row, "delivery_into_attacking_third"), minutes);
    collect("dribbles", statMaybe(row, "dribbling"), minutes);
    collect("claims", statMaybe(row, "claims"), minutes);

    const attempted = statMaybe(row, "passes_attempted");
    const completed = statMaybe(row, "passes_completed");
    if (attempted !== null && completed !== null) {
      collect("passesAttempted", attempted, minutes);
      collect("passesCompleted", completed, minutes);
    }

    const goals = statMaybe(row, "goals");
    const penalties = statMaybe(row, "penalty_scored");
    if (goals !== null && penalties !== null) collect("nonPenaltyGoals", Math.max(0, goals - penalties), minutes);
  }

  const hasCoverage = (key) => (trackedMinutes.get(key) ?? 0) / totalMinutes >= OPTIONAL_METRIC_COVERAGE;
  const per90 = (key) => round(rate(totals.get(key) ?? 0, trackedMinutes.get(key) ?? 0));
  const stats = {};
  if (hasCoverage("nonPenaltyGoals")) stats.nonPenaltyGoalsPer90 = per90("nonPenaltyGoals");
  if (hasCoverage("tacklesWon")) stats.tacklesWonPer90 = per90("tacklesWon");
  if (hasCoverage("recoveries")) stats.recoveriesPer90 = per90("recoveries");
  if (hasCoverage("clearances")) stats.clearancesPer90 = per90("clearances");
  if (hasCoverage("progressiveDeliveries")) stats.progressiveDeliveriesPer90 = per90("progressiveDeliveries");
  if (hasCoverage("dribbles")) stats.dribblesPer90 = per90("dribbles");
  if (hasCoverage("claims")) stats.claimsPer90 = per90("claims");
  if (hasCoverage("passesAttempted") && (totals.get("passesAttempted") ?? 0) > 0) {
    stats.passCompletionPct = round((totals.get("passesCompleted") ?? 0) / totals.get("passesAttempted") * 100, 1);
  }
  return stats;
}

function scoreForTeam(match, teamId) {
  const homeId = String(match.homeTeam?.id);
  const awayId = String(match.awayTeam?.id);
  const score = match.score?.total ?? match.score?.regular;
  if (!score || (teamId !== homeId && teamId !== awayId)) return null;
  const home = Number(score.home);
  const away = Number(score.away);
  if (![home, away].every(Number.isFinite)) return null;
  return teamId === homeId ? { for: home, against: away } : { for: away, against: home };
}

function teamName(row) {
  return row.team?.translations?.displayName?.EN ?? row.team?.translations?.name?.EN ?? `Team ${row.teamId}`;
}

function competitionHonorName(match) {
  const name = match.competition?.translations?.name?.EN ?? match.competition?.metaData?.name ?? "UEFA competition";
  return name
    .replace("UEFA Champions League", "Champions League")
    .replace("UEFA Europa League", "Europa League")
    .replace("UEFA Europa Conference League", "Conference League");
}

function officialHonorsForCard(card) {
  const awards = SOCCER_OFFICIAL_HONORS.filter(
    (award) => award.edition === card.edition.key && award.player === card.entry.name
  );
  const honors = {};
  for (const award of awards) {
    if (award.kind === "bestPlayer") {
      honors.bestPlayer = true;
      honors.bestPlayerLabel = award.label;
    } else if (award.kind === "ballonDor") {
      honors.ballonDor = true;
      honors.ballonDorLabel = award.label;
    } else if (award.kind === "topScorer") {
      honors.topScorer = true;
      honors.topScorerLabel = award.label;
    } else if (award.kind === "positionalAward") {
      honors.positionalAward = true;
      honors.positionalAwardLabel = award.label;
    } else if (award.kind === "youngPlayer") {
      honors.youngPlayer = true;
      honors.youngPlayerLabel = award.label;
    }
  }
  return {
    honors: Object.keys(honors).length ? honors : undefined,
    sourceHonorUrls: [...new Set(awards.map((award) => award.sourceUrl))],
  };
}

function verifyOfficialHonorLedger() {
  const seen = new Set();
  for (const award of SOCCER_OFFICIAL_HONORS) {
    const edition = SOCCER_SELECTION_EDITIONS.find((candidate) => candidate.key === award.edition);
    if (!edition) throw new Error(`Honor ledger references unknown edition ${award.edition}.`);
    if (!edition.entries.some((entry) => entry.name === award.player)) {
      throw new Error(`Honor ledger references ${award.player}, who is not selected in ${award.edition}.`);
    }
    const key = `${award.edition}:${award.player}:${award.kind}`;
    if (seen.has(key)) throw new Error(`Honor ledger contains duplicate ${award.kind} entry for ${award.player} in ${award.edition}.`);
    seen.add(key);
    const officialSource = award.sourceUrl.startsWith("https://www.uefa.com/") || award.sourceUrl.startsWith("https://ballondor.com/");
    if (!award.label || !officialSource) {
      throw new Error(`Honor ledger has incomplete official provenance for ${award.player} in ${award.edition}.`);
    }
  }
}

function aggregateCard(card, matchData) {
  const aggregate = {
    minutes: 0,
    appearances: 0,
    goals: 0,
    assists: 0,
    shotsOnTarget: 0,
    shotsOffTarget: 0,
    cleanSheets: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    shotsFacedOnTarget: 0,
    saves: 0,
    teamAppearances: new Map(),
    matchIds: [],
    playerIds: new Set(card.sourcePlayerIds),
    playerRows: [],
  };

  for (const { match, rows } of matchData) {
    const row = rows.find((candidate) => card.sourcePlayerIds.includes(String(candidate.playerId))) ?? rows.find((candidate) => {
      if (!card.sourceBirthDate || candidate.player?.birthDate !== card.sourceBirthDate) return false;
      const candidateNames = playerNames(candidate).map(normalize);
      return candidateNames.includes(normalize(card.canonicalName));
    });
    if (!row) continue;
    aggregate.playerIds.add(String(row.playerId));
    const minutes = statValue(row, "minutes_played_official");
    const appearances = statValue(row, "matches_appearance");
    if (minutes <= 0 && appearances <= 0) continue;
    const teamId = String(row.teamId);
    const score = scoreForTeam(match, teamId);
    if (!score) throw new Error(`${card.edition.key}: could not determine ${card.entry.name}'s team score in match ${match.id}.`);
    const opponentShots = rows
      .filter((candidate) => String(candidate.teamId) !== teamId)
      .reduce((sum, candidate) => sum + statValue(candidate, "attempts_on_target"), 0);

    aggregate.minutes += minutes;
    aggregate.appearances += appearances || 1;
    aggregate.goals += statValue(row, "goals");
    aggregate.assists += statValue(row, "assists");
    aggregate.shotsOnTarget += statValue(row, "attempts_on_target");
    aggregate.shotsOffTarget += statValue(row, "attempts_off_target");
    aggregate.cleanSheets += score.against === 0 ? 1 : 0;
    aggregate.goalsFor += score.for;
    aggregate.goalsAgainst += score.against;
    aggregate.points += score.for > score.against ? 3 : score.for === score.against ? 1 : 0;
    aggregate.shotsFacedOnTarget += opponentShots;
    aggregate.saves += Math.max(0, opponentShots - score.against);
    aggregate.teamAppearances.set(teamId, {
      name: teamName(row),
      count: (aggregate.teamAppearances.get(teamId)?.count ?? 0) + 1,
    });
    aggregate.matchIds.push(String(match.id));
    aggregate.playerRows.push({ row, minutes });

  }

  if (aggregate.appearances <= 0 || aggregate.minutes <= 0) {
    throw new Error(`${card.edition.key}: ${card.entry.name} has no tracked appearances in the selected window.`);
  }
  const teamRows = [...aggregate.teamAppearances.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const representedTeamIds = new Set(teamRows.map(([teamId]) => teamId));
  const winningCompetitions = new Set();
  for (const { match } of matchData) {
    const final = match.round?.metaData?.type === "FINAL" || match.round?.mode === "FINAL";
    const winnerTeamId = String(match.winner?.match?.team?.id ?? "");
    if (final && representedTeamIds.has(winnerTeamId)) winningCompetitions.add(competitionHonorName(match));
  }
  const attempts = aggregate.shotsOnTarget + aggregate.shotsOffTarget;
  const stats = {
    minutes: round(aggregate.minutes, 1),
    appearances: round(aggregate.appearances, 0),
    goalsPer90: round(rate(aggregate.goals, aggregate.minutes)),
    assistsPer90: round(rate(aggregate.assists, aggregate.minutes)),
    shotsOnTargetPer90: round(rate(aggregate.shotsOnTarget, aggregate.minutes)),
    shotAccuracyPct: round(attempts ? aggregate.shotsOnTarget / attempts * 100 : 0, 1),
    cleanSheetPct: round(aggregate.cleanSheets / aggregate.appearances * 100, 1),
    goalsConcededPerMatch: round(aggregate.goalsAgainst / aggregate.appearances),
    savePct: round(aggregate.shotsFacedOnTarget ? aggregate.saves / aggregate.shotsFacedOnTarget * 100 : 0, 1),
    pointsPerMatch: round(aggregate.points / aggregate.appearances),
    goalDifferencePerMatch: round((aggregate.goalsFor - aggregate.goalsAgainst) / aggregate.appearances),
    ...deriveAdvancedStats(aggregate.playerRows, aggregate.minutes),
  };
  if (Object.values(stats).some((value) => !Number.isFinite(value))) {
    throw new Error(`${card.edition.key}: ${card.entry.name} contains a non-finite metric.`);
  }
  return {
    stats,
    team: teamRows[0][1].name,
    sourcePlayerIds: [...aggregate.playerIds],
    sourceTeamIds: teamRows.map(([teamId]) => teamId),
    sourceMatchIds: [...new Set(aggregate.matchIds)].sort((a, b) => Number(a) - Number(b)),
    honors: winningCompetitions.size ? {
      champion: true,
      championLabel: `${[...winningCompetitions].sort().join(" + ")} winner`,
    } : undefined,
  };
}

function percentile(value, values) {
  if (values.length <= 1) return 0.5;
  const lower = values.filter((other) => other < value).length;
  const equal = values.filter((other) => other === value).length;
  return (lower + (equal - 1) / 2) / (values.length - 1);
}

const ROLE_METRICS = {
  GK: [
    { keys: ["savePct"], weight: 0.45, category: "goalkeeping" },
    { keys: ["goalsConcededPerMatch"], weight: 0.2, category: "goalkeeping", inverse: true },
    { keys: ["cleanSheetPct"], weight: 0.15, category: "defense" },
    { keys: ["claimsPer90"], weight: 0.1, category: "goalkeeping" },
    { keys: ["passCompletionPct"], weight: 0.1, category: "control" },
  ],
  DEF: [
    { keys: ["tacklesWonPer90"], weight: 0.2, category: "defense" },
    { keys: ["recoveriesPer90"], weight: 0.2, category: "defense" },
    { keys: ["clearancesPer90"], weight: 0.15, category: "defense" },
    { keys: ["passCompletionPct"], weight: 0.1, category: "control" },
    { keys: ["progressiveDeliveriesPer90"], weight: 0.1, category: "control" },
    { keys: ["cleanSheetPct"], weight: 0.1, category: "defense" },
    { keys: ["goalsConcededPerMatch"], weight: 0.1, category: "defense", inverse: true },
    { keys: ["assistsPer90"], weight: 0.05, category: "creation" },
  ],
  MID: [
    { keys: ["assistsPer90"], weight: 0.2, category: "creation" },
    { keys: ["progressiveDeliveriesPer90"], weight: 0.2, category: "control" },
    { keys: ["passCompletionPct"], weight: 0.15, category: "control" },
    { keys: ["recoveriesPer90"], weight: 0.15, category: "defense" },
    { keys: ["dribblesPer90"], weight: 0.1, category: "attack" },
    { keys: ["goalsPer90"], weight: 0.1, category: "attack" },
    { keys: ["shotsOnTargetPer90"], weight: 0.1, category: "attack" },
  ],
  ATT: [
    { keys: ["goalsPer90"], weight: 0.3, category: "attack" },
    { keys: ["shotsOnTargetPer90"], weight: 0.2, category: "attack" },
    { keys: ["assistsPer90"], weight: 0.2, category: "creation" },
    { keys: ["dribblesPer90"], weight: 0.15, category: "attack" },
    { keys: ["shotAccuracyPct"], weight: 0.1, category: "attack" },
    { keys: ["progressiveDeliveriesPer90"], weight: 0.05, category: "control" },
  ],
};

function metricValue(player, metric) {
  for (const key of metric.keys) {
    const value = player.stats[key];
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function scoredMetric(player, peers, metric) {
  const value = metricValue(player, metric);
  if (value === null) return null;
  const peerValues = peers.map((peer) => metricValue(peer, metric)).filter(Number.isFinite);
  const rank = percentile(value, peerValues);
  return (metric.inverse ? 1 - rank : rank) * 20;
}

function honorPoints(honors) {
  if (!honors) return 0;
  let points = honors.champion ? 3 : 0;
  if (honors.bestPlayer || honors.ballonDor) points += 5;
  if (honors.topScorer || (honors.topScorerOrKeeper && !/goalkeeper/i.test(honors.topScorerOrKeeperLabel ?? ""))) points += 2;
  if (honors.positionalAward || (honors.topScorerOrKeeper && /goalkeeper/i.test(honors.topScorerOrKeeperLabel ?? ""))) points += 2;
  if (honors.youngPlayer) points += 1;
  return points;
}

function createPedigreeIndex(players) {
  const identities = new Map();
  for (const player of players) {
    const identity = identities.get(player.sourceIdentity) ?? { roles: new Set(), selections: 0, majorEditions: new Set() };
    identity.roles.add(player.role);
    identity.selections += 1;
    if (player.honors?.bestPlayer || player.honors?.ballonDor) identity.majorEditions.add(player.edition);
    identities.set(player.sourceIdentity, identity);
  }
  return new Map(players.map((player) => {
    const identity = identities.get(player.sourceIdentity);
    const peers = [...identities.values()].filter((candidate) => candidate.roles.has(player.role));
    const selectionRank = percentile(identity.selections, peers.map((candidate) => candidate.selections));
    const majorRank = percentile(identity.majorEditions.size, peers.map((candidate) => candidate.majorEditions.size));
    const selectionScore = 8 + selectionRank * 12;
    const majorScore = 8 + majorRank * 12;
    return [player.id, selectionScore * 0.8 + majorScore * 0.2];
  }));
}

function performanceFor(player, players, pedigreeIndex) {
  const peers = players.filter((candidate) => candidate.role === player.role);
  const metrics = ROLE_METRICS[player.role];
  const scored = metrics.map((metric) => ({ metric, score: scoredMetric(player, peers, metric) }));
  const available = scored.filter(({ score }) => score !== null);
  const availableWeight = available.reduce((sum, { metric }) => sum + metric.weight, 0);
  const observedScore = available.reduce((sum, { metric, score }) => sum + score * metric.weight, 0) / availableWeight;
  const values = { attack: 0, creation: 0, control: 0, defense: 0, goalkeeping: 0 };
  for (const category of Object.keys(values)) {
    const categoryMetrics = available.filter(({ metric }) => metric.category === category);
    const categoryWeight = categoryMetrics.reduce((sum, { metric }) => sum + metric.weight, 0);
    if (categoryWeight > 0) {
      values[category] = round(categoryMetrics.reduce((sum, { metric, score }) => sum + score * metric.weight, 0) / categoryWeight, 2);
    }
  }

  const minutesReliability = Math.min(1, player.stats.minutes / 900);
  const windowAlignment = player.editionKind === "calendar" ? 0.65 : 1;
  // A UEFA club campaign is still a small sample. Preserve at least 20% verified
  // selection pedigree even when every modern match metric is available.
  const dataConfidence = Math.min(0.8, minutesReliability * (0.35 + 0.65 * availableWeight) * windowAlignment);
  const pedigreeScore = pedigreeIndex.get(player.id);
  const adjustedPerformance = observedScore * dataConfidence + pedigreeScore * (1 - dataConfidence);
  const achievementScore = 10 + Math.min(10, honorPoints(player.honors) / 12 * 10);
  return {
    ...values,
    observedScore: round(observedScore, 2),
    pedigreeScore: round(pedigreeScore, 2),
    dataConfidence: round(dataConfidence, 3),
    achievementScore: round(achievementScore, 2),
    roleScore: round(Math.max(0, Math.min(20, adjustedPerformance * 0.85 + achievementScore * 0.15)), 2),
  };
}

function assignTeamSuccess(players) {
  const values = players.map((player) => player.stats.pointsPerMatch);
  for (const player of players) {
    const reliability = Math.min(1, player.stats.minutes / 720);
    player.teamSuccess = round((percentile(player.stats.pointsPerMatch, values) * 2 - 1) * reliability, 2);
  }
}

function assignPerformance(players) {
  const pedigreeIndex = createPedigreeIndex(players);
  for (const player of players) player.performance = performanceFor(player, players, pedigreeIndex);
}

function generatedSource(players) {
  return `import type { SoccerPlayerCard } from "./types";\n\n// Generated by scripts/generate-soccer-data.mjs. Do not edit by hand.\nexport const SOCCER_SOURCE_REVISION = ${JSON.stringify(SOURCE_REVISION)};\n\nexport const SOCCER_PLAYER_DATABASE: SoccerPlayerCard[] = ${JSON.stringify(players, null, 2)};\n`;
}

async function build() {
  verifyOfficialHonorLedger();
  const apiKey = await discoverApiKey();
  const resolvedCards = [];
  for (const edition of SOCCER_SELECTION_EDITIONS) {
    const rankingRows = await rankingRowsForEdition(apiKey, edition);
    for (const entry of edition.entries) {
      const resolved = resolvePlayer(entry, rankingRows, edition.key);
      const row = resolved.row;
      resolvedCards.push({
        edition,
        entry,
        sourcePlayerId: String(row.playerId),
        sourcePlayerIds: resolved.playerIds,
        sourceBirthDate: row.player.birthDate,
        sourceIdentity: `${row.player.birthDate ?? "unknown"}:${normalize(playerNames(row)[0])}`,
        canonicalName: playerNames(row)[0],
      });
    }
  }

  const cardsWithMatches = await mapLimit(resolvedCards, 10, async (card) => ({
    ...card,
    matches: await matchesForCard(apiKey, card.edition, card.sourcePlayerIds),
  }));
  for (const card of cardsWithMatches) {
    if (card.matches.length === 0) throw new Error(`${card.edition.key}: ${card.entry.name} has no matching UEFA fixtures.`);
  }

  const matchesById = new Map();
  for (const card of cardsWithMatches) {
    for (const match of card.matches) matchesById.set(String(match.id), match);
  }
  const matchRows = new Map((await mapLimit([...matchesById.entries()], 10, async ([matchId, match]) => [
    matchId,
    { match, rows: await matchStatistics(apiKey, matchId) },
  ])).map((entry) => entry));

  const players = cardsWithMatches.map((card) => {
    const aggregate = aggregateCard(card, card.matches.map((match) => matchRows.get(String(match.id))));
    const officialAwards = officialHonorsForCard(card);
    const honors = { ...(aggregate.honors ?? {}), ...(officialAwards.honors ?? {}) };
    const id = `${slug(card.canonicalName)}-${card.edition.key.toLowerCase()}`;
    return {
      sport: "soccer",
      id,
      sourcePlayerId: card.sourcePlayerId,
      sourcePlayerIds: aggregate.sourcePlayerIds,
      sourceIdentity: card.sourceIdentity,
      name: card.canonicalName,
      role: card.entry.role,
      era: card.edition.label,
      team: aggregate.team,
      sourceTeamIds: aggregate.sourceTeamIds,
      edition: card.edition.key,
      editionKind: card.edition.selection === "fan-team" ? "calendar" : "season",
      stats: aggregate.stats,
      performance: null,
      teamSuccess: 0,
      ...(Object.keys(honors).length ? { honors } : {}),
      sourcePositionLabels: [`UEFA selection: ${card.entry.role}`],
      sourceRevision: SOURCE_REVISION,
      sourceMatchIds: aggregate.sourceMatchIds,
      sourceSelectionUrl: card.edition.sourceUrl,
      sourceHonorUrls: officialAwards.sourceHonorUrls,
    };
  });
  if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error("Generated duplicate soccer card IDs.");
  assignTeamSuccess(players);
  assignPerformance(players);

  const manifestPlayers = players.map(({
    id, sourcePlayerId, sourcePlayerIds, sourceIdentity, name, edition, team, sourceTeamIds, sourcePositionLabels, sourceMatchIds, sourceSelectionUrl, sourceHonorUrls,
  }) => ({ id, sourcePlayerId, sourcePlayerIds, sourceIdentity, name, edition, team, sourceTeamIds, sourcePositionLabels, sourceMatchIds, sourceSelectionUrl, sourceHonorUrls }));
  const outputPlayers = players.map(({ sourceMatchIds: _matches, sourceSelectionUrl: _selection, sourceHonorUrls: _honors, ...player }) => player);
  const manifest = {
    source: "UEFA.com official selections and UEFA public match statistics",
    revision: SOURCE_REVISION,
    apiVersions: { competition: "v2", match: "v5", matchStatistics: "v2" },
    editions: SOCCER_SELECTION_EDITIONS.map(({ key, label, selection, window, sourceUrl, entries }) => ({
      key, label, selection, window, sourceUrl, expectedCards: entries.length,
    })),
    players: manifestPlayers,
  };
  return {
    source: generatedSource(outputPlayers),
    manifest,
  };
}

async function recalculateCommitted() {
  const source = await readFile(OUTPUT, "utf8");
  const playersMatch = source.match(/SOCCER_PLAYER_DATABASE: SoccerPlayerCard\[\] = ([\s\S]*);\s*$/);
  if (!playersMatch) throw new Error("Generated soccer data file has an invalid shape.");
  const players = JSON.parse(playersMatch[1]);
  const manifest = JSON.parse(await readFile(PROVENANCE_OUTPUT, "utf8"));
  const provenanceById = new Map(manifest.players.map((player) => [player.id, player]));
  const rowsByMatch = new Map();
  const advancedKeys = [
    "nonPenaltyGoalsPer90", "tacklesWonPer90", "recoveriesPer90", "clearancesPer90",
    "passCompletionPct", "progressiveDeliveriesPer90", "dribblesPer90", "claimsPer90",
  ];

  for (const player of players) {
    const provenance = provenanceById.get(player.id);
    if (!provenance) throw new Error(`${player.id}: missing provenance while recalculating.`);
    const playerRows = [];
    for (const matchId of provenance.sourceMatchIds) {
      if (!rowsByMatch.has(matchId)) {
        rowsByMatch.set(matchId, JSON.parse(await readFile(join(CACHE, "match-stats", `${matchId}.json`), "utf8")));
      }
      const row = rowsByMatch.get(matchId).find((candidate) => player.sourcePlayerIds.includes(String(candidate.playerId)));
      if (!row) continue;
      const minutes = statValue(row, "minutes_played_official");
      if (minutes > 0) playerRows.push({ row, minutes });
    }
    for (const key of advancedKeys) delete player.stats[key];
    Object.assign(player.stats, deriveAdvancedStats(playerRows, player.stats.minutes));
  }
  assignTeamSuccess(players);
  assignPerformance(players);
  await writeFile(OUTPUT, generatedSource(players));
  console.log(`Recalculated ${players.length} committed football cards from verified cached UEFA match data.`);
}

async function verifyCommitted() {
  verifyOfficialHonorLedger();
  const source = await readFile(OUTPUT, "utf8");
  const playersMatch = source.match(/SOCCER_PLAYER_DATABASE: SoccerPlayerCard\[\] = ([\s\S]*);\s*$/);
  if (!playersMatch) throw new Error("Generated soccer data file has an invalid shape.");
  const manifest = JSON.parse(await readFile(PROVENANCE_OUTPUT, "utf8"));
  const players = JSON.parse(playersMatch[1]);
  if (manifest.revision !== SOURCE_REVISION) throw new Error("Soccer manifest selection revision is stale.");
  if (manifest.editions.length !== SOCCER_SELECTION_EDITIONS.length) throw new Error("Soccer manifest is missing an official selection edition.");
  if (players.length !== 298 || new Set(players.map((player) => player.id)).size !== 298) throw new Error("Soccer database must contain 298 unique cards.");
  if (manifest.players.length !== 298) throw new Error("Soccer provenance manifest must contain 298 cards.");
  const manifestById = new Map(manifest.players.map((player) => [player.id, player]));
  for (const edition of SOCCER_SELECTION_EDITIONS) {
    const cards = players.filter((player) => player.edition === edition.key);
    if (cards.length !== edition.entries.length) throw new Error(`${edition.key}: expected ${edition.entries.length} cards, found ${cards.length}.`);
    edition.entries.forEach((entry, index) => {
      const expected = officialHonorsForCard({ edition, entry });
      const actual = cards[index].honors;
      if (expected.honors?.bestPlayer && (!actual?.bestPlayer || actual.bestPlayerLabel !== expected.honors.bestPlayerLabel)) {
        throw new Error(`${edition.key}: ${entry.name} is missing its verified best-player honor.`);
      }
      for (const kind of ["ballonDor", "topScorer", "positionalAward", "youngPlayer"]) {
        const label = `${kind}Label`;
        if (expected.honors?.[kind] && (!actual?.[kind] || actual[label] !== expected.honors[label])) {
          throw new Error(`${edition.key}: ${entry.name} is missing its verified ${kind} honor.`);
        }
      }
    });
  }
  for (const player of players) {
    const provenance = manifestById.get(player.id);
    if (!provenance || provenance.sourceMatchIds.length === 0 || !provenance.sourceSelectionUrl) throw new Error(`${player.id} has incomplete provenance.`);
    if (player.sourceRevision !== SOURCE_REVISION || !player.sourcePlayerId || player.sourcePlayerIds.length === 0 || !player.sourceIdentity || player.sourceTeamIds.length === 0) throw new Error(`${player.id} is missing a canonical UEFA identity.`);
    if (![...Object.values(player.stats), ...Object.values(player.performance), player.teamSuccess].every(Number.isFinite)) throw new Error(`${player.id} contains a non-finite value.`);
    for (const field of ["observedScore", "pedigreeScore", "dataConfidence", "achievementScore", "roleScore"]) {
      if (!Number.isFinite(player.performance[field])) throw new Error(`${player.id} is missing generated ${field}.`);
    }
    if (player.performance.dataConfidence < 0 || player.performance.dataConfidence > 0.8 || player.performance.roleScore < 0 || player.performance.roleScore > 20) {
      throw new Error(`${player.id} has an out-of-range generated card rating.`);
    }
    if (player.stats.minutes <= 0 || player.stats.appearances <= 0) throw new Error(`${player.id} has no verified playing time.`);
    if (player.sourcePositionLabels.length !== 1 || player.sourcePositionLabels[0] !== `UEFA selection: ${player.role}`) throw new Error(`${player.id} does not use its official selection role.`);
    if (player.honors?.champion && !player.honors.championLabel) throw new Error(`${player.id} has an unlabeled championship honor.`);
    if ((player.honors?.bestPlayer || player.honors?.ballonDor || player.honors?.topScorer || player.honors?.positionalAward || player.honors?.youngPlayer) && provenance.sourceHonorUrls.length === 0) throw new Error(`${player.id} has an award without official provenance.`);
  }
  console.log("Soccer data verified offline: 26 official UEFA selections, 298 finite cards, canonical IDs, roles, teams, and match provenance.");
}

if (VERIFY_ONLY) await verifyCommitted();
else if (RECALCULATE_ONLY) await recalculateCommitted();
else {
  const generated = await build();
  await writeFile(OUTPUT, generated.source);
  await writeFile(PROVENANCE_OUTPUT, `${JSON.stringify(generated.manifest, null, 2)}\n`);
  console.log(`Generated 298 UEFA selection cards at ${OUTPUT}`);
}
