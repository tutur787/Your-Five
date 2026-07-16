import { applyAction, completeByForfeit, timeoutActionFor, validSlotsFor } from "./gameEngine";
import { createSeededMatch, POOL_VERSIONS } from "./gameFactory";

let failures = 0;
function assert(condition: unknown, message: string): void {
  if (condition) console.log(`ok: ${message}`);
  else {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}

for (const sport of ["basketball", "soccer"] as const) {
  const first = createSeededMatch(sport, "reliability-seed", "match-one");
  const second = createSeededMatch(sport, "reliability-seed", "match-two");
  assert(
    first.pool.map((player) => player.id).join(",") === second.pool.map((player) => player.id).join(","),
    `${sport}: a pool seed reproduces the same reveal order`
  );
  assert(first.matchId !== second.matchId, `${sport}: match identity is independent from pool identity`);
  assert(first.poolVersion === POOL_VERSIONS[sport], `${sport}: seeded matches carry the current pool version`);

  const open = timeoutActionFor(first);
  assert(open?.type === "openBid" && open.startBid === 1 && open.seat === "A", `${sport}: an opening timeout bids $1`);
  const opened = applyAction(first, open!);
  assert(opened.ok, `${sport}: the timeout opening is legal`);

  const concede = timeoutActionFor(opened.state);
  assert(concede?.type === "acceptBid" && concede.seat === "B", `${sport}: an auction timeout concedes`);
  const conceded = applyAction(opened.state, concede!);
  assert(conceded.ok && conceded.state.phase === "placing", `${sport}: the timeout concession begins placement`);

  const placement = timeoutActionFor(conceded.state);
  const expectedSlot = validSlotsFor(conceded.state.pendingPlacement!.player)[0];
  assert(
    placement?.type === "placePick" && placement.seat === "A" && placement.slot === expectedSlot,
    `${sport}: a placement timeout chooses the first valid open slot`
  );
  const placed = applyAction(conceded.state, placement!);
  assert(placed.ok, `${sport}: the timeout placement is legal`);

  const skipped = applyAction(placed.state, { type: "useSkip", seat: placed.state.turn });
  assert(skipped.ok && skipped.state.phase === "skipOffer", `${sport}: test setup reaches a skip offer`);
  const decline = timeoutActionFor(skipped.state);
  assert(decline?.type === "respondToSkip" && decline.accept === false, `${sport}: a skip-offer timeout declines`);

  const catchUp = { ...placed.state, phase: "catchUp" as const, turn: "A" as const };
  const take = timeoutActionFor(catchUp);
  assert(take?.type === "takeForOne" && take.seat === "A", `${sport}: a catch-up timeout takes the card for $1`);

  const forfeited = completeByForfeit(placed.state, "B");
  assert(
    forfeited.phase === "complete" && forfeited.winner === "A" && forfeited.completionReason === "forfeit" && forfeited.forfeitedSeat === "B",
    `${sport}: a disconnect forfeit records the winner and reason without scoring partial teams`
  );
}

if (failures > 0) {
  console.error(`\n${failures} reliability test(s) failed.`);
  process.exit(1);
}
console.log("\nAll reliability tests passed.");
