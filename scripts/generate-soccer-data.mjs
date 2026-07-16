import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOCCER_SELECTION_ALIASES, SOCCER_SELECTION_EDITIONS } from "./soccer-selections.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "soccer-data", "uefa");
const OUTPUT = join(ROOT, "shared", "src", "soccerPlayers.generated.ts");
const PROVENANCE_OUTPUT = join(ROOT, "shared", "src", "soccerPlayers.provenance.json");
const VERIFY_ONLY = process.argv.includes("--verify");
const API_BOOTSTRAP = "https://www.uefa.com/uefachampionsleague/history/seasons/2001/statistics/";
const API_BASE = {
  competition: "https://compstats.uefa.com/v2",
  match: "https://match.uefa.com/v5",
  matchStats: "https://matchstats.uefa.com/v2",
};
const SOURCE_REVISION = `uefa-v2-${createHash("sha256")
  .update(JSON.stringify(SOCCER_SELECTION_EDITIONS))
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

const statValue = (row, name) => {
  const value = row?.statistics?.find((stat) => stat.name === name)?.value;
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error(`${row?.playerId ?? "unknown player"}: non-numeric ${name}.`);
  return parsed;
};

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
    champion: false,
    playerIds: new Set(card.sourcePlayerIds),
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

    const final = String(match.round?.metaData?.type ?? "").includes("FINAL");
    if (final && score.for > score.against) aggregate.champion = true;
  }

  if (aggregate.appearances <= 0 || aggregate.minutes <= 0) {
    throw new Error(`${card.edition.key}: ${card.entry.name} has no tracked appearances in the selected window.`);
  }
  const teamRows = [...aggregate.teamAppearances.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
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
    honors: aggregate.champion ? { champion: true } : undefined,
  };
}

function percentile(value, values) {
  if (values.length <= 1) return 0.5;
  const lower = values.filter((other) => other < value).length;
  const equal = values.filter((other) => other === value).length;
  return (lower + (equal - 1) / 2) / (values.length - 1);
}

function category(player, peers, metrics) {
  const reliability = Math.min(1, player.stats.minutes / 720);
  const values = metrics.map(({ key, inverse = false }) => {
    const raw = percentile(player.stats[key], peers.map((peer) => peer.stats[key]));
    const adjusted = inverse ? 1 - raw : raw;
    return 0.5 + (adjusted - 0.5) * reliability;
  });
  return round(values.reduce((sum, value) => sum + value, 0) / values.length * 20, 2);
}

function performanceFor(player, players) {
  const peers = players.filter((candidate) => candidate.role === player.role);
  const values = {
    attack: category(player, peers, [{ key: "goalsPer90" }, { key: "shotsOnTargetPer90" }, { key: "shotAccuracyPct" }]),
    creation: category(player, peers, [{ key: "assistsPer90" }, { key: "shotsOnTargetPer90" }]),
    control: category(player, peers, [{ key: "pointsPerMatch" }, { key: "goalDifferencePerMatch" }]),
    defense: category(player, peers, [{ key: "cleanSheetPct" }, { key: "goalsConcededPerMatch", inverse: true }]),
    goalkeeping: category(player, peers, [{ key: "savePct" }, { key: "cleanSheetPct" }, { key: "goalsConcededPerMatch", inverse: true }]),
  };
  const weights = {
    GK: { goalkeeping: 0.65, defense: 0.25, control: 0.1 },
    DEF: { defense: 0.6, control: 0.2, creation: 0.1, attack: 0.1 },
    MID: { creation: 0.35, control: 0.3, attack: 0.2, defense: 0.15 },
    ATT: { attack: 0.6, creation: 0.2, control: 0.15, defense: 0.05 },
  }[player.role];
  return {
    ...values,
    roleScore: round(Object.entries(weights).reduce((sum, [key, weight]) => sum + values[key] * weight, 0), 2),
  };
}

function assignTeamSuccess(players) {
  for (const edition of SOCCER_SELECTION_EDITIONS) {
    const cards = players.filter((player) => player.edition === edition.key);
    const values = cards.map((player) => player.stats.pointsPerMatch);
    for (const player of cards) {
      player.teamSuccess = round(percentile(player.stats.pointsPerMatch, values) * 4 - 2, 2);
    }
  }
}

async function build() {
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
      ...(aggregate.honors ? { honors: aggregate.honors } : {}),
      sourcePositionLabels: [`UEFA selection: ${card.entry.role}`],
      sourceRevision: SOURCE_REVISION,
      sourceMatchIds: aggregate.sourceMatchIds,
      sourceSelectionUrl: card.edition.sourceUrl,
    };
  });
  if (new Set(players.map((player) => player.id)).size !== players.length) throw new Error("Generated duplicate soccer card IDs.");
  assignTeamSuccess(players);
  for (const player of players) player.performance = performanceFor(player, players);

  const manifestPlayers = players.map(({
    id, sourcePlayerId, sourcePlayerIds, sourceIdentity, name, edition, team, sourceTeamIds, sourcePositionLabels, sourceMatchIds, sourceSelectionUrl,
  }) => ({ id, sourcePlayerId, sourcePlayerIds, sourceIdentity, name, edition, team, sourceTeamIds, sourcePositionLabels, sourceMatchIds, sourceSelectionUrl }));
  const outputPlayers = players.map(({ sourceMatchIds: _matches, sourceSelectionUrl: _selection, ...player }) => player);
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
    source: `import type { SoccerPlayerCard } from "./types";\n\n// Generated by scripts/generate-soccer-data.mjs. Do not edit by hand.\nexport const SOCCER_SOURCE_REVISION = ${JSON.stringify(SOURCE_REVISION)};\n\nexport const SOCCER_PLAYER_DATABASE: SoccerPlayerCard[] = ${JSON.stringify(outputPlayers, null, 2)};\n`,
    manifest,
  };
}

async function verifyCommitted() {
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
  }
  for (const player of players) {
    const provenance = manifestById.get(player.id);
    if (!provenance || provenance.sourceMatchIds.length === 0 || !provenance.sourceSelectionUrl) throw new Error(`${player.id} has incomplete provenance.`);
    if (player.sourceRevision !== SOURCE_REVISION || !player.sourcePlayerId || player.sourcePlayerIds.length === 0 || !player.sourceIdentity || player.sourceTeamIds.length === 0) throw new Error(`${player.id} is missing a canonical UEFA identity.`);
    if (![...Object.values(player.stats), ...Object.values(player.performance), player.teamSuccess].every(Number.isFinite)) throw new Error(`${player.id} contains a non-finite value.`);
    if (player.stats.minutes <= 0 || player.stats.appearances <= 0) throw new Error(`${player.id} has no verified playing time.`);
    if (player.sourcePositionLabels.length !== 1 || player.sourcePositionLabels[0] !== `UEFA selection: ${player.role}`) throw new Error(`${player.id} does not use its official selection role.`);
  }
  console.log("Soccer data verified offline: 26 official UEFA selections, 298 finite cards, canonical IDs, roles, teams, and match provenance.");
}

if (VERIFY_ONLY) await verifyCommitted();
else {
  const generated = await build();
  await writeFile(OUTPUT, generated.source);
  await writeFile(PROVENANCE_OUTPUT, `${JSON.stringify(generated.manifest, null, 2)}\n`);
  console.log(`Generated 298 UEFA selection cards at ${OUTPUT}`);
}
