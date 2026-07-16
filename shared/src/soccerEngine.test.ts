import {
  applyAction,
  availablePlacementSlots,
  buildPool,
  createMatch,
  positionPenaltyForSlot,
  validSlotsFor,
} from "./gameEngine";
import { decideAiAction } from "./aiOpponent";
import { SOCCER_PLAYER_DATABASE, SOCCER_SOURCE_REVISION } from "./soccerPlayers";
import { soccerScoreComponents } from "./soccerScoring";
import type { AiDecisionContext, MatchState, SoccerPlayerCard, TeamState } from "./types";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) console.log(`ok: ${message}`);
  else { failures++; console.error(`FAIL: ${message}`); }
}

const byRole = (role: SoccerPlayerCard["role"]) => SOCCER_PLAYER_DATABASE.find((player) => player.role === role)!;
const emptyTeam = (): TeamState => ({ seat: "A", budget: 20, roster: [], skipsUsed: 0, catchUpSkipUsed: false });

assert(SOCCER_PLAYER_DATABASE.length === 60, "database contains exactly 60 cards");
assert(new Set(SOCCER_PLAYER_DATABASE.map((player) => player.id)).size === 60, "all soccer card IDs are unique");
assert(SOCCER_PLAYER_DATABASE.every((player) => player.sourceRevision === SOCCER_SOURCE_REVISION), "every card uses the pinned source revision");
assert(SOCCER_PLAYER_DATABASE.every((player) => player.stats.minutes >= (player.editionKind === "club" ? 900 : 180)), "every card meets its minutes floor");
assert(SOCCER_PLAYER_DATABASE.every((player) => Object.values(player.stats).every(Number.isFinite)), "every sourced metric is finite");

const defender = byRole("DEF");
assert(validSlotsFor(defender).includes("DEF_L") && validSlotsFor(defender).includes("DEF_R"), "a defender is valid in both defender slots");
assert(positionPenaltyForSlot(defender, "MID") === 6, "DEF to MID costs 6");
assert(positionPenaltyForSlot(defender, "ATT") === 16, "DEF to ATT costs 16");
assert(positionPenaltyForSlot(byRole("MID"), "ATT") === 5, "MID to ATT costs 5");
assert(positionPenaltyForSlot(byRole("GK"), "ATT") === 30, "GK to outfield costs 30");

const placementTeam = emptyTeam();
placementTeam.roster.push({ player: defender, price: 1, slot: "DEF_L" });
assert(availablePlacementSlots(placementTeam, defender).join(",") === "DEF_R", "second defender is initially placed in the other defender slot");
placementTeam.roster.push({ player: { ...defender, id: `${defender.id}-copy` }, price: 1, slot: "DEF_R" });
const fallback = availablePlacementSlots(placementTeam, defender);
assert(fallback.length === 3 && fallback.includes("GK") && fallback.includes("MID") && fallback.includes("ATT"), "placement falls back to every open slot when valid slots are occupied");

const pool = buildPool("soccer", () => 0.42);
const eligibility = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
for (const player of pool) {
  const roles = [player.role, player.secondaryRole, player.tertiaryRole].filter(Boolean);
  for (const role of roles) eligibility[role!]++;
}
assert(eligibility.GK >= 2 && eligibility.DEF >= 4 && eligibility.MID >= 2 && eligibility.ATT >= 2, "pool guarantees minimum role coverage");

const chemistryCards = SOCCER_PLAYER_DATABASE.filter((player) => player.edition === "SA15" && player.team === "Juventus").slice(0, 5);
const chemistryTeam = emptyTeam();
chemistryTeam.roster = chemistryCards.map((player, index) => ({ player, price: 1, slot: ["GK", "DEF_L", "DEF_R", "MID", "ATT"][index] as any }));
assert(soccerScoreComponents(chemistryTeam).chemistry.bonus === 12, "chemistry is capped at 12");
assert(Number.isFinite(soccerScoreComponents(chemistryTeam).total), "soccer scoring is deterministic and finite");

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
