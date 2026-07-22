import fs from "node:fs";
import path from "node:path";
import {
  basketballCompetitionForPoolVersion,
  buildBasketballPoolFrom,
  fitAssessment,
  normalizeBasketballCompetitionChoice,
  playerCompositeValue,
  resolveBasketballCompetition,
  scoreComponents,
  seededRng,
  teamScore,
  validSlotsFor,
} from "../core";
import type { BasketballPlayerCard, Position, TeamState } from "../types";
import { BASKETBALL_2025_DATABASE } from "./basketball2025Data";
import { BASKETBALL_2025_RUNTIME } from "./basketball2025Runtime";

let failures = 0;
function assert(condition: unknown, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

assert(BASKETBALL_2025_DATABASE.length === 180, "season database has exactly 180 cards");
assert(normalizeBasketballCompetitionChoice(null) === "nba-all-time", "legacy basketball selection defaults to NBA All-Time");
assert(basketballCompetitionForPoolVersion("nba-v1") === "nba-all-time", "legacy challenge versions reconstruct NBA All-Time");
assert(basketballCompetitionForPoolVersion("nba-2025-26-v1") === "nba-2025-26", "season challenge versions reconstruct NBA 2025/26");
assert(resolveBasketballCompetition("random", () => 0.1) === "nba-all-time" && resolveBasketballCompetition("random", () => 0.9) === "nba-2025-26", "Random gives both basketball pools equal halves");
const teamCounts = new Map<string, number>();
for (const player of BASKETBALL_2025_DATABASE) {
  teamCounts.set(player.teamCode ?? "", (teamCounts.get(player.teamCode ?? "") ?? 0) + 1);
}
assert(BASKETBALL_2025_DATABASE.every((player) => player.competition === "nba-2025-26"), "every card identifies the season competition");
assert(BASKETBALL_2025_DATABASE.every((player) => Boolean(player.sourceIdentity)), "every card has a stable NBA identity");
assert(BASKETBALL_2025_DATABASE.every((player) => /^[A-Z]{3}$/.test(player.teamCode ?? "")), "every card has a valid team abbreviation");
assert(BASKETBALL_2025_DATABASE.every((player) => validSlotsFor(player).length >= 1), "every sourced position maps to a lineup slot");
assert(BASKETBALL_2025_DATABASE.every((player) => [
  player.stats.ppg, player.stats.rpg, player.stats.apg, player.stats.spg, player.stats.bpg,
  player.stats.plusMinus, player.stats.defRtgVsAvg, player.teamWinPct,
].every((value) => Number.isFinite(value))), "every card has finite scoring inputs");
assert(BASKETBALL_2025_DATABASE.every((player) => player.eraFactor === undefined), "season cards do not carry an era adjustment");
assert(teamCounts.size === 30, "season database covers all 30 teams");
assert([...teamCounts.values()].every((count) => count === 6), "every team contributes exactly six cards");
assert(new Set(BASKETBALL_2025_DATABASE.map((player) => player.id)).size === 180, "card IDs are unique");
assert(BASKETBALL_2025_DATABASE.every((player) =>
  BASKETBALL_2025_DATABASE
    .filter((candidate) => candidate.id !== player.id && candidate.teamCode === player.teamCode)
    .every((candidate) => player.chemistryWith?.includes(candidate.id))
), "every same-team 2025/26 chemistry link is present");
assert(BASKETBALL_2025_DATABASE.every((player) =>
  (player.chemistryWith ?? []).every((candidateId) =>
    BASKETBALL_2025_DATABASE.find((candidate) => candidate.id === candidateId)?.chemistryWith?.includes(player.id)
  )
), "every generated chemistry link is symmetric");

let identitiesRemainUnique = true;
let everyPoolHasCoverage = true;
for (let index = 0; index < 250; index += 1) {
  const pool = buildBasketballPoolFrom(BASKETBALL_2025_DATABASE, seededRng(`nba-2025-pool:${index}`));
  const identities = pool.map((player) => player.sourceIdentity);
  identitiesRemainUnique &&= new Set(identities).size === identities.length;
  for (const position of ["PG", "SG", "SF", "PF", "C"] as Position[]) {
    everyPoolHasCoverage &&= pool.filter((player) => validSlotsFor(player).includes(position)).length >= 2;
  }
}
assert(identitiesRemainUnique, "250 seeded pools never contain duplicate traded-player identities");
assert(everyPoolHasCoverage, "250 seeded pools preserve playable coverage at every position");

function roleLineup(descending: boolean): TeamState {
  const used = new Set<string>();
  const roster = (["PG", "SG", "SF", "PF", "C"] as Position[]).map((slot) => {
    const choices = BASKETBALL_2025_DATABASE
      .filter((player) => validSlotsFor(player).includes(slot) && !used.has(player.sourceIdentity ?? player.id))
      .sort((a, b) => (playerCompositeValue(b) - playerCompositeValue(a)) * (descending ? 1 : -1));
    const player = choices[0] as BasketballPlayerCard;
    used.add(player.sourceIdentity ?? player.id);
    return { player, slot, price: 1 };
  });
  return { seat: "A", budget: 15, roster, skipsUsed: 0, catchUpSkipUsed: false };
}

const stronger = roleLineup(true);
const weaker = roleLineup(false);
assert(teamScore(stronger, "basketball") > teamScore(weaker, "basketball") + 20, "representative stronger lineup clearly beats weaker lineup");

const rawThresholdPlayer: BasketballPlayerCard = {
  ...BASKETBALL_2025_DATABASE[0],
  id: "season-raw-threshold-test",
  eraFactor: 0.1,
  stats: { ...BASKETBALL_2025_DATABASE[0].stats, ppg: 25, rpg: 8, apg: 6, spg: 1, bpg: 1.5 },
};
const rawThresholdTeam: TeamState = {
  seat: "A",
  budget: 19,
  roster: [{ player: rawThresholdPlayer, price: 1, slot: rawThresholdPlayer.position }],
  skipsUsed: 0,
  catchUpSkipUsed: false,
};
const rawComponents = scoreComponents(rawThresholdTeam);
const rawFit = fitAssessment(rawThresholdTeam);
assert(rawComponents.offense === 39 && rawComponents.defenseBox === 2.5, "season offense and defense ignore even a legacy persisted era factor");
assert(rawFit.alphaScorers === 1 && rawFit.hasPlaymaking && rawFit.hasRimProtection, "season lineup-fit thresholds use raw statistics");

const first = BASKETBALL_2025_RUNTIME.buildPool(seededRng("deterministic-season-pool")).map((player) => player.id);
const second = BASKETBALL_2025_RUNTIME.buildPool(seededRng("deterministic-season-pool")).map((player) => player.id);
assert(JSON.stringify(first) === JSON.stringify(second), "season pool generation is deterministic for a seed");

const manifestPath = path.join(process.cwd(), "shared/src/seasonBasketball/basketball2025Provenance.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert(manifest.nbaApiVersion === "1.11.4", "provenance pins nba_api 1.11.4");
assert(manifest.completedGames === 1230 && manifest.cardCount === 180, "provenance records season completeness");
assert(!manifest.endpoints.some((endpoint: { name: string }) => endpoint.name.includes("2015-16")), "season generation no longer fetches an era baseline");
assert(/without era adjustment/.test(manifest.scoringPolicy), "provenance records the raw single-season scoring policy");
assert(manifest.positionSources.length === 180, "every card has a recorded position source");
assert(manifest.chemistrySources.length === 2, "provenance records current and historical chemistry sources");
assert(manifest.cards.every((card: { minutes: number; games: number; starts: number }) =>
  Number.isFinite(card.minutes) && Number.isInteger(card.games) && Number.isInteger(card.starts)
), "provenance retains every ranking input");

if (failures > 0) process.exit(1);
console.log("NBA 2025/26 database tests passed.");
