import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FOOTBALL_COMPETITIONS,
  resolveFootballCompetition,
  seededRng,
} from "./core";
import { scoreDomesticLeague } from "./domesticFootballScoring";
import { PREMIER_LEAGUE_RUNTIME } from "./domesticFootball/premierLeagueRuntime";
import { LALIGA_RUNTIME } from "./domesticFootball/laligaRuntime";
import { SERIE_A_RUNTIME } from "./domesticFootball/serieARuntime";
import { BUNDESLIGA_RUNTIME } from "./domesticFootball/bundesligaRuntime";
import { LIGUE_1_RUNTIME } from "./domesticFootball/ligue1Runtime";
import { soccerPlayerQuality, soccerScoreComponents } from "./soccerScoring";
import type { SoccerPlayerCard, SoccerRole, SoccerSlot, TeamState } from "./types";

const runtimes = [
  PREMIER_LEAGUE_RUNTIME,
  LALIGA_RUNTIME,
  SERIE_A_RUNTIME,
  BUNDESLIGA_RUNTIME,
  LIGUE_1_RUNTIME,
] as const;

const expected = new Map([
  ["premier-league-2025-26", { clubs: 20, cards: 220, matches: 380, file: "premierLeague" }],
  ["laliga-2025-26", { clubs: 20, cards: 220, matches: 380, file: "laliga" }],
  ["serie-a-2025-26", { clubs: 20, cards: 220, matches: 380, file: "serieA" }],
  ["bundesliga-2025-26", { clubs: 18, cards: 198, matches: 306, file: "bundesliga" }],
  ["ligue-1-2025-26", { clubs: 18, cards: 198, matches: 306, file: "ligue1" }],
] as const);

const roles: SoccerRole[] = ["GK", "DEF", "MID", "ATT"];
const slots: SoccerSlot[] = ["GK", "DEF", "MID", "ATT_L", "ATT_R"];
const requiredCategorySpread = {
  GK: ["goalkeeping"],
  DEF: ["control", "defense"],
  MID: ["attack", "creation", "control", "defense"],
  ATT: ["attack", "creation", "control"],
} as const;
const allCards = runtimes.flatMap((runtime) => runtime.database as readonly SoccerPlayerCard[]);

assert.equal(allCards.length, 1_056, "domestic databases contain exactly 1,056 cards");
assert.equal(new Set(allCards.flatMap((card) => card.sourceTeamIds)).size, 96, "domestic databases contain exactly 96 clubs");
assert.equal(new Set(allCards.map((card) => card.id)).size, allCards.length, "every domestic card ID is unique");

for (const runtime of runtimes) {
  const config = expected.get(runtime.competition!);
  assert.ok(config, `known runtime ${runtime.competition}`);
  const cards = runtime.database as readonly SoccerPlayerCard[];
  assert.equal(cards.length, config.cards, `${runtime.competition} has the expected card count`);
  assert.ok(cards.every((card) => card.competition === runtime.competition), `${runtime.competition} cards retain their competition`);
  assert.ok(cards.every((card) => roles.includes(card.role)), `${runtime.competition} uses only official supported roles`);
  assert.ok(cards.every((card) => (card.stats.starts ?? 0) > 0), `${runtime.competition} cards have at least one verified start`);
  assert.ok(cards.every((card) => Object.values(card.stats).every((value) => value === undefined || Number.isFinite(value))), `${runtime.competition} stats are finite`);
  assert.ok(cards.every((card) => card.stats.shotsOnTarget >= card.stats.goals), `${runtime.competition} never reports fewer shots on target than goals`);
  assert.ok(cards.filter((card) => card.role === "GK").every((card) => (
    card.stats.savePct !== undefined
    && card.stats.cleanSheets !== undefined
    && card.stats.goalsConceded !== undefined
  )), `${runtime.competition} goalkeepers have saves, clean sheets, and goals conceded`);
  assert.ok(cards.every((card) => card.stats.cleanSheets <= card.stats.appearances), `${runtime.competition} clean sheets do not exceed appearances`);
  assert.ok(cards.every((card) => soccerPlayerQuality(card) >= 6 && soccerPlayerQuality(card) <= 18), `${runtime.competition} quality stays on the 6-18 scale`);
  assert.ok(cards.every((card) => card.teamSuccess >= -2 && card.teamSuccess <= 2), `${runtime.competition} team success stays within its cap`);

  const byClub = Map.groupBy(cards, (card) => card.sourceTeamIds[0]);
  assert.equal(byClub.size, config.clubs, `${runtime.competition} has the expected club count`);
  assert.ok([...byClub.values()].every((clubCards) => clubCards.length === 11), `${runtime.competition} selects exactly 11 cards per club`);

  for (let sample = 0; sample < 40; sample += 1) {
    const pool = runtime.buildPool(seededRng(`${runtime.competition}:pool:${sample}`)) as SoccerPlayerCard[];
    const counts = Map.groupBy(pool, (card) => card.role);
    assert.deepEqual(
      Object.fromEntries(roles.map((role) => [role, counts.get(role)?.length ?? 0])),
      { GK: 3, DEF: 4, MID: 4, ATT: 7 },
      `${runtime.competition} pool ${sample} has the fixed role composition`
    );
    assert.equal(new Set(pool.map((card) => card.sourceIdentity)).size, 18, `${runtime.competition} pool ${sample} has no duplicate player`);
  }

  for (const role of roles) {
    const qualities = cards.filter((card) => card.role === role).map(soccerPlayerQuality);
    assert.ok(qualities.length >= (role === "GK" ? 3 : 4), `${runtime.competition} has enough ${role} cards`);
    assert.ok(Math.max(...qualities) - Math.min(...qualities) >= 2, `${runtime.competition} meaningfully separates ${role} quality`);

    const roleCards = cards.filter((card) => card.role === role);
    for (const category of requiredCategorySpread[role]) {
      const values = roleCards.map((card) => card.performance[category]);
      assert.ok(
        Math.max(...values) - Math.min(...values) >= 2,
        `${runtime.competition} ${role} ${category} is sourced and meaningfully separated`
      );
    }
  }

  const provenance = JSON.parse(readFileSync(`shared/src/domesticFootball/${config.file}.provenance.json`, "utf8"));
  assert.equal(provenance.matchIds.length, config.matches, `${runtime.competition} provenance verifies every fixture`);
  assert.equal(new Set(provenance.matchIds).size, config.matches, `${runtime.competition} fixture IDs are unique`);
  assert.equal(provenance.clubs.length, config.clubs, `${runtime.competition} provenance lists every club`);
  assert.ok(provenance.clubs.every((club: any) => club.selectedPlayers.length === 11), `${runtime.competition} provenance records every top-11 selection`);
  assert.ok(provenance.clubs.flatMap((club: any) => club.selectedPlayers).every((player: any) => player.starts > 0 && player.sourceUrls.length > 0), `${runtime.competition} selected cards retain starts and sources`);
  assert.ok(provenance.sources.every((source: any) => /^https:\/\//.test(source.url) && /^[a-f0-9]{64}$/.test(source.contentHash) && source.retrievedAt), `${runtime.competition} source records include URL, timestamp, and SHA-256 hash`);
}

const ligueOneCards = LIGUE_1_RUNTIME.database as readonly SoccerPlayerCard[];
for (const role of roles) {
  assert.ok(
    ligueOneCards.some((card) => card.role === role && card.stats.cleanSheets > 0),
    `Ligue 1 derives nonzero clean sheets from match results for ${role} starters`
  );
}

const premierLeagueCards = PREMIER_LEAGUE_RUNTIME.database as readonly SoccerPlayerCard[];
const laligaCards = LALIGA_RUNTIME.database as readonly SoccerPlayerCard[];
const serieACards = SERIE_A_RUNTIME.database as readonly SoccerPlayerCard[];
const bundesligaCards = BUNDESLIGA_RUNTIME.database as readonly SoccerPlayerCard[];
const minutePublishingLeagues = [premierLeagueCards, laligaCards, serieACards, ligueOneCards];
assert.ok(
  minutePublishingLeagues.every((cards) => cards.every((card) => (card.stats.minutes ?? 0) > 0)),
  "leagues publishing official minutes never emit a missing or zero minute total"
);
assert.ok(
  bundesligaCards.every((card) => card.stats.minutes === undefined),
  "Bundesliga omits unavailable minutes instead of displaying a fabricated zero"
);

for (const cards of minutePublishingLeagues) {
  assert.ok(
    cards.filter((card) => card.role === "MID").every((card) => (
      (card.stats.passes ?? 0) > 0
      && (card.stats.progressiveDeliveries ?? 0) > 0
      && card.stats.passCompletionPct !== undefined
      && card.stats.keyPasses !== undefined
    )),
    "midfield cards expose sourced passing, progression, completion, and creation totals"
  );
}
assert.ok(
  bundesligaCards.filter((card) => card.role === "MID").every((card) => (
    card.stats.passes === undefined
    && (card.stats.ballActions ?? 0) > 0
    && (card.stats.aerialDuelsWon ?? 0) >= 0
  )),
  "Bundesliga midfielders use official ball actions and do not relabel them as passes"
);
assert.ok(
  bundesligaCards.some((card) => card.role === "MID" && card.stats.passCompletionPct !== undefined),
  "Bundesliga retains official pass-completion data where the source publishes it"
);

for (const cards of [premierLeagueCards, laligaCards, serieACards, ligueOneCards]) {
  const goalkeepers = cards.filter((card) => card.role === "GK");
  assert.ok(goalkeepers.every((card) => card.stats.goalsConceded > 0), "goalkeepers retain sourced goals conceded");
  assert.ok(goalkeepers.every((card) => card.stats.claims !== undefined), "goalkeepers retain sourced claims or catches");
  assert.ok(goalkeepers.some((card) => (card.stats.claims ?? 0) > 0), "goalkeeper claim totals are not uniformly zero");
}

const serieADefenders = serieACards.filter((card) => card.role === "DEF");
assert.ok(
  serieADefenders.every((card) => card.stats.cleanSheets > 0 && card.stats.goalsConceded > 0),
  "Serie A defenders derive clean sheets and goals conceded from their verified starts"
);
for (const runtime of runtimes) {
  const defenders = (runtime.database as readonly SoccerPlayerCard[]).filter((card) => card.role === "DEF");
  if (runtime.competition === "bundesliga-2025-26") {
    assert.ok(defenders.every((card) => (
      card.stats.tacklesWon === undefined
      && card.stats.clearances === undefined
      && card.stats.duelsWon !== undefined
      && card.stats.aerialDuelsWon !== undefined
    )), "Bundesliga keeps official duels distinct from unavailable tackle and clearance totals");
  } else {
    assert.ok(defenders.every((card) => card.stats.tacklesWon !== undefined), `${runtime.competition} defenders retain tackle totals`);
    assert.ok(defenders.every((card) => card.stats.clearances !== undefined), `${runtime.competition} defenders retain clearance totals`);
  }
}

const randomBoundaryResults = FOOTBALL_COMPETITIONS.map((_, index) =>
  resolveFootballCompetition("random", () => (index + 0.5) / FOOTBALL_COMPETITIONS.length)
);
assert.deepEqual(randomBoundaryResults, FOOTBALL_COMPETITIONS, "Random maps equal-width probability bands to all six competitions");

assert.throws(() => scoreDomesticLeague([
  { id: "incomplete", role: "ATT", starts: 20, metrics: { goals: 10 } },
  { id: "complete", role: "ATT", starts: 20, metrics: { goals: 5, assists: 4 } },
], [
  { key: "goals", category: "attack", direction: "higher", roles: ["ATT"], weight: 1 },
  { key: "assists", category: "creation", direction: "higher", roles: ["ATT"], weight: 1 },
]), /incomplete: missing scoring metrics assists/, "scoring rejects a card with an incomplete role metric set");

function lineup(cards: readonly SoccerPlayerCard[], strongest: boolean): TeamState {
  const sorted = (role: SoccerRole) => cards
    .filter((card) => card.role === role)
    .sort((left, right) => soccerPlayerQuality(left) - soccerPlayerQuality(right));
  const select = (role: SoccerRole, offset = 0) => {
    const candidates = sorted(role);
    return strongest ? candidates[candidates.length - 1 - offset] : candidates[offset];
  };
  const selected = [select("GK"), select("DEF"), select("MID"), select("ATT"), select("ATT", 1)];
  return {
    seat: "A",
    budget: 15,
    skipsUsed: 0,
    catchUpSkipUsed: false,
    roster: selected.map((player, index) => ({
      player: { ...player, teamSuccess: 0, honors: undefined, chemistryWith: [] },
      price: 1,
      slot: slots[index],
    })),
  };
}

for (const runtime of runtimes) {
  const cards = runtime.database as readonly SoccerPlayerCard[];
  const stronger = soccerScoreComponents(lineup(cards, true)).total;
  const weaker = soccerScoreComponents(lineup(cards, false)).total;
  assert.ok(stronger > weaker + 10, `${runtime.competition} clearly stronger role-matched cards win decisively`);
}

const awardChecks = [
  ["Bruno Fernandes", "bestPlayer"],
  ["Lamine Yamal", "bestPlayer"],
  ["Federico Dimarco", "bestPlayer"],
  ["Michael Olise", "bestPlayer"],
  ["Robin Risser", "positionalAward"],
] as const;
for (const [name, field] of awardChecks) {
  const card = allCards.find((candidate) => candidate.name === name);
  assert.ok(card?.honors?.[field], `${name}'s verified 2025-26 official award is attached`);
}

console.log("Domestic football data and scoring tests passed.");
