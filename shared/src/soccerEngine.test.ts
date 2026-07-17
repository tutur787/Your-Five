import {
  applyAction,
  availablePlacementSlots,
  positionPenaltyForSlot,
  validSlotsFor,
} from "./gameEngine";
import { buildPool, createMatch } from "./gameFactory";
import { decideAiAction } from "./aiOpponent";
import { SOCCER_PLAYER_DATABASE, SOCCER_SOURCE_REVISION } from "./soccerPlayers";
import {
  SOCCER_HONORS_CAP,
  soccerFitAssessment,
  soccerHonorDetails,
  soccerHonorPoints,
  soccerPlayerQuality,
  soccerScoreComponents,
} from "./soccerScoring";
import type { AiDecisionContext, MatchState, SoccerPlayerCard, TeamState } from "./types";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) console.log(`ok: ${message}`);
  else { failures++; console.error(`FAIL: ${message}`); }
}

const byRole = (role: SoccerPlayerCard["role"]) => SOCCER_PLAYER_DATABASE.find((player) => player.role === role)!;
const emptyTeam = (): TeamState => ({ seat: "A", budget: 20, roster: [], skipsUsed: 0, catchUpSkipUsed: false });

assert(SOCCER_PLAYER_DATABASE.length === 298, "database contains all 298 official UEFA selection cards");
assert(new Set(SOCCER_PLAYER_DATABASE.map((player) => player.id)).size === 298, "all soccer card IDs are unique");
assert(SOCCER_PLAYER_DATABASE.every((player) => player.sourceRevision === SOCCER_SOURCE_REVISION), "every card uses the pinned source revision");
assert(SOCCER_PLAYER_DATABASE.every((player) => player.stats.minutes > 0 && player.stats.appearances > 0), "every card has verified UEFA playing time");
assert(SOCCER_PLAYER_DATABASE.every((player) => Object.values(player.stats).every(Number.isFinite)), "every sourced metric is finite");
assert(SOCCER_PLAYER_DATABASE.every((player) => player.teamSuccess >= -1 && player.teamSuccess <= 1), "team success is a modest cross-edition adjustment");
assert(SOCCER_PLAYER_DATABASE.every((player) => player.performance.roleScore >= 0 && player.performance.roleScore <= 20), "every card quality is on the 0-20 scale");
assert(SOCCER_PLAYER_DATABASE.every((player) => player.performance.achievementScore === undefined), "verified honors are not hidden inside generated card quality");
assert(SOCCER_PLAYER_DATABASE.every((player) => player.performance.dataConfidence !== undefined && player.performance.dataConfidence >= 0 && player.performance.dataConfidence <= 1), "every card records its edition-data confidence");
assert(SOCCER_PLAYER_DATABASE.filter((player) => player.role !== "GK").every((player) => player.performance.goalkeeping === 0), "outfield cards do not receive goalkeeper performance");
assert(SOCCER_PLAYER_DATABASE.filter((player) => player.role !== "GK").every((player) => player.stats.savePct === undefined), "outfield cards do not carry goalkeeper save rates");
assert(SOCCER_PLAYER_DATABASE.every((player) => Object.values(player.performance).every((value) => value === undefined || Number.isFinite(value))), "all observed, pedigree, confidence, and category values are finite");
assert(SOCCER_PLAYER_DATABASE.filter((player) => player.role === "GK").every((player) => (player.performance.dataConfidence ?? 0) <= 0.56), "goalkeeper edition confidence reflects the smaller, team-dependent event sample");

const casillas2012 = SOCCER_PLAYER_DATABASE.find((player) => player.id === "iker-casillas-toty2012")!;
const mendy2021 = SOCCER_PLAYER_DATABASE.find((player) => player.id === "edouard-mendy-ucl2021")!;
assert(casillas2012.performance.roleScore >= 12, "repeat UEFA pedigree prevents one volatile goalkeeper window from collapsing Casillas's card");
assert(mendy2021.performance.roleScore > casillas2012.performance.roleScore, "Mendy's exceptional 2020/21 goalkeeper edition still outranks Casillas's weaker 2012 UEFA window");
assert(mendy2021.performance.roleScore - casillas2012.performance.roleScore < 4, "goalkeeper sample weighting keeps the edition gap proportionate");

const deBruyne2021 = SOCCER_PLAYER_DATABASE.find((player) => player.id === "kevin-de-bruyne-ucl2021")!;
const maldini2003 = SOCCER_PLAYER_DATABASE.find((player) => player.id === "paolo-maldini-toty2003")!;
assert(deBruyne2021.stats.passCompletionPct !== undefined && deBruyne2021.stats.recoveriesPer90 !== undefined, "modern UEFA cards use verified passing and recovery metrics");
assert(maldini2003.stats.tacklesWonPer90 === undefined && maldini2003.stats.passCompletionPct === undefined, "untracked historical metrics are omitted instead of treated as zero");
const canizares2001 = SOCCER_PLAYER_DATABASE.find((player) => player.id === "santiago-canizares-toty2001")!;
assert(canizares2001.stats.savePct === undefined, "a goalkeeper save rate is omitted when shot tracking covers less than 70% of the card window");

const benzema2022 = SOCCER_PLAYER_DATABASE.find((player) => player.edition === "UCL2022" && player.name.includes("Benzema"))!;
assert(soccerHonorPoints(benzema2022.honors) === 10, "Benzema's 2021/22 card includes winner, major individual, and top-scorer categories");
assert(soccerHonorDetails(benzema2022.honors).filter((honor) => honor.label.includes("Player of the Season") || honor.label.includes("Ballon")).length === 2, "overlapping major individual awards are both displayed");
assert(soccerHonorDetails(benzema2022.honors).some((honor) => honor.label.includes("15 goals")), "top-scorer honors include the verified goal total");
const raphinha2025 = SOCCER_PLAYER_DATABASE.find((player) => player.edition === "UCL2025" && player.name.includes("Raphinha"))!;
assert(raphinha2025.honors?.topScorer === true && raphinha2025.honors.topScorerLabel?.includes("joint"), "joint Champions League top scorers are labeled explicitly");
assert(soccerHonorPoints({ topScorerOrKeeper: true, topScorerOrKeeperLabel: "UEFA Champions League top scorer" }) === 2, "legacy top-scorer honors retain their value");
assert(soccerHonorPoints({ topScorerOrKeeper: true, topScorerOrKeeperLabel: "UEFA Champions League Goalkeeper of the Season" }) === 2, "legacy goalkeeper honors retain their value");

const defender = byRole("DEF");
assert(validSlotsFor(defender).join(",") === "DEF", "a defender is valid in the single defender slot");
const attacker = byRole("ATT");
assert(validSlotsFor(attacker).includes("ATT_L") && validSlotsFor(attacker).includes("ATT_R"), "an attacker is valid in both attacker slots");
assert(positionPenaltyForSlot(defender, "MID") === 6, "DEF to MID costs 6");
assert(positionPenaltyForSlot(defender, "ATT_L") === 16, "DEF to ATT costs 16");
assert(positionPenaltyForSlot(byRole("MID"), "ATT_R") === 5, "MID to ATT costs 5");
assert(positionPenaltyForSlot(byRole("GK"), "ATT_L") === 30, "GK to outfield costs 30");

const placementTeam = emptyTeam();
placementTeam.roster.push({ player: defender, price: 1, slot: "DEF" });
const fallback = availablePlacementSlots(placementTeam, defender);
assert(fallback.length === 4 && fallback.includes("GK") && fallback.includes("MID") && fallback.includes("ATT_L") && fallback.includes("ATT_R"), "a second defender falls back to every open slot when DEF is occupied");

const pool = buildPool("soccer", () => 0.42);
const eligibility = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
for (const player of pool) {
  const roles = [player.role, player.secondaryRole, player.tertiaryRole].filter(Boolean);
  for (const role of roles) eligibility[role!]++;
}
assert(eligibility.GK >= 2 && eligibility.DEF >= 2 && eligibility.MID >= 2 && eligibility.ATT >= 4, "pool guarantees coverage for one defender and two attackers per team");
const primaryCounts = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
pool.forEach((player) => primaryCounts[player.role]++);
assert(primaryCounts.GK === 3 && primaryCounts.DEF === 4 && primaryCounts.MID === 4 && primaryCounts.ATT === 7, "pool contains 3 GK, 4 DEF, 4 MID, and 7 ATT primary cards");
assert(new Set(pool.map((player) => player.sourceIdentity)).size === pool.length, "a pool never contains two editions of the same player");

const teammateGroups = new Map<string, SoccerPlayerCard[]>();
for (const player of SOCCER_PLAYER_DATABASE.filter((card) => card.edition === "TOTY2011")) {
  for (const teamId of player.sourceTeamIds) teammateGroups.set(teamId, [...(teammateGroups.get(teamId) ?? []), player]);
}
const chemistryCards = [...teammateGroups.values()].sort((a, b) => b.length - a.length)[0].slice(0, 5);
const chemistryTeam = emptyTeam();
chemistryTeam.roster = chemistryCards.map((player, index) => ({ player, price: 1, slot: ["GK", "DEF", "MID", "ATT_L", "ATT_R"][index] as any }));
assert(soccerScoreComponents(chemistryTeam).chemistry.bonus === 6, "chemistry is capped at 6");
assert(Number.isFinite(soccerScoreComponents(chemistryTeam).total), "soccer scoring is deterministic and finite");

const fitTeam = emptyTeam();
const fitCards = (["GK", "DEF", "MID", "ATT"] as const).map((role) => ({ ...byRole(role), id: `fit-${role}` }));
fitCards[0].performance = { ...fitCards[0].performance, goalkeeping: 14 };
fitCards[1].performance = { ...fitCards[1].performance, defense: 14 };
fitCards[2].performance = { ...fitCards[2].performance, creation: 14 };
fitCards[3].performance = { ...fitCards[3].performance, attack: 14 };
fitTeam.roster = fitCards.map((player, index) => ({ player, price: 1, slot: ["GK", "DEF", "MID", "ATT_L"][index] as any }));
const roleAwareFit = soccerFitAssessment(fitTeam);
assert(roleAwareFit.total === 4, "fit is a modest reward for a sourced goalkeeper, defender, creator, and attacker");
assert(roleAwareFit.scorerBonus === 1 && roleAwareFit.defensiveAnchorBonus === 1, "fit uses role-appropriate strengths");

const decoratedTeam = emptyTeam();
decoratedTeam.roster = [...SOCCER_PLAYER_DATABASE]
  .sort((a, b) => soccerHonorPoints(b.honors) - soccerHonorPoints(a.honors))
  .slice(0, 5)
  .map((player, index) => ({ player, price: 1, slot: ["GK", "DEF", "MID", "ATT_L", "ATT_R"][index] as any }));
const decoratedScore = soccerScoreComponents(decoratedTeam);
assert(decoratedScore.honorsUncapped > 20, "verified football achievements remain available for score details");
assert(decoratedScore.honors === SOCCER_HONORS_CAP, "verified honors are capped at 20 points per lineup");
assert(Math.abs(decoratedScore.total - (
  decoratedScore.performance.total + decoratedScore.teamSuccess + decoratedScore.honors
  + decoratedScore.fit.total + decoratedScore.chemistry.bonus - decoratedScore.wrongPositionPenalty
)) < 0.001, "every visible football score component is added exactly once");

const transparentTeam = emptyTeam();
const plainCard = { ...byRole("ATT"), honors: undefined, teamSuccess: 0 };
transparentTeam.roster = [{ player: plainCard, price: 1, slot: "ATT_L" }];
const plainScore = soccerScoreComponents(transparentTeam).total;
transparentTeam.roster = [{
  player: { ...plainCard, teamSuccess: 0.75, honors: { bestPlayer: true, bestPlayerLabel: "Verified major award" } },
  price: 1,
  slot: "ATT_L",
}];
assert(Math.abs(soccerScoreComponents(transparentTeam).total - plainScore - 5.75) < 0.001, "major honors and team success change the final score by their displayed values");

const legacyBase = byRole("MID");
const legacyQuality = 13.4;
const legacyAchievement = 17;
const legacyCard = {
  ...legacyBase,
  performance: {
    ...legacyBase.performance,
    achievementScore: legacyAchievement,
    roleScore: legacyQuality * 0.85 + legacyAchievement * 0.15,
  },
};
assert(Math.abs(soccerPlayerQuality(legacyCard) - legacyQuality) < 0.001, "persisted pre-audit room cards normalize to their award-free quality");

const screenshotLineup = (ids: string[]): TeamState => ({
  ...emptyTeam(),
  roster: ids.map((id, index) => ({
    player: SOCCER_PLAYER_DATABASE.find((player) => player.id === id)!,
    price: 1,
    slot: ["GK", "DEF", "MID", "ATT_L", "ATT_R"][index] as any,
  })),
});
const screenshotTeamA = screenshotLineup([
  "iker-casillas-toty2009", "paolo-maldini-toty2003", "kevin-de-bruyne-ucl2021",
  "robert-lewandowski-toty2020", "cristiano-ronaldo-toty2014",
]);
const screenshotTeamB = screenshotLineup([
  "gianluigi-buffon-toty2003", "alessandro-bastoni-ucl2023", "luis-garcia-toty2005",
  "lionel-messi-toty2015", "david-trezeguet-toty2001",
]);
assert(soccerScoreComponents(screenshotTeamA).total > soccerScoreComponents(screenshotTeamB).total + 5, "the reported stronger one-defender, two-attacker lineup wins by a meaningful margin");

let aiState = createMatch("soccer", () => 0.314);
const aiSeenPlayerIds = new Set<string>();
let guard = 0;
while (aiState.phase !== "complete" && guard++ < 300) {
  const seat = aiState.phase === "placing" ? aiState.pendingPlacement?.seat : aiState.phase === "bidding" ? aiState.auction?.turn : aiState.phase === "skipOffer" ? aiState.skipOffer?.respondingSeat : aiState.turn;
  if (!seat) break;
  const shown = aiState.auction?.player ?? aiState.skipOffer?.player ?? aiState.pendingPlacement?.player ?? aiState.pool[0];
  if (shown) aiSeenPlayerIds.add(shown.id);
  const context: AiDecisionContext = {
    difficulty: "competitive",
    sessionSeed: "soccer-engine-simulation",
    seenPlayerIds: [...aiSeenPlayerIds],
    candidateDatabase: SOCCER_PLAYER_DATABASE,
  };
  const result = applyAction(aiState, decideAiAction(aiState, seat, context));
  if (!result.ok) { failures++; console.error(`FAIL: AI action rejected: ${result.error}`); break; }
  aiState = result.state;
}
assert(aiState.phase === "complete", "soccer AI-vs-AI draft completes");
assert(aiState.teams.A.roster.length === 5 && aiState.teams.B.roster.length === 5, "both soccer rosters finish with five players");

if (failures) {
  console.error(`\n${failures} soccer engine test(s) failed.`);
  process.exit(1);
}
console.log("\nAll soccer engine tests passed.");
