/**
 * Quick manual scenario runner for the draft engine (not a full test framework —
 * run with `npm run test:engine` from the repo root).
 */
import {
  accoladePoints,
  accoladesBonus,
  actingSeat,
  applyAction,
  availablePlacementSlots,
  chemistryPairs,
  fitAssessment,
  HIGH_USAGE_PPG_THRESHOLD,
  MAX_ALPHA_SCORERS_BEFORE_PENALTY,
  MAX_PER_POSITION_IN_POOL,
  MIN_ELIGIBLE_PER_POSITION_IN_POOL,
  nextSkipPrice,
  PENALTY_PER_WRONG_POSITION,
  positionPenaltyForSlot,
  scoreComponents,
  STACKING_PENALTY_PER_EXTRA_ALPHA,
  teamScore,
  validSlotsFor,
  wrongPositionCount,
  wrongPositionPenalty,
} from "./gameEngine";
import { buildPool, createMatch } from "./gameFactory";
import { decideAiAction } from "./aiOpponent";
import { dailyRng } from "./dailySeed";
import { BASKETBALL_RUNTIME } from "./basketballRuntime";
import { PLAYER_DATABASE } from "./players";
import { AiDecisionContext, BasketballPlayerCard, MatchState, PlayerCard, POSITIONS } from "./types";

function findPlayer(id: string): BasketballPlayerCard {
  const player = BASKETBALL_RUNTIME.database.find((p) => p.id === id && p.sport === "basketball") as BasketballPlayerCard | undefined;
  if (!player) throw new Error(`Test setup error: no player with id ${id}`);
  return player;
}

/** A hand-built match with a specific, known reveal order (bypasses the random pool for determinism). */
function matchWithPool(players: PlayerCard[]): MatchState {
  return {
    sport: "basketball",
    pool: [...players],
    teams: {
      A: { seat: "A", budget: 20, roster: [], skipsUsed: 0, catchUpSkipUsed: false },
      B: { seat: "B", budget: 20, roster: [], skipsUsed: 0, catchUpSkipUsed: false },
    },
    turn: "A",
    phase: "onTheClock",
    auction: null,
    skipOffer: null,
    pendingPlacement: null,
    log: [],
    winner: null,
  };
}

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

function placePending(state: MatchState, slot?: (typeof POSITIONS)[number]) {
  if (state.phase !== "placing" || !state.pendingPlacement) return state;
  const pending = state.pendingPlacement;
  const team = state.teams[pending.seat];
  const chosenSlot = slot ?? availablePlacementSlots(team, pending.player)[0];
  if (!chosenSlot) throw new Error("Test setup error: no placement slot available");
  const res = applyAction(state, { type: "placePick", seat: pending.seat, slot: chosenSlot });
  if (!res.ok) throw new Error(`Placement unexpectedly failed: ${chosenSlot} -> ${res.error}`);
  return res.state;
}

function must(state: MatchState, action: Parameters<typeof applyAction>[1], autoPlace = true) {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(`Action unexpectedly failed: ${JSON.stringify(action)} -> ${res.error}`);
  return autoPlace ? placePending(res.state) : res.state;
}

/**
 * Drafts every player in `players` onto team A, respecting turn alternation: opens directly when
 * it's A's turn, otherwise lets B open and A raises over it (B then accepts A's raise) so A still
 * wins. Useful for building a specific known roster on one side for scoring assertions.
 */
function giveAllToA(players: PlayerCard[]): MatchState {
  let state = matchWithPool(players);
  for (let i = 0; i < players.length; i++) {
    if (state.turn === "A") {
      state = must(state, { type: "openBid", seat: "A", startBid: 1 });
      state = must(state, { type: "acceptBid", seat: "B" });
    } else {
      state = must(state, { type: "openBid", seat: "B", startBid: 1 });
      state = must(state, { type: "raiseBid", seat: "A", amount: 2 });
      state = must(state, { type: "acceptBid", seat: "B" });
    }
  }
  return state;
}

// --- Scenario 1: normal bid war on the auto-revealed player, back-and-forth raises ---
{
  let state = createMatch();
  const revealed = state.pool[0];
  state = must(state, { type: "openBid", seat: "A", startBid: 2 });
  assert(state.phase === "bidding", "S1: phase becomes bidding after opening");
  assert(state.auction!.player.id === revealed.id, "S1: the auction is on the player that was revealed");
  state = must(state, { type: "raiseBid", seat: "B", amount: 5 });
  assert(state.auction!.currentBid === 5 && state.auction!.standingBidder === "B", "S1: raise updates standing bidder");
  state = must(state, { type: "raiseBid", seat: "A", amount: 7 });
  assert(state.auction!.currentBid === 7 && state.auction!.standingBidder === "A", "S1: back-and-forth raises keep going");
  state = must(state, { type: "acceptBid", seat: "B" });
  assert(state.teams.A.roster.length === 1 && state.teams.A.budget === 13, "S1: A wins player for $7 after multi-round war");
  assert(state.turn === "B", "S1: turn alternates to B regardless of who won");
}

// --- Scenario 2: skip -> opponent accepts for $1 ---
{
  let state = createMatch();
  state = must(state, { type: "useSkip", seat: "A" });
  assert(state.phase === "skipOffer" && state.teams.A.skipsUsed === 1, "S2: skip offer created, A's free skip consumed");
  const offeredId = state.skipOffer!.player.id;
  state = must(state, { type: "respondToSkip", seat: "B", accept: true });
  assert(
    state.teams.B.roster.length === 1 && state.teams.B.roster[0].player.id === offeredId && state.teams.B.budget === 19,
    "S2: B gets the skipped player for $1"
  );
  assert(state.turn === "B", "S2: turn alternates to B after A's skip resolves");
}

// --- Scenario 3: skip -> opponent passes too -> player removed, and passing costs nothing ---
{
  let state = createMatch();
  const poolSizeBefore = state.pool.length;
  state = must(state, { type: "useSkip", seat: "A" });
  state = must(state, { type: "respondToSkip", seat: "B", accept: false });
  assert(state.teams.A.roster.length === 0 && state.teams.B.roster.length === 0, "S3: neither team gets the player");
  assert(state.teams.B.skipsUsed === 0, "S3: passing on someone else's skip offer does NOT consume B's own skip");
  assert(state.pool.length === poolSizeBefore - 1, "S3: player permanently removed from pool");
  assert(state.turn === "B", "S3: turn passes to B after the round resolves");
}

// --- Scenario 4: passing on a skip offer is always free, even after you've used your own skip ---
{
  let state = createMatch();
  state = must(state, { type: "openBid", seat: "A", startBid: 1 });
  state = must(state, { type: "acceptBid", seat: "B" }); // A wins pick 1, turn passes to B
  assert(state.turn === "B", "S4: turn is now B's");
  state = must(state, { type: "useSkip", seat: "B" }); // B burns their own skip, offer goes to A
  state = must(state, { type: "respondToSkip", seat: "A", accept: true }); // A takes it, A's skip still unused
  assert(state.turn === "A", "S4: turn alternates back to A");
  state = must(state, { type: "useSkip", seat: "A" }); // A's skip is still available
  assert(state.skipOffer!.respondingSeat === "B", "S4: skip offer now goes to B");
  const declineRes = applyAction(state, { type: "respondToSkip", seat: "B", accept: false });
  assert(declineRes.ok === true, "S4: B can freely pass even though B already used their own skip earlier");
  assert(declineRes.state.teams.B.skipsUsed === 1, "S4: B's skip count stays unchanged after passing");
}

// --- Scenario 5: budget safeguard rejects overbidding ---
{
  let state = createMatch();
  // The current player fills one of five open slots, so only four future $1 slots are reserved.
  const res = applyAction(state, { type: "openBid", seat: "A", startBid: 17 });
  assert(res.ok === false, "S5: bid exceeding reserve-adjusted max is rejected");
  const res2 = applyAction(state, { type: "openBid", seat: "A", startBid: 16 });
  assert(res2.ok === true, "S5: bid exactly at max allowed succeeds");

  const oneDollarSkip = matchWithPool([findPlayer("allen-iverson-2000-01")]);
  oneDollarSkip.teams.A.skipsUsed = 1;
  const paidRes = applyAction(oneDollarSkip, { type: "buySkip", seat: "A" });
  assert(
    paidRes.ok && paidRes.state.phase === "skipOffer" && paidRes.state.teams.A.budget === 19 && paidRes.state.teams.A.skipsUsed === 2,
    "S5b: the second skip costs $1"
  );

  const fiveDollarSkip = matchWithPool([findPlayer("allen-iverson-2000-01")]);
  fiveDollarSkip.teams.A.skipsUsed = 2;
  const fiveDollarResult = applyAction(fiveDollarSkip, { type: "buySkip", seat: "A" });
  assert(
    fiveDollarResult.ok && fiveDollarResult.state.teams.A.budget === 15 && fiveDollarResult.state.teams.A.skipsUsed === 3,
    "S5b: the third skip costs $5"
  );

  const tenDollarSkip = matchWithPool([findPlayer("allen-iverson-2000-01")]);
  tenDollarSkip.teams.A.skipsUsed = 3;
  tenDollarSkip.teams.A.budget = 14;
  tenDollarSkip.teams.A.roster = PLAYER_DATABASE.slice(0, 4).map((player, index) => ({
    player,
    price: 1,
    slot: POSITIONS[index]!,
  }));
  const tenDollarResult = applyAction(tenDollarSkip, { type: "buySkip", seat: "A" });
  assert(
    tenDollarResult.ok && tenDollarResult.state.teams.A.budget === 4 && tenDollarResult.state.teams.A.skipsUsed === 4,
    "S5b: the fourth skip costs $10 when the roster reserve remains intact"
  );
  assert(nextSkipPrice(tenDollarResult.state.teams.A) === null, "S5b: no fifth skip is available");

  const exhaustedSkips = matchWithPool([findPlayer("allen-iverson-2000-01")]);
  exhaustedSkips.teams.A.skipsUsed = 4;
  assert(applyAction(exhaustedSkips, { type: "buySkip", seat: "A" }).ok === false, "S5b: a fifth skip is rejected");

  const noSpareBudget = matchWithPool([findPlayer("allen-iverson-2000-01")]);
  noSpareBudget.teams.A.skipsUsed = 1;
  noSpareBudget.teams.A.budget = 6;
  const blockedPaidRes = applyAction(noSpareBudget, { type: "buySkip", seat: "A" });
  assert(blockedPaidRes.ok === false, "S5b: a paid skip cannot spend money reserved for open roster spots");
}

// --- Scenario 6: full draft completes when both rosters hit 5, regardless of position duplicates ---
{
  let state = createMatch();
  let guard = 0;
  while (state.phase !== "complete") {
    guard++;
    if (guard > 200) throw new Error("Draft did not complete in a reasonable number of actions");
    if (state.phase === "onTheClock") {
      const seat = state.turn;
      state = must(state, { type: "openBid", seat, startBid: 1 });
    } else if (state.phase === "bidding") {
      state = must(state, { type: "acceptBid", seat: state.auction!.turn });
    } else if (state.phase === "skipOffer") {
      state = must(state, { type: "respondToSkip", seat: state.skipOffer!.respondingSeat, accept: true });
    } else if (state.phase === "catchUp") {
      state = must(state, { type: "takeForOne", seat: state.turn });
    }
  }
  assert(state.teams.A.roster.length === 5 && state.teams.B.roster.length === 5, "S6: both rosters reach 5 players");
}

// --- Scenario 7: once a team hits 5/5, the other team may use only its next ladder skip ---
{
  let state = createMatch();
  let guard = 0;
  while (state.teams.A.roster.length < 5 && guard < 50) {
    guard++;
    const clockSeat = state.turn;
    if (clockSeat === "A") {
      state = must(state, { type: "openBid", seat: "A", startBid: 1 });
      state = must(state, { type: "acceptBid", seat: "B" });
    } else {
      state = must(state, { type: "openBid", seat: "B", startBid: 1 });
      state = must(state, { type: "raiseBid", seat: "A", amount: 2 });
      state = must(state, { type: "acceptBid", seat: "B" });
    }
  }
  assert(state.teams.A.roster.length === 5, "S7: Team A reached 5/5 by winning every contested round");
  assert(state.phase === "catchUp" && state.turn === "B", "S7: B enters the $1 catch-up phase when A is full");

  const paidCatchUp = JSON.parse(JSON.stringify(state)) as MatchState;
  paidCatchUp.teams.B.skipsUsed = 1; // The free skip was spent before the endgame.
  const paidCatchUpResult = applyAction(paidCatchUp, { type: "buySkip", seat: "B" });
  assert(
    paidCatchUpResult.ok &&
      paidCatchUpResult.state.phase === "catchUp" &&
      paidCatchUpResult.state.teams.B.catchUpSkipUsed,
    "S7: if the free skip was already spent, B may use the $1 skip as its single catch-up skip"
  );
  assert(
    applyAction(paidCatchUpResult.state, { type: "buySkip", seat: "B" }).ok === false,
    "S7: a paid catch-up skip cannot be used twice"
  );

  const freeSkippedId = state.pool[0].id;
  state = must(state, { type: "useSkip", seat: "B" });
  assert(
    state.phase === "catchUp" && state.teams.B.roster.every((pick) => pick.player.id !== freeSkippedId),
    "S7: B's saved free skip removes one catch-up card instead of offering it to the full team"
  );

  assert(
    applyAction(state, { type: "buySkip", seat: "B" }).ok === false,
    "S7: after using the free catch-up skip, B cannot also buy a second endgame skip"
  );

  while (state.phase !== "complete") {
    if (state.phase !== "catchUp") throw new Error(`Unexpected S7 phase: ${state.phase}`);
    state = must(state, { type: "takeForOne", seat: "B" });
  }
  assert(state.teams.B.roster.length === 5, "S7: B fills every remaining roster spot through catch-up choices");
  assert(state.teams.B.roster.every((p) => p.price === 1), "S7: every accepted catch-up player costs B $1");
  const scoreA = teamScore(state.teams.A);
  const scoreB = teamScore(state.teams.B);
  const expectedWinner = scoreA === scoreB ? "tie" : scoreA > scoreB ? "A" : "B";
  assert(state.winner === expectedWinner, "S7: declared winner matches the recomputed combined stat totals");
}

// --- Scenario 8: initial placement uses open listed slots first, then any open slot; later swaps are free ---
{
  const iverson = findPlayer("allen-iverson-2000-01"); // SG, secondary PG
  const free = findPlayer("world-free-1976-77"); // SG, secondary PG
  const hodges = findPlayer("craig-hodges-1984-85"); // SG, secondary PG
  let state = matchWithPool([iverson, free, hodges]);

  state = must(state, { type: "openBid", seat: "A", startBid: 1 });
  state = must(state, { type: "acceptBid", seat: "B" }, false); // A wins Iverson -> SG is open
  assert(state.phase === "placing" && state.pendingPlacement?.seat === "A", "S8: winning a player opens a placement step");
  assert(availablePlacementSlots(state.teams.A, iverson).join(",") === "SG,PG", "S8: first pick can use any open listed slot");
  state = must(state, { type: "placePick", seat: "A", slot: "SG" }, false);
  assert(state.teams.A.roster[0].slot === "SG", "S8: first pick auto-assigns to their open primary position");

  state = must(state, { type: "openBid", seat: "B", startBid: 1 }); // B on the clock now
  state = must(state, { type: "raiseBid", seat: "A", amount: 2 });
  state = must(state, { type: "acceptBid", seat: "B" }, false); // A wins Free too -> SG taken, secondary PG is open
  assert(availablePlacementSlots(state.teams.A, free).join(",") === "PG", "S8: second same-primary pick can only use its open secondary slot");
  state = must(state, { type: "placePick", seat: "A", slot: "PG" }, false);
  const freePick = state.teams.A.roster.find((p) => p.player.id === free.id)!;
  assert(freePick.slot === "PG", "S8: second same-primary pick lands in its secondary position");

  state = must(state, { type: "openBid", seat: "A", startBid: 1 }); // A on the clock again
  state = must(state, { type: "acceptBid", seat: "B" }, false); // A wins Hodges -> SG and PG both taken now
  const fallbackSlots = availablePlacementSlots(state.teams.A, hodges);
  assert(
    fallbackSlots.length === 3 && !fallbackSlots.includes("SG") && !fallbackSlots.includes("PG"),
    "S8: when listed slots are full, placement allows any remaining open slot"
  );
  state = must(state, { type: "placePick", seat: "A", slot: fallbackSlots[0] }, false);
  const hodgesPick = state.teams.A.roster.find((p) => p.player.id === hodges.id)!;
  assert(
    hodgesPick.slot !== "SG" && hodgesPick.slot !== "PG",
    "S8: third pick with both natural slots taken falls back to an empty slot"
  );
  assert(wrongPositionCount(state.teams.A) === 1, "S8: that fallback placement counts as one wrong-position pick");

  const invalidSlot = POSITIONS.find(
    (p) => p !== hodges.position && p !== hodges.secondaryPosition && p !== hodges.tertiaryPosition && p !== hodgesPick.slot
  )!;
  const freeMoveRes = applyAction(state, { type: "setSlot", seat: "A", playerId: hodges.id, slot: invalidSlot });
  assert(freeMoveRes.ok === true, "S8: after placement, assigning to a non-listed position is allowed");
  state = freeMoveRes.state;

  // Hodges's primary (SG) is occupied by Iverson -> moving him there should swap the two.
  state = must(state, { type: "setSlot", seat: "A", playerId: hodges.id, slot: "SG" });
  const afterSwap = state.teams.A;
  assert(afterSwap.roster.find((p) => p.player.id === hodges.id)!.slot === "SG", "S8: Hodges moved into his primary slot");
  assert(
    afterSwap.roster.find((p) => p.player.id === iverson.id)!.slot === invalidSlot,
    "S8: Iverson was swapped into Hodges's old slot rather than leaving it empty or duplicating"
  );
  assert(wrongPositionCount(afterSwap) === 1, "S8: still exactly one wrong-position pick after the swap (now Iverson)");
  const slotsUsed = afterSwap.roster.map((p) => p.slot);
  assert(new Set(slotsUsed).size === slotsUsed.length, "S8: no two picks ever share the same slot");

  const otherSeatRes = applyAction(state, { type: "setSlot", seat: "B", playerId: hodges.id, slot: "PG" });
  assert(otherSeatRes.ok === false, "S8: the other seat cannot edit a slot on a roster they don't own");
}

// --- Scenario 9: buildPool never has more than MAX_PER_POSITION_IN_POOL of any one position ---
{
  for (let i = 0; i < 20; i++) {
    const pool = buildPool();
    const counts: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    pool.forEach((p) => counts[p.position]++);
    const overCap = POSITIONS.some((pos) => counts[pos] > MAX_PER_POSITION_IN_POOL);
    if (overCap) {
      assert(false, `S9: pool exceeded ${MAX_PER_POSITION_IN_POOL}-per-position cap: ${JSON.stringify(counts)}`);
      break;
    }
  }
  assert(true, `S9: 20 random pools all respected the ${MAX_PER_POSITION_IN_POOL}-per-position cap`);
}

// --- Scenario 9b: buildPool guarantees min coverage per position among the first 10 revealed ---
{
  let worst = Infinity;
  for (let i = 0; i < 50; i++) {
    const first10 = buildPool().slice(0, 10);
    for (const pos of POSITIONS) {
      const eligible = first10.filter((p) => validSlotsFor(p).includes(pos)).length;
      worst = Math.min(worst, eligible);
    }
  }
  assert(
    worst >= MIN_ELIGIBLE_PER_POSITION_IN_POOL,
    `S9b: across 50 pools, every position always had >= ${MIN_ELIGIBLE_PER_POSITION_IN_POOL} eligible players in the first 10 reveals (worst seen: ${worst})`
  );
}

// --- Scenario 10: a completed roster always ends up with exactly one player per slot, no empties or dupes ---
{
  let state = createMatch();
  let guard = 0;
  while (state.phase !== "complete") {
    guard++;
    if (guard > 200) throw new Error("Draft did not complete in a reasonable number of actions");
    if (state.phase === "onTheClock") {
      state = must(state, { type: "openBid", seat: state.turn, startBid: 1 });
    } else if (state.phase === "bidding") {
      state = must(state, { type: "acceptBid", seat: state.auction!.turn });
    } else if (state.phase === "skipOffer") {
      state = must(state, { type: "respondToSkip", seat: state.skipOffer!.respondingSeat, accept: true });
    } else if (state.phase === "catchUp") {
      state = must(state, { type: "takeForOne", seat: state.turn });
    }
  }
  for (const seat of ["A", "B"] as const) {
    const team = state.teams[seat];
    const slotCounts = POSITIONS.map((pos) => team.roster.filter((p) => p.slot === pos).length);
    assert(slotCounts.every((c) => c === 1), `S10: seat ${seat}'s completed roster has exactly one player per slot, no empties or stacks`);
  }
  const scoreA = teamScore(state.teams.A);
  const componentsA = scoreComponents(state.teams.A);
  assert(scoreA === componentsA.total, "S10: teamScore matches the sum of scoreComponents()");
  assert(
    componentsA.wrongPositionPenalty === wrongPositionPenalty(state.teams.A) && PENALTY_PER_WRONG_POSITION > 0,
    "S10: teamScore subtracts the NBA-distance wrong-position penalty"
  );
}

// --- Scenario 10b: accolades bonus adds real award points on top of raw stats ---
{
  const jordan90s = findPlayer("michael-jordan-1995-96"); // mvp:1, champion:1, allNba:1, allDefense:1 in our data
  const noAccolades = findPlayer("aaron-mckie-2000-01"); // no accolades entry in our data
  let state = matchWithPool([jordan90s, noAccolades]);
  state = must(state, { type: "openBid", seat: "A", startBid: 1 });
  state = must(state, { type: "acceptBid", seat: "B" }); // A wins Jordan
  state = must(state, { type: "openBid", seat: "B", startBid: 1 });
  state = must(state, { type: "acceptBid", seat: "A" }); // B wins Reggie Miller
  const bonus = accoladesBonus(state.teams.A);
  const expected = accoladePoints(jordan90s.accolades);
  assert(bonus === expected, `S10b: accolades bonus matches real award counts (expected ${expected}, got ${bonus})`);
  assert(accoladesBonus(state.teams.B) === 0, "S10b: a player with no accolades entry contributes zero bonus");
}

// --- Scenario 11: initial placement is restricted, but later reassignment can be intentionally wrong ---
{
  const jokic = findPlayer("kareem-abdul-jabbar-1970-71"); // C, no secondary position
  const embiid = findPlayer("dikembe-mutombo-2000-01"); // C, no secondary position (just filler for the pool)
  let state = matchWithPool([jokic, embiid]);
  state = must(state, { type: "openBid", seat: "A", startBid: 1 });
  state = must(state, { type: "acceptBid", seat: "B" }, false); // A wins Jokic -> C is open
  assert(!jokic.secondaryPosition, "S11: sanity check, Jokic has no secondary position in the data");
  const invalid = POSITIONS.find((p) => p !== "C")!;
  const initialPlacement = applyAction(state, { type: "placePick", seat: "A", slot: invalid });
  assert(initialPlacement.ok === false, "S11: initial placement must use the open listed position when one exists");
  state = must(state, { type: "placePick", seat: "A", slot: "C" }, false);
  const laterMove = applyAction(state, { type: "setSlot", seat: "A", playerId: jokic.id, slot: invalid });
  assert(laterMove.ok === true, "S11: after placement, a player with only a primary position can still be moved wrong");
}

// --- Scenario 11b: wrong-position penalty follows basketball adjacency rather than a flat charge ---
{
  const oakley = findPlayer("charles-oakley-1985-86"); // PF only
  const kareem = findPlayer("kareem-abdul-jabbar-1970-71"); // C only
  const pfAtC = positionPenaltyForSlot(oakley, "C");
  const cAtPg = positionPenaltyForSlot(kareem, "PG");
  assert(pfAtC > 0, "S11b: PF at C is still penalized when C is not listed");
  assert(cAtPg > pfAtC, "S11b: C at PG is penalized more than PF at C");
}

// --- Scenario 12: the same daily seed always produces the same pool; a different date differs ---
{
  const poolA1 = buildPool(dailyRng("2026-07-14"));
  const poolA2 = buildPool(dailyRng("2026-07-14"));
  const poolB = buildPool(dailyRng("2026-07-15"));
  const idsA1 = poolA1.map((p) => p.id).join(",");
  const idsA2 = poolA2.map((p) => p.id).join(",");
  const idsB = poolB.map((p) => p.id).join(",");
  assert(idsA1 === idsA2, "S12: the same date seed produces an identical pool/reveal order across two calls");
  assert(idsA1 !== idsB, "S12: a different date seed produces a different pool/reveal order");
}

// --- Scenario 13: the AI opponent always produces a legal action, across many full simulated drafts ---
{
  const totalGames = 20;
  let illegalActionFound = false;
  for (let game = 0; game < totalGames && !illegalActionFound; game++) {
    let state = createMatch();
    const seenPlayerIds = new Set<string>();
    let guard = 0;
    while (state.phase !== "complete") {
      guard++;
      if (guard > 300) throw new Error(`AI-vs-AI draft #${game} did not complete in a reasonable number of actions`);
      const seat = actingSeat(state);
      if (!seat) throw new Error(`No acting seat but phase is ${state.phase} (game #${game})`);
      const shown = state.auction?.player ?? state.skipOffer?.player ?? state.pendingPlacement?.player ?? state.pool[0];
      if (shown) seenPlayerIds.add(shown.id);
      const context: AiDecisionContext = {
        difficulty: "competitive",
        sessionSeed: `engine-simulation-${game}`,
        seenPlayerIds: [...seenPlayerIds],
        candidateDatabase: BASKETBALL_RUNTIME.database,
      };
      const action = decideAiAction(state, seat, context);
      const res = applyAction(state, action);
      if (!res.ok) {
        assert(false, `S13: AI produced an illegal action in game #${game}: ${JSON.stringify(action)} -> ${res.error}`);
        illegalActionFound = true;
        break;
      }
      state = res.state;
    }
    if (!illegalActionFound) {
      assert(
        state.teams.A.roster.length === 5 && state.teams.B.roster.length === 5,
        `S13: AI-vs-AI game #${game} completed with both rosters full`
      );
    }
  }
  if (!illegalActionFound) {
    assert(true, `S13: AI-vs-AI played ${totalGames} full drafts with every action legal`);
  }
}

// --- Scenario 14: era-adjustment scales the scoring offense value but never touches displayed stats ---
{
  const mikan = findPlayer("kareem-abdul-jabbar-1970-71"); // eraFactor 0.913 in our data
  assert(mikan.eraFactor !== undefined && mikan.eraFactor !== 1, "S14: sanity check, Kareem's 1970-71 card has a non-trivial eraFactor");
  const rawTotal = mikan.stats.ppg + mikan.stats.rpg + mikan.stats.apg;
  let state = matchWithPool([mikan]);
  state = must(state, { type: "openBid", seat: "A", startBid: 1 });
  state = must(state, { type: "acceptBid", seat: "B" });
  const drafted = state.teams.A.roster[0].player as BasketballPlayerCard;
  assert(
    drafted.stats.ppg === mikan.stats.ppg && drafted.stats.rpg === mikan.stats.rpg && drafted.stats.apg === mikan.stats.apg,
    "S14: the displayed stats on the drafted card are the real, unadjusted numbers"
  );
  const offense = scoreComponents(state.teams.A).offense;
  const expectedOffense = rawTotal * mikan.eraFactor!;
  assert(
    Math.abs(offense - expectedOffense) < 1e-9,
    `S14: era-adjustment scales the scoring offense value (expected ${expectedOffense.toFixed(3)}, got ${offense.toFixed(3)})`
  );
  assert(offense !== rawTotal, "S14: the era-adjusted scoring value differs from the raw displayed total");
}

// --- Scenario 15: missing legacy-era stats (spg/bpg/plusMinus/defRtgVsAvg) contribute exactly 0, never NaN ---
{
  const mikan = findPlayer("kareem-abdul-jabbar-1970-71");
  assert(
    mikan.stats.spg === undefined && mikan.stats.bpg === undefined && mikan.stats.plusMinus === undefined && mikan.stats.defRtgVsAvg === undefined,
    "S15: sanity check, Kareem's 1970-71 data has no steals/blocks/plus-minus/DefRtg (pre-tracking era)"
  );
  let state = matchWithPool([mikan]);
  state = must(state, { type: "openBid", seat: "A", startBid: 1 });
  state = must(state, { type: "acceptBid", seat: "B" });
  const components = scoreComponents(state.teams.A);
  assert(components.defenseBox === 0, "S15: missing steals/blocks contribute exactly 0 defenseBox value");
  assert(components.defRating === 0, "S15: missing DefRtgVsAvg contributes exactly 0 defRating value");
  assert(components.plusMinus === 0, "S15: missing plus-minus contributes exactly 0 plusMinus value");
  assert(!Number.isNaN(components.total), "S15: the total score is never NaN when legacy stats are missing");
}

// --- Scenario 16: real NBA teammates bond, producing both a chemistry bonus and a detected pair ---
{
  const lebron2015 = findPlayer("lebron-james-2015-16");
  const wade2005 = findPlayer("dwyane-wade-2005-06");
  const state = giveAllToA([lebron2015, wade2005]);
  const pairs = chemistryPairs(state.teams.A);
  assert(pairs.length === 1, `S16: LeBron (2015-16) + Wade (2005-06) produce exactly one detected chemistry pair (got ${pairs.length})`);
  const namesInPair = pairs.length === 1 ? [pairs[0].a.player.name, pairs[0].b.player.name].sort() : [];
  assert(
    JSON.stringify(namesInPair) === JSON.stringify(["Dwyane Wade", "LeBron James"]),
    "S16: the detected pair names the real people, independent of which classic-team card was drafted"
  );
  const components = scoreComponents(state.teams.A);
  assert(components.chemistry.bonus > 0, "S16: a real teammate pair produces a nonzero chemistry bonus in the score breakdown");
}

// --- Scenario 17: players who were never real teammates do not bond ---
{
  const jordan9596 = findPlayer("michael-jordan-1995-96");
  const lebron2015 = findPlayer("lebron-james-2015-16");
  const state = giveAllToA([jordan9596, lebron2015]);
  const pairs = chemistryPairs(state.teams.A);
  assert(pairs.length === 0, "S17: Jordan and LeBron were never real teammates, so no chemistry pair is detected");
  assert(scoreComponents(state.teams.A).chemistry.bonus === 0, "S17: no chemistry bonus is awarded for a non-bonded pair");
}

// --- Scenario 18: fit/synergy stacking penalty and balance bonuses trigger only under intended conditions ---
{
  // Three era-adjusted 25+ PPG alpha scorers, plus a playmaker and a (low-scoring) rim protector.
  const iverson = findPlayer("allen-iverson-2000-01");
  const jordan9293 = findPlayer("michael-jordan-1992-93");
  const kobe0001 = findPlayer("kobe-bryant-2000-01");
  const magic9091 = findPlayer("magic-johnson-1990-91");
  const mutombo = findPlayer("dikembe-mutombo-1993-94"); // 12.0 ppg, 3.4 bpg raw — rim protector, not an alpha scorer
  const stacked = [iverson, jordan9293, kobe0001, magic9091, mutombo];
  const state = giveAllToA(stacked);
  const fit = fitAssessment(state.teams.A);
  assert(fit.alphaScorers === 3, `S18: all three era-adjusted 25+ PPG alpha scorers are detected (got ${fit.alphaScorers})`);
  assert(
    fit.stackingPenalty === (3 - MAX_ALPHA_SCORERS_BEFORE_PENALTY) * STACKING_PENALTY_PER_EXTRA_ALPHA,
    "S18: the stacking penalty applies only to alphas beyond the allowed max"
  );
  assert(fit.hasPlaymaking === true, "S18: a real high-APG playmaker triggers the playmaking bonus");
  assert(fit.hasRimProtection === true, "S18: a real high-BPG rim protector triggers the rim protection bonus");

  // A modest, unstacked roster should trigger neither the penalty nor the bonuses.
  const mckie = findPlayer("aaron-mckie-2000-01");
  const hill = findPlayer("tyrone-hill-2000-01");
  const plainState = giveAllToA([mckie, hill]);
  const plainFit = fitAssessment(plainState.teams.A);
  assert(plainFit.stackingPenalty === 0, "S18: a roster without redundant alpha scorers has no stacking penalty");
  assert(plainFit.hasPlaymaking === false && plainFit.hasRimProtection === false, "S18: a roster without a real playmaker/rim protector gets no balance bonus");
  assert(plainFit.total === 0, "S18: fit assessment nets to zero when neither penalty nor bonus conditions are met");
  assert(HIGH_USAGE_PPG_THRESHOLD > 0, "S18: sanity check, the alpha-scorer threshold constant is exported and positive");
}

if (failures > 0) {
  console.error(`\n${failures} scenario check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll engine scenario checks passed.");
}
