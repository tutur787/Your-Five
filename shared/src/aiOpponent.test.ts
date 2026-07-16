import {
  AI_DIFFICULTY_PROFILES,
  aiThinkingDelay,
  applyAiLineupOptimization,
  bestAiLineup,
  decideAiAction,
  evaluateAiPlayer,
} from "./aiOpponent";
import { actingSeat, applyAction, createMatch, playerCompositeValue } from "./gameEngine";
import { dailyRng } from "./dailySeed";
import { PLAYER_DATABASE } from "./players";
import { SOCCER_PLAYER_DATABASE } from "./soccerPlayers";
import type { AiDecisionContext, AiDifficulty, MatchState, PlayerCard, SeatId, Sport, TeamState } from "./types";

let failures = 0;
function assert(condition: unknown, message: string) {
  if (condition) console.log(`ok: ${message}`);
  else { failures++; console.error(`FAIL: ${message}`); }
}

function context(difficulty: AiDifficulty, seed: string, seen: Iterable<string>): AiDecisionContext {
  return { difficulty, sessionSeed: seed, seenPlayerIds: [...seen] };
}

function stateWithPool(players: PlayerCard[]): MatchState {
  const state = createMatch(players[0].sport, () => 0.42);
  return { ...state, pool: [...players] };
}

const strongest = [...PLAYER_DATABASE].sort((a, b) => playerCompositeValue(b) - playerCompositeValue(a))[0];
const weakest = [...PLAYER_DATABASE].sort((a, b) => playerCompositeValue(a) - playerCompositeValue(b))[0];
const hiddenA = PLAYER_DATABASE.filter((player) => player.id !== strongest.id).slice(0, 5);
const hiddenB = PLAYER_DATABASE.filter((player) => player.id !== strongest.id).slice(-5).reverse();
const publicContext = context("competitive", "hidden-pool-proof", [strongest.id]);
const hiddenStateA = stateWithPool([strongest, ...hiddenA]);
const hiddenStateB = stateWithPool([strongest, ...hiddenB]);
const hiddenActionA = decideAiAction(hiddenStateA, "A", publicContext);
const hiddenActionB = decideAiAction(hiddenStateB, "A", publicContext);
assert(JSON.stringify(hiddenActionA) === JSON.stringify(hiddenActionB), "hidden player identities and order cannot change the AI action");

const evaluationA = evaluateAiPlayer(hiddenStateA, "A", strongest, publicContext);
const evaluationB = evaluateAiPlayer(hiddenStateA, "A", strongest, publicContext);
assert(JSON.stringify(evaluationA) === JSON.stringify(evaluationB), "the same public state produces a stable reservation price");
assert(hiddenActionA.type === "openBid", "a high-value card produces an opening bid");
if (hiddenActionA.type === "openBid") {
  assert([1, 2, 3, 5].includes(hiddenActionA.startBid), "the AI opens at a human-sized bid");
  assert(
    hiddenActionA.startBid <= Math.max(1, Math.floor(evaluationA.reservationBid * 0.4)),
    "the opening bid does not expose more than 40% of the reservation price"
  );
}

const weakState = stateWithPool([weakest, ...hiddenA]);
const weakContext = context("competitive", "weak-card-skip", [weakest.id]);
const weakEvaluation = evaluateAiPlayer(weakState, "A", weakest, weakContext);
const weakAction = decideAiAction(weakState, "A", weakContext);
assert(weakEvaluation.percentile < AI_DIFFICULTY_PROFILES.competitive.skipPercentile, "the weakest card falls below the competitive skip threshold");
assert(weakAction.type === "useSkip", "the AI spends its free skip on a bottom-tier public option");

let auctionState = stateWithPool([strongest, ...hiddenA]);
const opened = applyAction(auctionState, { type: "openBid", seat: "A", startBid: 1 });
if (!opened.ok) throw new Error(opened.error);
auctionState = opened.state;
const auctionContext = context("expert", "incremental-raise", [strongest.id]);
const raiseAction = decideAiAction(auctionState, "B", auctionContext);
assert(raiseAction.type === "raiseBid", "expert AI contests an elite card at a $1 opening");
if (raiseAction.type === "raiseBid") {
  assert([2, 3, 5].includes(raiseAction.amount), "the first response is a $1, $2, or round-number jump");
}

const curry = PLAYER_DATABASE.find((player) => player.name === "Stephen Curry" && player.era === "2015-16")!;
const shaq = PLAYER_DATABASE.find((player) => player.name === "Shaquille O'Neal" && player.era === "2000-01")!;
const swappedTeam: TeamState = {
  seat: "B",
  budget: 12,
  roster: [
    { player: curry, price: 4, slot: "C" },
    { player: shaq, price: 4, slot: "PG" },
  ],
  skipsUsed: 0,
  catchUpSkipUsed: false,
};
const optimized = bestAiLineup(swappedTeam, "basketball");
assert(optimized.team.roster.find((pick) => pick.player.id === curry.id)?.slot === "PG", "lineup optimizer returns Curry to point guard");
assert(optimized.team.roster.find((pick) => pick.player.id === shaq.id)?.slot === "C", "lineup optimizer returns Shaq to center");

for (const difficulty of ["casual", "competitive", "expert"] as const) {
  const delayContext = context(difficulty, `delay-${difficulty}`, [strongest.id]);
  const delayA = aiThinkingDelay(hiddenStateA, "A", delayContext);
  const delayB = aiThinkingDelay(hiddenStateA, "A", delayContext);
  assert(delayA >= 650 && delayA <= 1450, `${difficulty} think time stays within the human pacing range`);
  assert(delayA === delayB, `${difficulty} think time is deterministic for the same decision`);
}

assert(AI_DIFFICULTY_PROFILES.casual.analysisStrength === 0.55, "casual uses 55% pool-analysis strength");
assert(AI_DIFFICULTY_PROFILES.competitive.denialPremium === 1, "competitive denial premium is capped at $1");
assert(AI_DIFFICULTY_PROFILES.expert.denialPremium === 2, "expert denial premium is capped at $2");

function simulate(sport: Sport, difficulty: AiDifficulty, seed: string): MatchState {
  let state = createMatch(sport, dailyRng(`pool:${seed}`));
  const seen = new Set<string>();
  let guard = 0;
  while (state.phase !== "complete" && guard++ < 350) {
    const player = state.auction?.player ?? state.skipOffer?.player ?? state.pendingPlacement?.player ?? state.pool[0];
    if (player) seen.add(player.id);
    const seat = actingSeat(state);
    if (!seat) throw new Error(`No acting seat in ${state.phase}`);
    const action = decideAiAction(state, seat, context(difficulty, seed, seen));
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`${difficulty} ${sport} AI action failed: ${result.error}`);
    state = action.type === "placePick" ? applyAiLineupOptimization(result.state, seat) : result.state;
  }
  if (state.phase !== "complete") throw new Error(`${difficulty} ${sport} simulation did not finish`);
  return state;
}

for (const sport of ["basketball", "soccer"] as const) {
  for (const difficulty of ["casual", "competitive", "expert"] as const) {
    const result = simulate(sport, difficulty, `${sport}-${difficulty}`);
    assert(result.teams.A.roster.length === 5 && result.teams.B.roster.length === 5, `${difficulty} ${sport} simulation fills both lineups`);
    assert(result.teams.A.budget >= 0 && result.teams.B.budget >= 0, `${difficulty} ${sport} simulation preserves legal budgets`);
  }
}

const deterministicA = simulate("basketball", "expert", "deterministic-match");
const deterministicB = simulate("basketball", "expert", "deterministic-match");
const signature = (state: MatchState) => JSON.stringify({
  winner: state.winner,
  A: state.teams.A.roster.map((pick) => [pick.player.id, pick.price, pick.slot]),
  B: state.teams.B.roster.map((pick) => [pick.player.id, pick.price, pick.slot]),
});
assert(signature(deterministicA) === signature(deterministicB), "seeded AI matches are reproducible");

assert(SOCCER_PLAYER_DATABASE.length > 0, "soccer public candidate database is available to the AI model");

if (failures > 0) {
  console.error(`\n${failures} AI test(s) failed.`);
  process.exit(1);
}
console.log("\nAll AI opponent tests passed.");
