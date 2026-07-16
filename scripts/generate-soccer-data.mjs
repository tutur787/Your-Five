import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REVISION = "b0bc9f22dd77c206ddedc1d742893b3bbe64baec";
const BASE = `https://raw.githubusercontent.com/statsbomb/open-data/${REVISION}/data`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".cache", "soccer-data", REVISION);
const OUTPUT = join(ROOT, "shared", "src", "soccerPlayers.generated.ts");
const VERIFY_ONLY = process.argv.includes("--verify");

const EDITIONS = {
  ARS03: { competitionId: 2, seasonId: 44, expectedMatches: 38, kind: "club", label: "Arsenal · Premier League 2003/04" },
  EPL15: { competitionId: 2, seasonId: 27, expectedMatches: 380, kind: "club", label: "Premier League 2015/16" },
  SA15: { competitionId: 12, seasonId: 27, expectedMatches: 380, kind: "club", label: "Serie A 2015/16" },
  WC18: { competitionId: 43, seasonId: 3, expectedMatches: 64, kind: "tournament", label: "FIFA World Cup 2018" },
  WC22: { competitionId: 43, seasonId: 106, expectedMatches: 64, kind: "tournament", label: "FIFA World Cup 2022" },
  EURO20: { competitionId: 55, seasonId: 43, expectedMatches: 51, kind: "tournament", label: "UEFA Euro 2020" },
  EURO24: { competitionId: 55, seasonId: 282, expectedMatches: 51, kind: "tournament", label: "UEFA Euro 2024" },
  AFCON23: { competitionId: 1267, seasonId: 107, expectedMatches: 52, kind: "tournament", label: "Africa Cup of Nations 2023" },
};

const CANDIDATES = [
  ["SA15", "Juventus", "Gianluigi Buffon", "GK"], ["EPL15", "Arsenal", "Petr Cech", "GK"],
  ["WC18", "France", "Hugo Lloris", "GK"], ["WC18", "Belgium", "Thibaut Courtois", "GK", { topScorerOrKeeper: true }],
  ["WC18", "Brazil", "Alisson", "GK"], ["WC22", "Argentina", "Emiliano Martinez", "GK", { champion: true, topScorerOrKeeper: true }],
  ["EURO20", "Italy", "Gianluigi Donnarumma", "GK", { champion: true, bestPlayer: true }], ["EURO24", "Slovenia", "Jan Oblak", "GK"],
  ["EURO24", "France", "Mike Maignan", "GK"], ["WC18", "Costa Rica", "Keylor Navas", "GK"],
  ["EPL15", "Arsenal", "Laurent Koscielny", "DEF"], ["EPL15", "Chelsea", "John Terry", "DEF"],
  ["EPL15", "Manchester City", "Vincent Kompany", "DEF"], ["SA15", "Juventus", "Leonardo Bonucci", "DEF", { champion: true }],
  ["SA15", "Juventus", "Giorgio Chiellini", "DEF", { champion: true }], ["SA15", "Juventus", "Patrice Evra", "DEF", { champion: true }],
  ["SA15", "Napoli", "Kalidou Koulibaly", "DEF"], ["SA15", "Juventus", "Andrea Barzagli", "DEF", { champion: true }],
  ["WC18", "Spain", "Sergio Ramos", "DEF"], ["WC18", "France", "Raphael Varane", "DEF", { champion: true }],
  ["WC18", "Brazil", "Marcelo", "DEF"], ["WC18", "Spain", "Gerard Pique", "DEF"],
  ["WC18", "France", "Samuel Umtiti", "DEF", { champion: true }], ["WC18", "Brazil", "Thiago Silva", "DEF"],
  ["EURO24", "Netherlands", "Virgil van Dijk", "DEF"], ["EURO24", "England", "Kyle Walker", "DEF"],
  ["EURO24", "France", "William Saliba", "DEF"], ["AFCON23", "Morocco", "Achraf Hakimi", "DEF"],
  ["ARS03", "Arsenal", "Patrick Vieira", "MID", { champion: true }], ["EPL15", "Chelsea", "Francesc Fabregas", "MID"],
  ["EPL15", "Arsenal", "Mesut Ozil", "MID"], ["EPL15", "Manchester City", "David Silva", "MID"],
  ["EPL15", "Leicester City", "N Golo Kante", "MID", { champion: true }], ["SA15", "Juventus", "Paul Pogba", "MID", { champion: true }],
  ["SA15", "AS Roma", "Miralem Pjanic", "MID"], ["WC18", "Croatia", "Luka Modric", "MID", { bestPlayer: true }],
  ["WC18", "Germany", "Toni Kroos", "MID"], ["WC18", "Spain", "Andres Iniesta", "MID"],
  ["WC18", "Spain", "Sergio Busquets", "MID"], ["WC18", "Belgium", "Kevin De Bruyne", "MID"],
  ["WC22", "England", "Jude Bellingham", "MID"], ["EURO24", "Spain", "Rodrigo Hernandez Cascante", "MID", { champion: true, bestPlayer: true }],
  ["ARS03", "Arsenal", "Thierry Henry", "ATT", { champion: true, topScorerOrKeeper: true }], ["ARS03", "Arsenal", "Dennis Bergkamp", "ATT", { champion: true }],
  ["EURO20", "Portugal", "Cristiano Ronaldo", "ATT", { topScorerOrKeeper: true }], ["WC22", "Argentina", "Lionel Messi", "ATT", { champion: true, bestPlayer: true }],
  ["WC22", "France", "Kylian Mbappe", "ATT", { topScorerOrKeeper: true }], ["WC18", "Brazil", "Neymar", "ATT"],
  ["EPL15", "Manchester City", "Sergio Aguero", "ATT"], ["EPL15", "Tottenham Hotspur", "Harry Kane", "ATT", { topScorerOrKeeper: true }],
  ["EPL15", "Leicester City", "Jamie Vardy", "ATT", { champion: true }], ["EPL15", "Leicester City", "Riyad Mahrez", "ATT", { champion: true }],
  ["SA15", "Napoli", "Gonzalo Higuain", "ATT", { topScorerOrKeeper: true }], ["SA15", "Juventus", "Paulo Dybala", "ATT", { champion: true }],
  ["SA15", "AS Roma", "Mohamed Salah", "ATT"], ["WC18", "France", "Antoine Griezmann", "ATT", { champion: true }],
  ["WC18", "Belgium", "Eden Hazard", "ATT"], ["EURO20", "Poland", "Robert Lewandowski", "ATT"],
  ["EURO24", "Spain", "Lamine Yamal", "ATT", { champion: true }], ["EPL15", "Arsenal", "Alexis Sanchez", "ATT"],
].map(([edition, team, search, role, honors = {}]) => ({ edition, team, search, role, honors }));

const POSITION_TO_ROLE = new Map([
  ["Goalkeeper", "GK"],
  ...["Right Back", "Right Center Back", "Center Back", "Left Center Back", "Left Back", "Right Wing Back", "Left Wing Back"].map((p) => [p, "DEF"]),
  ...["Right Defensive Midfield", "Center Defensive Midfield", "Left Defensive Midfield", "Right Midfield", "Right Center Midfield", "Center Midfield", "Left Center Midfield", "Left Midfield", "Right Attacking Midfield", "Center Attacking Midfield", "Left Attacking Midfield"].map((p) => [p, "MID"]),
  ...["Right Wing", "Left Wing", "Right Center Forward", "Center Forward", "Left Center Forward", "Secondary Striker"].map((p) => [p, "ATT"]),
]);

const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const slug = (value) => normalize(value).replace(/ /g, "-");

async function cachedJson(relativePath) {
  const path = join(CACHE, relativePath);
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch {
    if (VERIFY_ONLY) throw new Error(`Missing cached source file: ${relativePath}`);
    const response = await fetch(`${BASE}/${relativePath}`);
    if (!response.ok) throw new Error(`StatsBomb ${response.status}: ${relativePath}`);
    const text = await response.text();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
    return JSON.parse(text);
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; results[index] = await fn(items[index], index); }
  }));
  return results;
}

const timeToMinutes = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  const [minutes, seconds] = value.split(":").map(Number);
  return minutes + seconds / 60;
};
const freshAggregate = (candidate) => ({ candidate, id: null, name: null, positionMinutes: new Map(), matchIds: new Set(), minutes: 0,
  nonPenaltyGoals: 0, xg: 0, assists: 0, xa: 0, completedDribbles: 0, progressiveActions: 0, passes: 0, completedPasses: 0,
  recoveries: 0, tacklesWon: 0, interceptions: 0, duels: 0, duelsWon: 0, pressureRegains: 0, saves: 0, goalsConceded: 0,
  xgFaced: 0, claims: 0, sweeperActions: 0 });
const matchesSearch = (name, search) => {
  const sourceTokens = new Set(normalize(name).split(" "));
  return normalize(search).split(" ").every((token) => sourceTokens.has(token));
};
const isDuelWon = (event) => (event.duel?.type?.name ?? "").includes("Won") || ["Won", "Success In Play", "Success Out"].includes(event.duel?.outcome?.name ?? "");
const isProgressive = (event) => { const end = event.pass?.end_location ?? event.carry?.end_location; return Array.isArray(event.location) && Array.isArray(end) && end[0] - event.location[0] >= 10; };

function recordEvents(aggregate, events) {
  const shotByKeyPass = new Map(events.filter((event) => event.type?.name === "Shot" && event.shot?.key_pass_id).map((event) => [event.shot.key_pass_id, event]));
  const eventById = new Map(events.map((event) => [event.id, event]));
  for (const event of events.filter((item) => item.player?.id === aggregate.id)) {
    const type = event.type?.name;
    if (type === "Shot") { aggregate.xg += event.shot?.statsbomb_xg ?? 0; if (event.shot?.outcome?.name === "Goal" && event.shot?.type?.name !== "Penalty") aggregate.nonPenaltyGoals++; }
    if (type === "Pass") { aggregate.passes++; if (!event.pass?.outcome) aggregate.completedPasses++; if (event.pass?.goal_assist) aggregate.assists++; aggregate.xa += shotByKeyPass.get(event.id)?.shot?.statsbomb_xg ?? 0; if (isProgressive(event)) aggregate.progressiveActions++; }
    if (type === "Carry" && isProgressive(event)) aggregate.progressiveActions++;
    if (type === "Dribble" && event.dribble?.outcome?.name === "Complete") aggregate.completedDribbles++;
    if (type === "Ball Recovery") { aggregate.recoveries++; if (event.counterpress) aggregate.pressureRegains++; }
    if (type === "Interception") aggregate.interceptions++;
    if (type === "Duel") { aggregate.duels++; if (isDuelWon(event)) aggregate.duelsWon++; if (event.duel?.type?.name === "Tackle" && isDuelWon(event)) aggregate.tacklesWon++; }
    if (type === "Goal Keeper") {
      const keeperType = event.goalkeeper?.type?.name ?? "";
      if (/Saved|Collected|Smother|Punched/.test(keeperType)) aggregate.saves++;
      if (keeperType === "Goal Conceded" || keeperType === "Penalty Conceded") aggregate.goalsConceded++;
      if (/Collected|Claim/.test(keeperType)) aggregate.claims++;
      if (keeperType === "Keeper Sweeper") aggregate.sweeperActions++;
      for (const relatedId of event.related_events ?? []) { const shot = eventById.get(relatedId); if (shot?.type?.name === "Shot" && ["Goal", "Saved", "Saved to Post"].includes(shot.shot?.outcome?.name)) aggregate.xgFaced += shot.shot?.statsbomb_xg ?? 0; }
    }
  }
}

const rate = (value, minutes) => minutes > 0 ? value * 90 / minutes : 0;
const round = (value, digits = 3) => Number(value.toFixed(digits));
function percentile(value, values) { if (values.length <= 1) return 0.5; const lower = values.filter((other) => other < value).length; const equal = values.filter((other) => other === value).length; return (lower + (equal - 1) / 2) / (values.length - 1); }
function category(player, peers, metrics) {
  const reliability = Math.min(1, player.stats.minutes / (player.editionKind === "club" ? 900 : 360));
  const scores = metrics.map((metric) => 0.5 + (percentile(player.stats[metric], peers.map((peer) => peer.stats[metric])) - 0.5) * reliability);
  return round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 20, 2);
}
function performanceFor(player, players) {
  const peers = players.filter((peer) => peer.role === player.role);
  const values = {
    attack: category(player, peers, ["nonPenaltyGoalsPer90", "xgPer90", "completedDribblesPer90"]),
    creation: category(player, peers, ["assistsPer90", "xaPer90", "passCompletionPct"]),
    progression: category(player, peers, ["progressiveActionsPer90", "passCompletionPct"]),
    defense: category(player, peers, ["tacklesWonPer90", "interceptionsPer90", "duelWinPct", "recoveriesPer90", "pressureRegainsPer90"]),
    goalkeeping: category(player, peers, ["savePct", "xgPreventedPer90", "claimsPer90", "sweeperActionsPer90", "passCompletionPct"]),
  };
  const weights = { GK: { goalkeeping: .6, progression: .25, defense: .15 }, DEF: { defense: .55, progression: .25, creation: .1, attack: .1 }, MID: { creation: .3, progression: .3, defense: .25, attack: .15 }, ATT: { attack: .5, creation: .25, progression: .15, defense: .1 } }[player.role];
  return { ...values, roleScore: round(Object.entries(weights).reduce((sum, [key, weight]) => sum + values[key] * weight, 0), 2) };
}

function pointsPerMatch(matches) {
  const table = new Map(); const row = (team) => { if (!table.has(team)) table.set(team, { points: 0, games: 0 }); return table.get(team); };
  for (const match of matches) { const home = row(match.home_team.home_team_name); const away = row(match.away_team.away_team_name); home.games++; away.games++; if (match.home_score > match.away_score) home.points += 3; else if (match.away_score > match.home_score) away.points += 3; else { home.points++; away.points++; } }
  return new Map([...table].map(([team, value]) => [team, value.points / value.games]));
}

async function build() {
  if (CANDIDATES.length !== 60) throw new Error(`Expected 60 candidate cards, found ${CANDIDATES.length}`);
  const aggregates = new Map(CANDIDATES.map((candidate) => [`${candidate.edition}:${candidate.search}`, freshAggregate(candidate)]));
  const editionManifest = []; const teamSuccessByEdition = new Map();
  for (const [editionKey, edition] of Object.entries(EDITIONS)) {
    const matches = await cachedJson(`matches/${edition.competitionId}/${edition.seasonId}.json`);
    if (matches.length !== edition.expectedMatches) throw new Error(`${editionKey}: expected ${edition.expectedMatches} matches, found ${matches.length}`);
    const editionCandidates = [...aggregates.values()].filter((aggregate) => aggregate.candidate.edition === editionKey);
    const teams = new Set(editionCandidates.map((aggregate) => aggregate.candidate.team));
    const selectedMatches = matches.filter((match) => teams.has(match.home_team.home_team_name) || teams.has(match.away_team.away_team_name));
    const matchFiles = await mapLimit(selectedMatches, 8, async (match) => ({ match, lineups: await cachedJson(`lineups/${match.match_id}.json`), events: await cachedJson(`events/${match.match_id}.json`) }));
    for (const aggregate of editionCandidates) {
      for (const { match, lineups, events } of matchFiles) {
        const teamLineup = lineups.find((lineup) => lineup.team_name === aggregate.candidate.team); if (!teamLineup) continue;
        const sourceMatches = teamLineup.lineup.filter((player) => matchesSearch(player.player_name, aggregate.candidate.search));
        if (sourceMatches.length > 1) throw new Error(`${editionKey}: ambiguous source name ${aggregate.candidate.search}`);
        const sourcePlayer = sourceMatches[0]; if (!sourcePlayer) continue;
        if (aggregate.id !== null && aggregate.id !== sourcePlayer.player_id) throw new Error(`${editionKey}: player ID changed for ${aggregate.candidate.search}`);
        aggregate.id = sourcePlayer.player_id; aggregate.name = sourcePlayer.player_name; aggregate.matchIds.add(match.match_id);
        const maxPeriod = Math.max(...events.map((event) => event.period ?? 2));
        const matchEnd = maxPeriod >= 4 ? 120 : 90;
        for (const stint of sourcePlayer.positions) { if (!POSITION_TO_ROLE.has(stint.position)) throw new Error(`${editionKey}: unsupported position ${stint.position}`); const minutes = Math.max(0, timeToMinutes(stint.to, matchEnd) - timeToMinutes(stint.from)); aggregate.minutes += minutes; aggregate.positionMinutes.set(stint.position, (aggregate.positionMinutes.get(stint.position) ?? 0) + minutes); }
        recordEvents(aggregate, events);
      }
      if (aggregate.id === null) throw new Error(`${editionKey}: could not resolve ${aggregate.candidate.search}`);
    }
    const ppm = pointsPerMatch(matches); const values = [...ppm.values()];
    teamSuccessByEdition.set(editionKey, new Map([...ppm].map(([team, value]) => [team, round(percentile(value, values) * 4 - 2, 2)])));
    editionManifest.push({ key: editionKey, competitionId: edition.competitionId, seasonId: edition.seasonId, expectedMatches: edition.expectedMatches, selectedMatchIds: selectedMatches.map((match) => match.match_id) });
  }

  const seen = new Set();
  const players = [...aggregates.values()].map((aggregate) => {
    const edition = EDITIONS[aggregate.candidate.edition]; const minimum = edition.kind === "club" ? 900 : 180;
    if (aggregate.minutes < minimum) throw new Error(`${aggregate.name}: ${round(aggregate.minutes, 1)} minutes is below ${minimum}`);
    const roleMinutes = new Map(); for (const [position, minutes] of aggregate.positionMinutes) { const role = POSITION_TO_ROLE.get(position); roleMinutes.set(role, (roleMinutes.get(role) ?? 0) + minutes); }
    const sortedRoles = [...roleMinutes].sort((a, b) => b[1] - a[1]); const role = sortedRoles[0]?.[0];
    if (!role) throw new Error(`${aggregate.name}: source contains no timed position role`);
    const extraMinimum = edition.kind === "club" ? 90 : 45; const extras = sortedRoles.slice(1).filter(([, minutes]) => minutes >= aggregate.minutes * .2 && minutes >= extraMinimum).map(([extraRole]) => extraRole);
    const shotsOnTarget = aggregate.saves + aggregate.goalsConceded;
    const stats = { minutes: round(aggregate.minutes, 1), nonPenaltyGoalsPer90: round(rate(aggregate.nonPenaltyGoals, aggregate.minutes)), xgPer90: round(rate(aggregate.xg, aggregate.minutes)), assistsPer90: round(rate(aggregate.assists, aggregate.minutes)), xaPer90: round(rate(aggregate.xa, aggregate.minutes)), completedDribblesPer90: round(rate(aggregate.completedDribbles, aggregate.minutes)), progressiveActionsPer90: round(rate(aggregate.progressiveActions, aggregate.minutes)), passCompletionPct: round(aggregate.passes ? aggregate.completedPasses / aggregate.passes * 100 : 0, 1), recoveriesPer90: round(rate(aggregate.recoveries, aggregate.minutes)), tacklesWonPer90: round(rate(aggregate.tacklesWon, aggregate.minutes)), interceptionsPer90: round(rate(aggregate.interceptions, aggregate.minutes)), duelWinPct: round(aggregate.duels ? aggregate.duelsWon / aggregate.duels * 100 : 0, 1), pressureRegainsPer90: round(rate(aggregate.pressureRegains, aggregate.minutes)), savePct: round(shotsOnTarget ? aggregate.saves / shotsOnTarget * 100 : 0, 1), xgPreventedPer90: round(rate(aggregate.xgFaced - aggregate.goalsConceded, aggregate.minutes)), claimsPer90: round(rate(aggregate.claims, aggregate.minutes)), sweeperActionsPer90: round(rate(aggregate.sweeperActions, aggregate.minutes)) };
    if (Object.values(stats).some((value) => !Number.isFinite(value))) throw new Error(`${aggregate.name}: non-finite metric`);
    const id = `${slug(aggregate.name)}-${aggregate.candidate.edition.toLowerCase()}`; if (seen.has(id)) throw new Error(`Duplicate card ID: ${id}`); seen.add(id);
    return { sport: "soccer", id, sourcePlayerId: aggregate.id, name: aggregate.name, role, ...(extras[0] ? { secondaryRole: extras[0] } : {}), ...(extras[1] ? { tertiaryRole: extras[1] } : {}), era: edition.label, team: aggregate.candidate.team, edition: aggregate.candidate.edition, editionKind: edition.kind, stats, performance: null, teamSuccess: teamSuccessByEdition.get(aggregate.candidate.edition).get(aggregate.candidate.team), ...(Object.keys(aggregate.candidate.honors).length ? { honors: aggregate.candidate.honors } : {}), sourcePositionLabels: [...aggregate.positionMinutes.keys()].sort(), sourceRevision: REVISION, sourceMatchIds: [...aggregate.matchIds].sort((a, b) => a - b) };
  });
  for (const player of players) player.performance = performanceFor(player, players);
  const manifestPlayers = players.map(({ id, sourcePlayerId, name, edition, team, sourcePositionLabels, sourceMatchIds }) => ({ id, sourcePlayerId, name, edition, team, sourcePositionLabels, sourceMatchIds }));
  const outputPlayers = players.map(({ sourceMatchIds: _sourceMatchIds, ...player }) => player);
  return `import type { SoccerPlayerCard } from "./types";\n\n// Generated by scripts/generate-soccer-data.mjs. Do not edit by hand.\nexport const SOCCER_SOURCE_REVISION = ${JSON.stringify(REVISION)};\n\nexport const SOCCER_DATA_MANIFEST = ${JSON.stringify({ source: "StatsBomb Open Data", revision: REVISION, editions: editionManifest, players: manifestPlayers }, null, 2)} as const;\n\nexport const SOCCER_PLAYER_DATABASE: SoccerPlayerCard[] = ${JSON.stringify(outputPlayers, null, 2)};\n`;
}

async function verifyCommitted() {
  const source = await readFile(OUTPUT, "utf8");
  const manifestMatch = source.match(/SOCCER_DATA_MANIFEST = ([\s\S]*?) as const;/);
  const playersMatch = source.match(/SOCCER_PLAYER_DATABASE: SoccerPlayerCard\[\] = ([\s\S]*);\s*$/);
  if (!manifestMatch || !playersMatch) throw new Error("Generated soccer data file has an invalid shape.");
  const manifest = JSON.parse(manifestMatch[1]);
  const players = JSON.parse(playersMatch[1]);
  if (manifest.revision !== REVISION) throw new Error("Soccer manifest does not use the pinned StatsBomb revision.");
  if (manifest.editions.length !== Object.keys(EDITIONS).length) throw new Error("Soccer manifest is missing an edition.");
  for (const edition of manifest.editions) {
    const expected = EDITIONS[edition.key];
    if (!expected || edition.competitionId !== expected.competitionId || edition.seasonId !== expected.seasonId || edition.expectedMatches !== expected.expectedMatches) {
      throw new Error(`Manifest mismatch for edition ${edition.key}.`);
    }
    if (!Array.isArray(edition.selectedMatchIds) || edition.selectedMatchIds.length === 0) throw new Error(`${edition.key} has no selected source matches.`);
  }
  if (players.length !== 60 || new Set(players.map((player) => player.id)).size !== 60) throw new Error("Soccer database must contain 60 unique cards.");
  if (manifest.players.length !== 60) throw new Error("Soccer provenance manifest must contain 60 players.");
  const manifestIds = new Set(manifest.players.map((player) => player.id));
  for (const player of players) {
    if (!manifestIds.has(player.id) || player.sourceRevision !== REVISION) throw new Error(`${player.id} is missing pinned provenance.`);
    const minimum = player.editionKind === "club" ? 900 : 180;
    if (player.stats.minutes < minimum) throw new Error(`${player.id} is below its minutes floor.`);
    if (![...Object.values(player.stats), ...Object.values(player.performance), player.teamSuccess].every(Number.isFinite)) throw new Error(`${player.id} contains a non-finite value.`);
    if (!player.sourcePositionLabels.every((position) => POSITION_TO_ROLE.has(position))) throw new Error(`${player.id} contains an unsupported source position.`);
  }
  console.log("Soccer data verified offline: pinned source, 8 complete-edition manifests, 60 unique finite cards.");
}

if (VERIFY_ONLY) await verifyCommitted();
else {
  const generated = await build();
  await writeFile(OUTPUT, generated);
  console.log(`Generated 60 soccer cards at ${OUTPUT}`);
}
