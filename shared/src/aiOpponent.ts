import {
  applyAction,
  availablePlacementSlots,
  canBuySkip,
  MAX_PER_POSITION_IN_POOL,
  maxAffordable,
  nextSkipPrice,
  SOCCER_MAX_PRIMARY_IN_POOL,
  slotsForSport,
  teamScore,
  validSlotsFor,
} from "./gameEngine";
import {
  AiDecisionContext,
  AiDifficulty,
  LineupSlot,
  MatchAction,
  MatchState,
  PlayerCard,
  ROSTER_SIZE,
  RosterPick,
  SeatId,
  Sport,
  TeamState,
} from "./types";

interface DifficultyProfile {
  analysisStrength: number;
  preferenceVariation: number;
  denialPremium: number;
  skipPercentile: number;
}

export const AI_DIFFICULTY_PROFILES: Record<AiDifficulty, DifficultyProfile> = {
  casual: { analysisStrength: 0.55, preferenceVariation: 0.25, denialPremium: 0, skipPercentile: 0.24 },
  competitive: { analysisStrength: 0.85, preferenceVariation: 0.1, denialPremium: 1, skipPercentile: 0.2 },
  expert: { analysisStrength: 1, preferenceVariation: 0.04, denialPremium: 2, skipPercentile: 0.16 },
};

interface WeightedCandidate {
  player: PlayerCard;
  weight: number;
}

interface LineupResult {
  team: TeamState;
  score: number;
}

export interface AiPlayerEvaluation {
  fillsOpenPosition: boolean;
  openValidSlots: LineupSlot[];
  marginalScore: number;
  alternativeMedianScore: number;
  alternativeSpread: number;
  percentile: number;
  scarcity: number;
  opponentPercentile: number;
  reservationBid: number;
  possibleAlternatives: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function other(seat: SeatId): SeatId {
  return seat === "A" ? "B" : "A";
}

function primaryRole(player: PlayerCard): string {
  return player.sport === "soccer" ? player.role : player.position;
}

function databaseFor(sport: Sport, context: AiDecisionContext): PlayerCard[] {
  return (context.candidateDatabase ?? []).filter((player): player is PlayerCard => player.sport === sport);
}

function roleCaps(sport: Sport): Record<string, number> {
  if (sport === "soccer") return SOCCER_MAX_PRIMARY_IN_POOL;
  return { PG: MAX_PER_POSITION_IN_POOL, SG: MAX_PER_POSITION_IN_POOL, SF: MAX_PER_POSITION_IN_POOL, PF: MAX_PER_POSITION_IN_POOL, C: MAX_PER_POSITION_IN_POOL };
}

function stableRandom(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return (hash >>> 0) / 4294967296;
}

function lineupSignature(team: TeamState): string {
  return team.roster.map((pick) => pick.player.id).sort().join("|");
}

/** Finds the highest-scoring assignment for up to five cards. Five slots keeps this at 120 permutations. */
export function bestAiLineup(team: TeamState, sport: Sport, addedPlayer?: PlayerCard, price = 1): LineupResult {
  const picks: RosterPick[] = [
    ...team.roster.map((pick) => ({ ...pick })),
    ...(addedPlayer ? [{ player: addedPlayer, price, slot: slotsForSport(sport)[0] }] : []),
  ];
  if (picks.length === 0) return { team: { ...team, roster: [] }, score: teamScore({ ...team, roster: [] }, sport) };

  const slots = slotsForSport(sport);
  let bestRoster: RosterPick[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  const assign = (index: number, remaining: LineupSlot[], roster: RosterPick[]) => {
    if (index === picks.length) {
      const candidateTeam = { ...team, roster };
      const score = teamScore(candidateTeam, sport);
      if (score > bestScore) {
        bestScore = score;
        bestRoster = roster.map((pick) => ({ ...pick }));
      }
      return;
    }
    for (let slotIndex = 0; slotIndex < remaining.length; slotIndex++) {
      const slot = remaining[slotIndex];
      assign(
        index + 1,
        [...remaining.slice(0, slotIndex), ...remaining.slice(slotIndex + 1)],
        [...roster, { ...picks[index], slot }]
      );
    }
  };

  assign(0, slots, []);
  const roster = bestRoster ?? picks;
  return { team: { ...team, roster }, score: bestScore };
}

function marginalLineupValue(team: TeamState, sport: Sport, player: PlayerCard): { score: number; slot: LineupSlot } {
  const before = bestAiLineup(team, sport);
  const after = bestAiLineup(team, sport, player);
  const added = after.team.roster.find((pick) => pick.player.id === player.id);
  return { score: after.score - before.score, slot: added?.slot ?? slotsForSport(sport)[0] };
}

function publicAlternatives(sport: Sport, seenPlayerIds: readonly string[], context: AiDecisionContext): WeightedCandidate[] {
  const database = databaseFor(sport, context);
  const seen = new Set(seenPlayerIds);
  const caps = roleCaps(sport);
  const seenByRole: Record<string, number> = {};
  const unseenByRole: Record<string, number> = {};

  for (const player of database) {
    const role = primaryRole(player);
    if (seen.has(player.id)) seenByRole[role] = (seenByRole[role] ?? 0) + 1;
    else unseenByRole[role] = (unseenByRole[role] ?? 0) + 1;
  }

  const weighted = database
    .filter((player) => !seen.has(player.id))
    .map((player) => {
      const role = primaryRole(player);
      const remainingQuota = Math.max(0, (caps[role] ?? 0) - (seenByRole[role] ?? 0));
      return { player, weight: remainingQuota / Math.max(1, unseenByRole[role] ?? 1) };
    })
    .filter(({ weight }) => weight > 0);

  if (weighted.length > 0) return weighted;
  return database.filter((player) => !seen.has(player.id)).map((player) => ({ player, weight: 1 }));
}

function weightedPercentile(value: number, values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return 0.5;
  const below = values.reduce((sum, entry) => {
    if (entry.value < value) return sum + entry.weight;
    if (entry.value === value) return sum + entry.weight * 0.5;
    return sum;
  }, 0);
  return clamp(below / totalWeight, 0, 1);
}

function weightedMedian(values: Array<{ value: number; weight: number }>): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = 0;
  for (const entry of sorted) {
    cursor += entry.weight;
    if (cursor >= total / 2) return entry.value;
  }
  return sorted[sorted.length - 1].value;
}

function evaluationValues(team: TeamState, sport: Sport, alternatives: WeightedCandidate[]) {
  return alternatives.map(({ player, weight }) => ({ value: marginalLineupValue(team, sport, player).score, weight, player }));
}

function minimumPositionMismatches(picks: RosterPick[], availableSlots: LineupSlot[]): number {
  if (picks.length === 0) return 0;
  let minimum = Number.POSITIVE_INFINITY;

  const assign = (index: number, remaining: LineupSlot[], mismatches: number) => {
    if (mismatches >= minimum) return;
    if (index === picks.length) {
      minimum = mismatches;
      return;
    }
    const valid = new Set(validSlotsFor(picks[index].player));
    for (let slotIndex = 0; slotIndex < remaining.length; slotIndex++) {
      assign(
        index + 1,
        [...remaining.slice(0, slotIndex), ...remaining.slice(slotIndex + 1)],
        mismatches + (valid.has(remaining[slotIndex]) ? 0 : 1)
      );
    }
  };

  assign(0, availableSlots, 0);
  return minimum;
}

/** Returns natural slots the card can fill without creating an extra roster mismatch. */
export function aiOpenValidSlots(team: TeamState, sport: Sport, player: PlayerCard): LineupSlot[] {
  const slots = slotsForSport(sport);
  const currentMismatches = minimumPositionMismatches(team.roster, slots);
  return validSlotsFor(player).filter((candidateSlot) => {
    const remaining = slots.filter((slot) => slot !== candidateSlot);
    return minimumPositionMismatches(team.roster, remaining) <= currentMismatches;
  });
}

/** Public-information valuation. This deliberately never reads unrevealed entries from MatchState.pool. */
export function evaluateAiPlayer(
  state: MatchState,
  aiSeat: SeatId,
  player: PlayerCard,
  context: AiDecisionContext
): AiPlayerEvaluation {
  const sport = state.sport ?? "basketball";
  const team = state.teams[aiSeat];
  const opponent = state.teams[other(aiSeat)];
  const profile = AI_DIFFICULTY_PROFILES[context.difficulty];
  const seen = Array.from(new Set([...context.seenPlayerIds, player.id]));
  const alternatives = publicAlternatives(sport, seen, context);
  const openValidSlots = aiOpenValidSlots(team, sport, player);
  const fillsOpenPosition = openValidSlots.length > 0;
  const neededAlternatives = alternatives.filter((candidate) => aiOpenValidSlots(team, sport, candidate.player).length > 0);
  const ownValues = evaluationValues(team, sport, neededAlternatives.length > 0 ? neededAlternatives : alternatives);
  const current = marginalLineupValue(team, sport, player);
  const percentile = weightedPercentile(current.score, ownValues);
  const median = weightedMedian(ownValues);
  const valueNumbers = ownValues.map((entry) => entry.value);
  const spread = valueNumbers.length > 0 ? Math.max(...valueNumbers) - Math.min(...valueNumbers) : 1;

  const totalWeight = alternatives.reduce((sum, candidate) => sum + candidate.weight, 0);
  const validAtChosenSlot = validSlotsFor(player).includes(current.slot);
  const slotWeight = validAtChosenSlot
    ? alternatives.reduce((sum, candidate) => sum + (validSlotsFor(candidate.player).includes(current.slot) ? candidate.weight : 0), 0)
    : totalWeight;
  const slotShare = totalWeight > 0 ? slotWeight / totalWeight : 1;
  const scarcity = validAtChosenSlot ? 1 - Math.min(1, slotShare * 3) : 0;

  const opponentValues = evaluationValues(opponent, sport, alternatives);
  const opponentCurrent = marginalLineupValue(opponent, sport, player).score;
  const opponentPercentile = weightedPercentile(opponentCurrent, opponentValues);

  const remainingSlots = ROSTER_SIZE - team.roster.length;
  const budgetCap = maxAffordable(team);
  const fairShare = budgetCap / Math.max(1, remainingSlots);
  const effectivePercentile = 0.5 + (percentile - 0.5) * profile.analysisStrength;
  const qualityMultiplier = 0.35 + 1.55 * effectivePercentile;
  const stage = clamp(team.roster.length / Math.max(1, ROSTER_SIZE - 1), 0, 1);
  const needPremium = 1.5 * scarcity * (0.35 + stage * 0.65);
  const denial = profile.denialPremium * clamp((opponentPercentile - 0.7) / 0.3, 0, 1);
  const preference = 1 + (stableRandom(`${context.sessionSeed}|taste|${aiSeat}|${player.id}|${lineupSignature(team)}`) * 2 - 1) * profile.preferenceVariation;
  const reservationBid = fillsOpenPosition
    ? clamp(Math.round((fairShare * qualityMultiplier + needPremium + denial) * preference), 1, Math.max(1, budgetCap))
    : 0;

  return {
    fillsOpenPosition,
    openValidSlots,
    marginalScore: current.score,
    alternativeMedianScore: median,
    alternativeSpread: Math.max(1, spread),
    percentile,
    scarcity,
    opponentPercentile,
    reservationBid,
    possibleAlternatives: alternatives.length,
  };
}

function openingBid(reservationBid: number, seed: string): number {
  const limit = Math.max(1, Math.floor(reservationBid * 0.4));
  const options = [1, 2, 3, 5].filter((amount) => amount <= limit && amount <= reservationBid);
  if (options.length === 0) return 1;
  const topIndex = options.length - 1;
  const stepBack = stableRandom(seed) < 0.28 && topIndex > 0 ? 1 : 0;
  return options[topIndex - stepBack];
}

function nextRaise(currentBid: number, reservationBid: number, seed: string): number {
  const roll = stableRandom(seed);
  let amount = currentBid + (roll < 0.7 ? 1 : roll < 0.95 ? 2 : 1);
  if (roll >= 0.95) amount = Math.ceil((currentBid + 1) / 5) * 5;
  return Math.min(reservationBid, Math.max(currentBid + 1, amount));
}

function skipImprovementInDollars(evaluation: AiPlayerEvaluation, fairShare: number): number {
  const normalizedGain = Math.max(0, evaluation.alternativeMedianScore - evaluation.marginalScore) / evaluation.alternativeSpread;
  return normalizedGain * fairShare;
}

function shouldUseFreeSkip(evaluation: AiPlayerEvaluation, profile: DifficultyProfile, remainingSlots: number): boolean {
  if (!evaluation.fillsOpenPosition) return true;
  return remainingSlots > 1 && evaluation.possibleAlternatives >= remainingSlots && evaluation.percentile < profile.skipPercentile;
}

function bestPlacementAction(state: MatchState, aiSeat: SeatId): MatchAction {
  const pending = state.pendingPlacement;
  if (!pending) throw new Error("AI asked to place without a pending player");
  const team = state.teams[aiSeat];
  const allowed = availablePlacementSlots(team, pending.player);
  if (allowed.length === 0) throw new Error("AI asked to place a player with no open slots");
  const ideal = bestAiLineup(team, state.sport, pending.player, pending.price).team.roster.find(
    (pick) => pick.player.id === pending.player.id
  )?.slot;
  if (ideal && allowed.includes(ideal)) return { type: "placePick", seat: aiSeat, slot: ideal };

  let bestSlot = allowed[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const slot of allowed) {
    const score = teamScore({ ...team, roster: [...team.roster, { player: pending.player, price: pending.price, slot }] }, state.sport);
    if (score > bestScore) {
      bestScore = score;
      bestSlot = slot;
    }
  }
  return { type: "placePick", seat: aiSeat, slot: bestSlot };
}

/** Returns legal swap actions that move an existing AI roster to its highest-scoring assignment. */
export function aiLineupOptimizationActions(state: MatchState, aiSeat: SeatId): MatchAction[] {
  const team = state.teams[aiSeat];
  if (team.roster.length < 2) return [];
  const target = bestAiLineup(team, state.sport).team.roster;
  const targetSlot = new Map(target.map((pick) => [pick.player.id, pick.slot]));
  const working = team.roster.map((pick) => ({ ...pick }));
  const actions: MatchAction[] = [];

  for (let pass = 0; pass < working.length * 2; pass++) {
    const pick = working.find((entry) => entry.slot !== targetSlot.get(entry.player.id));
    if (!pick) break;
    const slot = targetSlot.get(pick.player.id);
    if (!slot) break;
    actions.push({ type: "setSlot", seat: aiSeat, playerId: pick.player.id, slot });
    const occupant = working.find((entry) => entry.slot === slot && entry.player.id !== pick.player.id);
    const oldSlot = pick.slot;
    pick.slot = slot;
    if (occupant) occupant.slot = oldSlot;
  }
  return actions;
}

export function applyAiLineupOptimization(state: MatchState, aiSeat: SeatId): MatchState {
  let next = state;
  for (const action of aiLineupOptimizationActions(next, aiSeat)) {
    const result = applyAction(next, action);
    if (!result.ok) break;
    next = result.state;
  }
  return next;
}

/** Deterministic human-like pause. Close bid decisions take longer than routine actions. */
export function aiThinkingDelay(state: MatchState, aiSeat: SeatId, context: AiDecisionContext): number {
  const player = state.auction?.player ?? state.skipOffer?.player ?? state.pendingPlacement?.player ?? state.pool[0];
  const key = `${context.sessionSeed}|delay|${aiSeat}|${state.phase}|${player?.id ?? "none"}|${state.auction?.currentBid ?? 0}`;
  let delay = 650 + stableRandom(key) * 500;
  if (state.phase === "bidding" && state.auction && player) {
    const evaluation = evaluateAiPlayer(state, aiSeat, player, context);
    const closeness = clamp(state.auction.currentBid / Math.max(1, evaluation.reservationBid), 0, 1);
    delay += closeness * 300;
  }
  return Math.round(clamp(delay, 650, 1450));
}

/** Chooses one legal action using public information only. */
export function decideAiAction(state: MatchState, aiSeat: SeatId, context: AiDecisionContext): MatchAction {
  const team = state.teams[aiSeat];
  const remainingSlots = ROSTER_SIZE - team.roster.length;
  const budgetCap = maxAffordable(team);
  const profile = AI_DIFFICULTY_PROFILES[context.difficulty];

  if (state.phase === "onTheClock") {
    const player = state.pool[0];
    if (!player) throw new Error("AI asked to act with an empty pool");
    const evaluation = evaluateAiPlayer(state, aiSeat, player, context);
    const skipPrice = nextSkipPrice(team);
    if (!evaluation.fillsOpenPosition) {
      if (skipPrice === 0) return { type: "useSkip", seat: aiSeat };
      if (skipPrice !== null && canBuySkip(team)) return { type: "buySkip", seat: aiSeat };
      // The auction protocol has no free pass. If a skip is unaffordable, open at the floor and concede any raise.
      return { type: "openBid", seat: aiSeat, startBid: 1 };
    }
    if (skipPrice === 0 && (budgetCap < 1 || shouldUseFreeSkip(evaluation, profile, remainingSlots))) {
      return { type: "useSkip", seat: aiSeat };
    }
    const fairShare = budgetCap / Math.max(1, remainingSlots);
    if (
      skipPrice !== null && skipPrice > 0 && canBuySkip(team) && evaluation.percentile < profile.skipPercentile &&
      skipImprovementInDollars(evaluation, fairShare) > skipPrice
    ) {
      return { type: "buySkip", seat: aiSeat };
    }
    return {
      type: "openBid",
      seat: aiSeat,
      startBid: Math.min(budgetCap, openingBid(evaluation.reservationBid, `${context.sessionSeed}|open|${aiSeat}|${player.id}`)),
    };
  }

  if (state.phase === "catchUp") {
    const player = state.pool[0];
    if (!player) throw new Error("AI asked to catch up with an empty pool");
    const evaluation = evaluateAiPlayer(state, aiSeat, player, context);
    const skipPrice = nextSkipPrice(team);
    if (!evaluation.fillsOpenPosition) {
      if (skipPrice === 0) return { type: "useSkip", seat: aiSeat };
      if (skipPrice !== null && canBuySkip(team, true)) return { type: "buySkip", seat: aiSeat };
      return { type: "takeForOne", seat: aiSeat };
    }
    if (skipPrice === 0 && shouldUseFreeSkip(evaluation, profile, remainingSlots)) {
      return { type: "useSkip", seat: aiSeat };
    }
    const fairShare = team.budget / Math.max(1, remainingSlots);
    if (
      skipPrice !== null && skipPrice > 0 && canBuySkip(team, true) && evaluation.percentile < profile.skipPercentile &&
      skipImprovementInDollars(evaluation, fairShare) > skipPrice
    ) {
      return { type: "buySkip", seat: aiSeat };
    }
    return { type: "takeForOne", seat: aiSeat };
  }

  if (state.phase === "bidding" && state.auction) {
    const evaluation = evaluateAiPlayer(state, aiSeat, state.auction.player, context);
    if (!evaluation.fillsOpenPosition) return { type: "acceptBid", seat: aiSeat };
    const nextBid = state.auction.currentBid + 1;
    if (nextBid > evaluation.reservationBid || nextBid > budgetCap) {
      return { type: "acceptBid", seat: aiSeat };
    }
    return {
      type: "raiseBid",
      seat: aiSeat,
      amount: nextRaise(
        state.auction.currentBid,
        Math.min(evaluation.reservationBid, budgetCap),
        `${context.sessionSeed}|raise|${aiSeat}|${state.auction.player.id}|${state.auction.currentBid}`
      ),
    };
  }

  if (state.phase === "skipOffer" && state.skipOffer) {
    const evaluation = evaluateAiPlayer(state, aiSeat, state.skipOffer.player, context);
    const accept = evaluation.fillsOpenPosition && (
      remainingSlots <= 1 || evaluation.scarcity >= 0.5 || (evaluation.marginalScore > 0 && evaluation.percentile >= 0.1)
    );
    return { type: "respondToSkip", seat: aiSeat, accept };
  }

  if (state.phase === "placing" && state.pendingPlacement?.seat === aiSeat) {
    return bestPlacementAction(state, aiSeat);
  }

  throw new Error(`AI has nothing to do in phase ${state.phase}`);
}
