import { availablePlacementSlots, maxAffordable, playerCompositeValue } from "./gameEngine";
import { areTeammates, PLAYER_DATABASE } from "./players";
import { MatchAction, MatchState, PlayerCard, ROSTER_SIZE, SeatId, TeamState } from "./types";

/** Bonus added to a candidate's value per real-life teammate already on the AI's own roster. */
const CHEMISTRY_BID_BONUS = 4;

/** The composite score value plus a small bump for bonding with anyone already on the AI's roster. */
function playerValueForAi(team: TeamState, player: PlayerCard): number {
  const bonds = team.roster.filter((pick) => areTeammates(pick.player.name, player.name)).length;
  return playerCompositeValue(player) + bonds * CHEMISTRY_BID_BONUS;
}

// Derived from the actual curated database rather than hardcoded, so this stays correct as the
// composite formula (era-adjustment, defense, plus-minus, team success, accolades) evolves.
const compositeValues = PLAYER_DATABASE.map(playerCompositeValue);
const VALUE_FLOOR = Math.min(...compositeValues);
const VALUE_CEILING = Math.max(...compositeValues);
const WEAK_PLAYER_THRESHOLD = VALUE_FLOOR + (VALUE_CEILING - VALUE_FLOOR) * 0.2;

/** How much the AI is willing to pay for a player of this value, scaled against its remaining budget/slots. */
function suggestBid(value: number, budgetCap: number, remainingSlots: number): number {
  const normalized = Math.max(0, Math.min(1, (value - VALUE_FLOOR) / (VALUE_CEILING - VALUE_FLOOR)));
  const fairShare = budgetCap / Math.max(1, remainingSlots);
  const target = Math.round(fairShare * (0.3 + normalized * 1.5)); // ~0.3x fair share for scrubs, up to ~1.8x for stars
  return Math.max(1, Math.min(budgetCap, target));
}

/**
 * Decides the AI's next move. Assumes it's actually the AI's turn — callers should check
 * `actingSeat(state) === aiSeat` first. Values each revealed player by the same composite score
 * the engine uses to decide the winner (era-adjusted offense/defense, plus-minus, team success,
 * accolades), with a small bump for real-life teammates already on its own roster, and bids more
 * aggressively for stronger players, holds back on weaker ones, and uses its one-time skip
 * situationally rather than randomly.
 */
export function decideAiAction(state: MatchState, aiSeat: SeatId): MatchAction {
  const team = state.teams[aiSeat];
  const remainingSlots = ROSTER_SIZE - team.roster.length;
  const budgetCap = maxAffordable(team);

  if (state.phase === "onTheClock") {
    const player = state.pool[0];
    if (!player) throw new Error("AI asked to act with an empty pool");
    const value = playerValueForAi(team, player);
    const weakPlayer = value < WEAK_PLAYER_THRESHOLD;
    if (!team.skipUsed && weakPlayer && remainingSlots > 1) {
      return { type: "useSkip", seat: aiSeat };
    }
    return { type: "openBid", seat: aiSeat, startBid: suggestBid(value, budgetCap, remainingSlots) };
  }

  if (state.phase === "bidding" && state.auction) {
    const value = playerValueForAi(team, state.auction.player);
    const willingTo = suggestBid(value, budgetCap, remainingSlots);
    const nextBid = state.auction.currentBid + 1;
    if (nextBid > willingTo || nextBid > budgetCap) {
      return { type: "acceptBid", seat: aiSeat };
    }
    return { type: "raiseBid", seat: aiSeat, amount: Math.min(willingTo, budgetCap) };
  }

  if (state.phase === "skipOffer" && state.skipOffer) {
    const value = playerValueForAi(team, state.skipOffer.player);
    // A $1 player is almost always worth taking, unless it's genuinely weak and there's still time to find better.
    const accept = value >= WEAK_PLAYER_THRESHOLD || remainingSlots <= 1;
    return { type: "respondToSkip", seat: aiSeat, accept };
  }

  if (state.phase === "placing" && state.pendingPlacement?.seat === aiSeat) {
    const [slot] = availablePlacementSlots(team, state.pendingPlacement.player);
    if (!slot) throw new Error("AI asked to place a player with no open slots");
    return { type: "placePick", seat: aiSeat, slot };
  }

  throw new Error(`AI has nothing to do in phase ${state.phase}`);
}
