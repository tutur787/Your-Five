import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { scoreDomesticLeague, domesticTeamSuccess } from "../../shared/src/domesticFootballScoring";
import type { SoccerHonors, SoccerPlayerCard } from "../../shared/src/types";
import { SOCCER_PLAYER_DATABASE } from "../../shared/src/soccerPlayers";
import { areSoccerTeammates } from "../../shared/src/soccerTeammates.generated";
import { cachedFetch, OUTPUT_ROOT, ROOT, validateSnapshot, type LeagueSnapshot, type NormalizedPlayer } from "./model";
import { LEAGUE_CONFIGS, SOURCE_LOADERS, type SourceKey } from "./sources";

const verify = process.argv.includes("--verify");
const offline = process.argv.includes("--offline");
const onlyArg = process.argv.find((argument) => argument.startsWith("--league="))?.split("=")[1] as SourceKey | undefined;
const sourceKeys = onlyArg ? [onlyArg] : Object.keys(SOURCE_LOADERS) as SourceKey[];

interface OfficialAward {
  player: string;
  honors: SoccerHonors;
  sourceUrl: string;
}

const OFFICIAL_AWARDS: Record<SourceKey, readonly OfficialAward[]> = {
  premierLeague: [
    { player: "Bruno Fernandes", honors: { bestPlayer: true, bestPlayerLabel: "Premier League Player of the Season" }, sourceUrl: "https://www.premierleague.com/en/news/4668605/everything-thats-been-decided-in-202526-premier-league" },
    { player: "Nico O'Reilly", honors: { youngPlayer: true, youngPlayerLabel: "Premier League Young Player of the Season" }, sourceUrl: "https://www.premierleague.com/en/news/4668605/everything-thats-been-decided-in-202526-premier-league" },
    { player: "Erling Haaland", honors: { topScorer: true, topScorerLabel: "Premier League Golden Boot (27 goals)" }, sourceUrl: "https://www.premierleague.com/en/news/4668605/everything-thats-been-decided-in-202526-premier-league" },
    { player: "David Raya", honors: { positionalAward: true, positionalAwardLabel: "Premier League Golden Glove (19 clean sheets)" }, sourceUrl: "https://www.premierleague.com/en/news/4668605/everything-thats-been-decided-in-202526-premier-league" },
  ],
  laliga: [
    { player: "Lamine Yamal", honors: { bestPlayer: true, bestPlayerLabel: "LaLiga Player of the Season" }, sourceUrl: "https://www.laliga.com/es-US/noticias/laliga-anuncia-los-ganadores-de-los-premios-de-laliga-ea-sports-2025-26" },
    { player: "Carlos Espí", honors: { youngPlayer: true, youngPlayerLabel: "LaLiga Under-23 Player of the Season" }, sourceUrl: "https://www.laliga.com/es-US/noticias/laliga-anuncia-los-ganadores-de-los-premios-de-laliga-ea-sports-2025-26" },
  ],
  serieA: [
    { player: "Federico Dimarco", honors: { bestPlayer: true, bestPlayerLabel: "Serie A Best Overall MVP" }, sourceUrl: "https://en.legaseriea.it/serie-a/news/federico-dimarco-mvp-best-overall-for-serie-a-2025-2026" },
    { player: "Kenan Yildiz", honors: { youngPlayer: true, youngPlayerLabel: "Serie A Rising Star" }, sourceUrl: "https://en.legaseriea.it/serie-a/news/the-mvps-of-serie-a-2025-2026" },
    { player: "Mile Svilar", honors: { positionalAward: true, positionalAwardLabel: "Serie A Best Goalkeeper" }, sourceUrl: "https://en.legaseriea.it/serie-a/news/the-mvps-of-serie-a-2025-2026" },
    { player: "Marco Palestra", honors: { positionalAward: true, positionalAwardLabel: "Serie A Best Defender" }, sourceUrl: "https://en.legaseriea.it/serie-a/news/the-mvps-of-serie-a-2025-2026" },
    { player: "Nico Paz", honors: { positionalAward: true, positionalAwardLabel: "Serie A Best Midfielder" }, sourceUrl: "https://en.legaseriea.it/serie-a/news/the-mvps-of-serie-a-2025-2026" },
    { player: "Lautaro Martinez", honors: { positionalAward: true, positionalAwardLabel: "Serie A Best Striker" }, sourceUrl: "https://en.legaseriea.it/serie-a/news/the-mvps-of-serie-a-2025-2026" },
  ],
  bundesliga: [
    { player: "Michael Olise", honors: { bestPlayer: true, bestPlayerLabel: "Bundesliga Player of the Season" }, sourceUrl: "https://www.bundesliga.com/en/bundesliga/videos/watch/olise-named-2025-26-player-of-the-season-H8gtCEuu" },
  ],
  ligue1: [
    { player: "Ousmane Dembélé", honors: { bestPlayer: true, bestPlayerLabel: "Ligue 1 Player of the Year" }, sourceUrl: "https://ligue1.com/en/articles/l1_article_5085-trophees-unfp-who-were-ligue-1-mcdonald-s-big-winners" },
    { player: "Désiré Doué", honors: { youngPlayer: true, youngPlayerLabel: "Ligue 1 Young Player of the Year" }, sourceUrl: "https://ligue1.com/en/articles/l1_article_5085-trophees-unfp-who-were-ligue-1-mcdonald-s-big-winners" },
    { player: "Robin Risser", honors: { positionalAward: true, positionalAwardLabel: "Ligue 1 Goalkeeper of the Year" }, sourceUrl: "https://ligue1.com/en/articles/l1_article_5085-trophees-unfp-who-were-ligue-1-mcdonald-s-big-winners" },
    { player: "Estéban Lepaul", honors: { topScorer: true, topScorerLabel: "Ligue 1 top scorer (21 goals)" }, sourceUrl: "https://ligue1.com/fr/articles/l1_article_5124-esteban-lepaul-le-top-scoreur-a-double-titre" },
  ],
};

function round(value: number | undefined, places = 3): number | undefined {
  if (value === undefined) return undefined;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function sourceRevision(snapshot: LeagueSnapshot): string {
  return createHash("sha256")
    .update(snapshot.sources.map((source) => `${source.url}:${source.contentHash}`).sort().join("\n"))
    .digest("hex");
}

function normalizedName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const UEFA_IDENTITIES_BY_NAME = new Map<string, string[]>();
for (const player of SOCCER_PLAYER_DATABASE) {
  const key = normalizedName(player.name);
  UEFA_IDENTITIES_BY_NAME.set(key, [...new Set([...(UEFA_IDENTITIES_BY_NAME.get(key) ?? []), player.sourceIdentity])]);
}

function verifiedIdentity(player: NormalizedPlayer): string {
  const matches = UEFA_IDENTITIES_BY_NAME.get(normalizedName(player.name));
  return matches?.length === 1 ? matches[0] : player.identity;
}

function domesticCardId(snapshot: LeagueSnapshot, player: NormalizedPlayer): string {
  return `${snapshot.config.competition}:${player.clubCode}:${player.identity}`;
}

function cardStats(player: NormalizedPlayer, pointsPerMatch: number, goalDifferencePerMatch: number): SoccerPlayerCard["stats"] {
  const totals = player.totals;
  const goals = totals.goals ?? totals.totalGoals ?? totals.shotsAtGoalSuccessful ?? 0;
  const assists = totals.assists ?? totals.totalAssists ?? 0;
  const shotsOnTarget = totals.shotsOnTarget ?? totals.totalShotsOnTarget ?? 0;
  const cleanSheets = totals.cleanSheets ?? 0;
  const goalsConceded = totals.goalsConceded ?? 0;
  return {
    minutes: player.minutes > 0 ? round(player.minutes, 0) : undefined,
    appearances: round(player.appearances, 0) ?? 0,
    starts: player.starts,
    goals: round(goals, 0) ?? 0,
    assists: round(assists, 0) ?? 0,
    shotsOnTarget: round(shotsOnTarget, 0) ?? 0,
    cleanSheets: round(cleanSheets, 0) ?? 0,
    goalsConceded: round(goalsConceded, 0) ?? 0,
    goalsPer90: round(player.metrics.goalsPer90) ?? 0,
    assistsPer90: round(player.metrics.assistsPer90) ?? 0,
    shotsOnTargetPer90: round(player.metrics.shotsOnTargetPer90) ?? 0,
    shotAccuracyPct: round(player.metrics.shotAccuracyPct) ?? 0,
    cleanSheetPct: round(player.metrics.cleanSheetPct) ?? 0,
    goalsConcededPerMatch: round(player.metrics.goalsConcededPerMatch) ?? 0,
    savePct: round(player.metrics.savePct),
    saves: round(totals.saves, 0),
    pointsPerMatch: round(pointsPerMatch) ?? 0,
    goalDifferencePerMatch: round(goalDifferencePerMatch) ?? 0,
    tacklesWonPer90: round(player.metrics.tacklesWonPer90),
    tacklesWon: round(totals.tacklesWon, 0),
    duelsWon: round(totals.duelsWon, 0),
    recoveriesPer90: round(player.metrics.recoveriesPer90),
    recoveries: round(totals.recoveries, 0),
    clearancesPer90: round(player.metrics.clearancesPer90),
    clearances: round(totals.clearances, 0),
    passCompletionPct: round(player.metrics.passCompletionPct),
    progressiveDeliveriesPer90: round(player.metrics.progressiveActionsPer90 ?? player.metrics.forwardPassesPer90),
    progressiveDeliveries: round(totals.progressiveActions ?? totals.forwardPasses, 0),
    claimsPer90: round(player.metrics.claimsPer90),
    claims: round(totals.claims, 0),
    passes: round(totals.passes, 0),
    keyPasses: round(totals.keyPasses, 0),
    interceptions: round(totals.interceptions, 0),
    aerialDuelsWon: round(totals.aerialDuelsWon, 0),
    ballActions: round(totals.ballActions, 0),
  };
}

function cardsFor(snapshot: LeagueSnapshot, sourceKey: SourceKey): SoccerPlayerCard[] {
  const scoring = scoreDomesticLeague(snapshot.players.map((player) => ({ id: player.id, role: player.role, starts: player.starts, metrics: player.metrics })), snapshot.config.metrics);
  const pointsPerMatch = snapshot.clubs.map((club) => club.matches ? club.points / club.matches : 0);
  const championPoints = Math.max(...snapshot.clubs.map((club) => club.points));
  const revision = sourceRevision(snapshot);
  const identities = new Map(snapshot.players.map((player) => [player.id, verifiedIdentity(player)]));

  return snapshot.players.map((player) => {
    const result = scoring.get(player.id);
    if (!result) throw new Error(`${snapshot.config.label}: missing score for ${player.name}`);
    const club = snapshot.clubs.find((candidate) => candidate.id === player.clubId)!;
    const ppm = club.matches ? club.points / club.matches : 0;
    const id = domesticCardId(snapshot, player);
    const sourcePlayerId = identities.get(player.id)!;
    const award = OFFICIAL_AWARDS[sourceKey].find((candidate) => normalizedName(candidate.player) === normalizedName(player.name));
    const championHonor = club.points === championPoints
      ? { champion: true, championLabel: `${snapshot.config.label} champion` }
      : undefined;
    const honors = championHonor || award ? { ...championHonor, ...award?.honors } : undefined;
    return {
      sport: "soccer",
      competition: snapshot.config.competition,
      id,
      sourcePlayerId,
      sourcePlayerIds: [sourcePlayerId],
      sourceIdentity: sourcePlayerId,
      name: player.name,
      role: player.role,
      era: "2025-26",
      team: player.clubName,
      teamCode: player.clubCode,
      sourceTeamIds: [`${snapshot.config.competition}:${player.clubCode}`],
      edition: snapshot.config.label,
      editionKind: "season",
      stats: cardStats(player, ppm, club.matches ? (club.goalsFor - club.goalsAgainst) / club.matches : 0),
      performance: {
        attack: round(result.performance.attack, 2)!,
        creation: round(result.performance.creation, 2)!,
        control: round(result.performance.control, 2)!,
        defense: round(result.performance.defense, 2)!,
        goalkeeping: round(result.performance.goalkeeping, 2)!,
        observedScore: round(result.quality, 2),
        dataConfidence: round(result.reliability, 3),
        roleScore: round(result.quality, 2)!,
        domesticQuality: round(result.quality, 2),
      },
      teamSuccess: round(domesticTeamSuccess(ppm, pointsPerMatch), 2)!,
      honors,
      sourcePositionLabels: [player.officialPosition],
      sourceRevision: revision,
      chemistryWith: snapshot.players
        .filter((candidate) => candidate.id !== player.id && (
          candidate.clubId === player.clubId
          || areSoccerTeammates(identities.get(player.id)!, identities.get(candidate.id)!)
        ))
        .map((candidate) => domesticCardId(snapshot, candidate)),
    } satisfies SoccerPlayerCard;
  });
}

function generatedModule(snapshot: LeagueSnapshot, cards: SoccerPlayerCard[]): string {
  return `// Generated by scripts/football-data/generate.ts. Do not edit manually.\nimport type { SoccerPlayerCard } from "../types";\n\nexport const ${snapshot.config.exportName}: readonly SoccerPlayerCard[] = ${JSON.stringify(cards, null, 2)};\n`;
}

function runtimeModule(snapshot: LeagueSnapshot, fileBase: string): string {
  return `import { buildSoccerPoolFrom } from "../gameEngine";\nimport type { SportRuntime } from "../runtimeTypes";\nimport { ${snapshot.config.exportName} } from "./${fileBase}.generated";\n\nexport const ${snapshot.config.runtimeName}: SportRuntime = {\n  sport: "soccer",\n  competition: "${snapshot.config.competition}",\n  poolVersion: "${snapshot.config.poolVersion}",\n  database: ${snapshot.config.exportName},\n  buildPool: (rng) => buildSoccerPoolFrom(${snapshot.config.exportName}, rng),\n};\n`;
}

const FILES: Record<SourceKey, { data: string; runtime: string }> = {
  premierLeague: { data: "premierLeague", runtime: "premierLeagueRuntime" },
  laliga: { data: "laliga", runtime: "laligaRuntime" },
  serieA: { data: "serieA", runtime: "serieARuntime" },
  bundesliga: { data: "bundesliga", runtime: "bundesligaRuntime" },
  ligue1: { data: "ligue1", runtime: "ligue1Runtime" },
};

async function emit(path: string, content: string): Promise<void> {
  if (verify) {
    const existing = await readFile(path, "utf8");
    if (existing !== content) throw new Error(`Generated file is stale: ${path.slice(ROOT.length + 1)}`);
  } else {
    await mkdir(OUTPUT_ROOT, { recursive: true });
    await writeFile(path, content);
  }
}

async function main(): Promise<void> {
  for (const key of sourceKeys) {
    if (!SOURCE_LOADERS[key]) throw new Error(`Unknown league adapter: ${key}`);
    console.log(`${verify ? "Verifying" : "Generating"} ${LEAGUE_CONFIGS[key].label}...`);
    const snapshot = await SOURCE_LOADERS[key](offline);
    const awardSources = [...new Set(OFFICIAL_AWARDS[key].map((award) => award.sourceUrl))];
    for (const [index, url] of awardSources.entries()) {
      const awardSource = await cachedFetch(key, `official-awards-2025-26-${index}`, url, {}, offline);
      snapshot.sources.push(awardSource.source);
    }
    for (const award of OFFICIAL_AWARDS[key]) {
      const selected = snapshot.players.filter((player) => normalizedName(player.name) === normalizedName(award.player));
      if (selected.length > 1) throw new Error(`${snapshot.config.label}: award winner ${award.player} matched multiple selected cards`);
      if (selected.length === 1) selected[0].sources.push(award.sourceUrl);
    }
    validateSnapshot(snapshot);
    const cards = cardsFor(snapshot, key);
    if (cards.length !== snapshot.config.clubs * 11 || cards.some((card) => !Number.isFinite(card.performance.roleScore))) {
      throw new Error(`${snapshot.config.label}: generated card validation failed`);
    }
    const files = FILES[key];
    const provenance = {
      competition: snapshot.config.competition,
      label: snapshot.config.label,
      poolVersion: snapshot.config.poolVersion,
      generatedAt: new Date().toISOString(),
      sourceRevision: sourceRevision(snapshot),
      expectedMatches: snapshot.config.matches,
      matchIds: snapshot.matchIds,
      clubs: snapshot.clubs.map((club) => ({ ...club, selectedPlayers: snapshot.players.filter((player) => player.clubId === club.id).map((player) => ({ id: player.id, identity: player.identity, name: player.name, role: player.role, officialPosition: player.officialPosition, starts: player.starts, minutes: player.minutes, appearances: player.appearances, sourceUrls: player.sources })) })),
      sources: snapshot.sources,
    };
    await emit(resolve(OUTPUT_ROOT, `${files.data}.generated.ts`), generatedModule(snapshot, cards));
    await emit(resolve(OUTPUT_ROOT, `${files.runtime}.ts`), runtimeModule(snapshot, files.data));
    if (!verify) await writeFile(resolve(OUTPUT_ROOT, `${files.data}.provenance.json`), `${JSON.stringify(provenance, null, 2)}\n`);
    console.log(`  ${cards.length} cards across ${snapshot.clubs.length} clubs; ${snapshot.matchIds.length} matches verified.`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
