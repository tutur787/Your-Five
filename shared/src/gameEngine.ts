import { areTeammates, PLAYER_DATABASE } from "./players";
import {
  ActionResult,
  MatchAction,
  MatchState,
  PlayerAccolades,
  PlayerCard,
  POSITIONS,
  Position,
  RosterPick,
  ROSTER_SIZE,
  SeatId,
  STARTING_BUDGET,
  TeamState,
} from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function other(seat: SeatId): SeatId {
  return seat === "A" ? "B" : "A";
}

/** A source of randomness in [0, 1) — defaults to Math.random, but accepts a seeded PRNG for deterministic pools (e.g. Daily Draft). */
export type Rng = () => number;

function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Max copies of a single primary position allowed in one match's pool, so reveals don't clump (e.g. 6 centers in the first 10). */
export const MAX_PER_POSITION_IN_POOL = 3;

/**
 * Minimum number of players in the pool who can legally fill each position, so both teams can
 * always build a complete, in-position 5-man lineup. Two per
 * position covers the ~10 players a full draft consumes — one for each team.
 */
export const MIN_ELIGIBLE_PER_POSITION_IN_POOL = 2;

/**
 * Builds a fresh match pool. Two guarantees:
 *  - No more than MAX_PER_POSITION_IN_POOL players share a primary position (so reveals don't clump).
 *  - At least MIN_ELIGIBLE_PER_POSITION_IN_POOL players can fill each position via any valid
 *    listed slot, and those "coverage" players are revealed first — so even a short draft always
 *    has enough of every position for both teams to field a legal lineup.
 * Everything is shuffled so reveal order still differs every match.
 */
export function buildPool(rng: Rng = Math.random): PlayerCard[] {
  const shuffled = shuffle(PLAYER_DATABASE, rng);
  const chosen = new Set<string>();
  const primaryCount: Record<Position, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  const eligibleCount: Record<Position, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  const core: PlayerCard[] = []; // the min-coverage players, revealed first
  const rest: PlayerCard[] = []; // random filler for variety

  const take = (player: PlayerCard, bucket: PlayerCard[]) => {
    chosen.add(player.id);
    primaryCount[player.position]++;
    for (const pos of validSlotsFor(player)) eligibleCount[pos]++;
    bucket.push(player);
  };

  // Phase 1: guarantee minimum coverage for every position (primary or secondary eligibility).
  for (const pos of POSITIONS) {
    for (const player of shuffled) {
      if (eligibleCount[pos] >= MIN_ELIGIBLE_PER_POSITION_IN_POOL) break;
      if (chosen.has(player.id)) continue;
      if (!validSlotsFor(player).includes(pos)) continue;
      if (primaryCount[player.position] >= MAX_PER_POSITION_IN_POOL) continue;
      take(player, core);
    }
  }

  // Phase 2: fill out the rest of the pool for variety, still respecting the primary cap.
  for (const player of shuffled) {
    if (chosen.has(player.id)) continue;
    if (primaryCount[player.position] >= MAX_PER_POSITION_IN_POOL) continue;
    take(player, rest);
  }

  return [...shuffle(core, rng), ...shuffle(rest, rng)];
}

function freshTeam(seat: SeatId): TeamState {
  return { seat, budget: STARTING_BUDGET, roster: [], skipUsed: false };
}

/** Which seat is expected to act next, or null if no action is currently expected. */
export function actingSeat(state: MatchState): SeatId | null {
  if (state.phase === "onTheClock") return state.turn;
  if (state.phase === "bidding") return state.auction?.turn ?? null;
  if (state.phase === "skipOffer") return state.skipOffer?.respondingSeat ?? null;
  if (state.phase === "placing") return state.pendingPlacement?.seat ?? null;
  return null;
}

/** Kept for backwards-compatible imports; the actual penalty is now distance-based by position. */
export const PENALTY_PER_WRONG_POSITION = 15;
export const POSITION_MISMATCH_PENALTY_BY_DISTANCE: Record<number, number> = { 1: 5, 2: 10, 3: 16, 4: 24 };
const POSITION_INDEX: Record<Position, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

/** The positions a player may legitimately fill: their primary, plus secondary/tertiary if they have them. */
export function validSlotsFor(player: PlayerCard): Position[] {
  return [player.position, player.secondaryPosition, player.tertiaryPosition].filter(
    (p): p is Position => Boolean(p)
  );
}

export function emptySlotsFor(team: TeamState): Position[] {
  const occupied = new Set(team.roster.map((pick) => pick.slot));
  return POSITIONS.filter((pos) => !occupied.has(pos));
}

/**
 * Initial placement is stricter than later lineup tinkering: use an open real listed position when
 * one exists; if every listed position is already occupied, any open slot is fair game.
 */
export function availablePlacementSlots(team: TeamState, player: PlayerCard): Position[] {
  const openSlots = emptySlotsFor(team);
  const openListedSlots = validSlotsFor(player).filter((pos) => openSlots.includes(pos));
  return openListedSlots.length > 0 ? openListedSlots : openSlots;
}

export function positionPenaltyForSlot(player: PlayerCard, slot: Position): number {
  const validSlots = validSlotsFor(player);
  if (validSlots.includes(slot)) return 0;
  const distance = Math.min(...validSlots.map((pos) => Math.abs(POSITION_INDEX[pos] - POSITION_INDEX[slot])));
  return POSITION_MISMATCH_PENALTY_BY_DISTANCE[distance] ?? PENALTY_PER_WRONG_POSITION;
}

/**
 * A pick is "wrong" only when it sits outside the player's primary/secondary/tertiary positions.
 * The actual scoring cost varies by basketball distance between positions.
 */
export function wrongPositionCount(team: TeamState): number {
  return team.roster.filter((pick) => !validSlotsFor(pick.player).includes(pick.slot)).length;
}

export function wrongPositionPenalty(team: TeamState): number {
  return team.roster.reduce((sum, pick) => sum + positionPenaltyForSlot(pick.player, pick.slot), 0);
}

/**
 * Auto-fill only runs after the competitive portion of the draft is over. It follows the same
 * placement preference the UI offers: open listed positions first, then any open slot.
 */
function chooseSlotForNewPick(team: TeamState, player: PlayerCard): Position {
  return availablePlacementSlots(team, player)[0] ?? player.position;
}

/** Raw sum of ppg+rpg+apg across a team's roster — real, unadjusted numbers, exactly what's shown in the UI. */
export function rawStatTotal(team: TeamState): number {
  return team.roster.reduce((sum, pick) => sum + pick.player.stats.ppg + pick.player.stats.rpg + pick.player.stats.apg, 0);
}

/** Points awarded per accolade when folding them into the score. */
export const ACCOLADE_POINTS = { mvp: 10, champion: 6, dpoy: 8, allNba: 3, allDefense: 3 } as const;

/** Bonus points a single player's real accolades are worth. */
export function accoladePoints(accolades: PlayerAccolades | undefined): number {
  if (!accolades) return 0;
  return (
    (accolades.mvp ?? 0) * ACCOLADE_POINTS.mvp +
    (accolades.champion ?? 0) * ACCOLADE_POINTS.champion +
    (accolades.dpoy ?? 0) * ACCOLADE_POINTS.dpoy +
    (accolades.allNba ?? 0) * ACCOLADE_POINTS.allNba +
    (accolades.allDefense ?? 0) * ACCOLADE_POINTS.allDefense
  );
}

/** Bonus points from real accolades earned across a team's roster. */
export function accoladesBonus(team: TeamState): number {
  return team.roster.reduce((sum, pick) => sum + accoladePoints(pick.player.accolades), 0);
}

// --- Era-adjusted stat/defense/plus-minus/team-success value ---
// A card's `eraFactor` (defaults to 1, no adjustment) scales its counting stats for SCORING only —
// the real, unadjusted numbers stay exactly as shown everywhere else in the UI. Any of the newer
// stats (spg/bpg/plusMinus/defRtgVsAvg/teamWinPct) that don't exist for an era simply contribute 0 —
// old-timers are scored on what's real for them, nothing is estimated on their behalf.

/** How much a point of Defensive Rating above/below league average is worth, and the cap on that swing. */
export const DEF_RATING_WEIGHT = 0.5;
export const DEF_RATING_CAP = 8;

/** How much a point of career box plus-minus is worth. */
export const PLUS_MINUS_WEIGHT = 0.6;

/** How many points swing a team's score from a .500 team-win% baseline (e.g. a .700 team is worth +4 at 20). */
export const WIN_PCT_WEIGHT = 20;

function eraAdjusted(stat: number, factor: number | undefined): number {
  return stat * (factor ?? 1);
}

function playerOffenseValue(player: PlayerCard): number {
  const { ppg, rpg, apg } = player.stats;
  return eraAdjusted(ppg + rpg + apg, player.eraFactor);
}

function playerDefenseBoxValue(player: PlayerCard): number {
  return eraAdjusted((player.stats.spg ?? 0) + (player.stats.bpg ?? 0), player.eraFactor);
}

function playerDefRatingValue(player: PlayerCard): number {
  if (player.stats.defRtgVsAvg === undefined) return 0;
  return clamp(player.stats.defRtgVsAvg * DEF_RATING_WEIGHT, -DEF_RATING_CAP, DEF_RATING_CAP);
}

function playerPlusMinusValue(player: PlayerCard): number {
  return (player.stats.plusMinus ?? 0) * PLUS_MINUS_WEIGHT;
}

function playerTeamSuccessValue(player: PlayerCard): number {
  if (player.teamWinPct === undefined) return 0;
  return (player.teamWinPct - 0.5) * WIN_PCT_WEIGHT;
}

// --- Fit/synergy: real teams can't feed five alphas, and a lineup with zero playmaking or rim protection has a real ceiling ---

/** Era-adjusted PPG at or above this is "alpha scorer" usage. */
export const HIGH_USAGE_PPG_THRESHOLD = 25;
/** A lineup can carry this many alpha scorers before redundancy starts costing points. */
export const MAX_ALPHA_SCORERS_BEFORE_PENALTY = 2;
export const STACKING_PENALTY_PER_EXTRA_ALPHA = 5;
export const PLAYMAKER_APG_THRESHOLD = 6;
export const RIM_PROTECTOR_BPG_THRESHOLD = 1.5;
export const PLAYMAKING_BONUS = 3;
export const RIM_PROTECTION_BONUS = 3;

export interface FitAssessment {
  alphaScorers: number;
  stackingPenalty: number;
  hasPlaymaking: boolean;
  hasRimProtection: boolean;
  balanceBonus: number;
  /** balanceBonus - stackingPenalty */
  total: number;
}

export function fitAssessment(team: TeamState): FitAssessment {
  const alphaScorers = team.roster.filter(
    (pick) => eraAdjusted(pick.player.stats.ppg, pick.player.eraFactor) >= HIGH_USAGE_PPG_THRESHOLD
  ).length;
  const stackingPenalty = Math.max(0, alphaScorers - MAX_ALPHA_SCORERS_BEFORE_PENALTY) * STACKING_PENALTY_PER_EXTRA_ALPHA;
  const hasPlaymaking = team.roster.some(
    (pick) => eraAdjusted(pick.player.stats.apg, pick.player.eraFactor) >= PLAYMAKER_APG_THRESHOLD
  );
  const hasRimProtection = team.roster.some(
    (pick) => eraAdjusted(pick.player.stats.bpg ?? 0, pick.player.eraFactor) >= RIM_PROTECTOR_BPG_THRESHOLD
  );
  const balanceBonus = (hasPlaymaking ? PLAYMAKING_BONUS : 0) + (hasRimProtection ? RIM_PROTECTION_BONUS : 0);
  return { alphaScorers, stackingPenalty, hasPlaymaking, hasRimProtection, balanceBonus, total: balanceBonus - stackingPenalty };
}

// --- Chemistry: real NBA teammates, at any point in their careers, drafted onto the same team ---

export const CHEMISTRY_BONUS_PER_PAIR = 6;

export interface ChemistryPair {
  a: RosterPick;
  b: RosterPick;
}

/** Every pair of drafted picks whose real players were once actual NBA teammates. */
export function chemistryPairs(team: TeamState): ChemistryPair[] {
  const pairs: ChemistryPair[] = [];
  for (let i = 0; i < team.roster.length; i++) {
    for (let j = i + 1; j < team.roster.length; j++) {
      const a = team.roster[i];
      const b = team.roster[j];
      if (areTeammates(a.player.name, b.player.name)) pairs.push({ a, b });
    }
  }
  return pairs;
}

export function chemistryBonus(team: TeamState): number {
  return chemistryPairs(team).length * CHEMISTRY_BONUS_PER_PAIR;
}

/** Full line-by-line breakdown behind a team's score — the single source of truth for both `teamScore` and the UI. */
export interface ScoreComponents {
  offense: number;
  defenseBox: number;
  defRating: number;
  plusMinus: number;
  teamSuccess: number;
  accolades: number;
  fit: FitAssessment;
  chemistry: { pairs: ChemistryPair[]; bonus: number };
  wrongPositionPenalty: number;
  total: number;
}

export function scoreComponents(team: TeamState): ScoreComponents {
  let offense = 0;
  let defenseBox = 0;
  let defRating = 0;
  let plusMinus = 0;
  let teamSuccess = 0;
  for (const pick of team.roster) {
    offense += playerOffenseValue(pick.player);
    defenseBox += playerDefenseBoxValue(pick.player);
    defRating += playerDefRatingValue(pick.player);
    plusMinus += playerPlusMinusValue(pick.player);
    teamSuccess += playerTeamSuccessValue(pick.player);
  }
  const accolades = accoladesBonus(team);
  const fit = fitAssessment(team);
  const pairs = chemistryPairs(team);
  const chemistry = { pairs, bonus: pairs.length * CHEMISTRY_BONUS_PER_PAIR };
  const mismatchPenalty = wrongPositionPenalty(team);
  const total = offense + defenseBox + defRating + plusMinus + teamSuccess + accolades + fit.total + chemistry.bonus - mismatchPenalty;
  return { offense, defenseBox, defRating, plusMinus, teamSuccess, accolades, fit, chemistry, wrongPositionPenalty: mismatchPenalty, total };
}

/**
 * Combined score used to decide the winner: era-adjusted offense and defense, plus-minus, team
 * success, real accolades, and lineup fit/chemistry bonuses, minus a penalty for every pick that
 * isn't in one of their valid positions.
 */
export function teamScore(team: TeamState): number {
  return scoreComponents(team).total;
}

/**
 * A single player's standalone composite value (era-adjusted offense/defense, plus-minus, team
 * success, and their own accolades) — the same per-player ingredients `scoreComponents` sums
 * across a roster, exposed for the AI opponent's bid valuation. Excludes team-level fit/chemistry,
 * since those depend on who else is already drafted.
 */
export function playerCompositeValue(player: PlayerCard): number {
  return (
    playerOffenseValue(player) +
    playerDefenseBoxValue(player) +
    playerDefRatingValue(player) +
    playerPlusMinusValue(player) +
    playerTeamSuccessValue(player) +
    accoladePoints(player.accolades)
  );
}

export function createMatch(rng: Rng = Math.random): MatchState {
  return {
    pool: buildPool(rng),
    teams: { A: freshTeam("A"), B: freshTeam("B") },
    turn: "A",
    phase: "onTheClock",
    auction: null,
    skipOffer: null,
    pendingPlacement: null,
    log: ["Draft started. A random player is up — seat A is on the clock."],
    winner: null,
  };
}

/** Highest a team may bid/offer while still leaving $1 per remaining roster slot. */
export function maxAffordable(team: TeamState): number {
  const remainingSlots = ROSTER_SIZE - team.roster.length;
  if (remainingSlots <= 0) return 0;
  return team.budget - (remainingSlots - 1);
}

function clone(state: MatchState): MatchState {
  return {
    ...state,
    pool: [...state.pool],
    teams: {
      A: { ...state.teams.A, roster: [...state.teams.A.roster] },
      B: { ...state.teams.B, roster: [...state.teams.B.roster] },
    },
    auction: state.auction ? { ...state.auction } : null,
    skipOffer: state.skipOffer ? { ...state.skipOffer } : null,
    pendingPlacement: state.pendingPlacement ? { ...state.pendingPlacement } : null,
    log: [...state.log],
  };
}

function fail(state: MatchState, error: string): ActionResult {
  return { ok: false, error, state };
}

/** Whoever didn't act first this round acts first next round, unless their roster is already full. */
function nextActor(state: MatchState, actedFirst: SeatId): SeatId {
  const opponent = other(actedFirst);
  if (state.teams[opponent].roster.length < ROSTER_SIZE) return opponent;
  return actedFirst;
}

function beginPlacement(state: MatchState, seat: SeatId, player: PlayerCard, price: number, actedFirst: SeatId): void {
  state.pendingPlacement = { player, price, seat, actedFirst };
  state.auction = null;
  state.skipOffer = null;
  state.phase = "placing";
}

function finish(state: MatchState): void {
  state.phase = "complete";
  const scoreA = teamScore(state.teams.A);
  const scoreB = teamScore(state.teams.B);
  state.winner = scoreA === scoreB ? "tie" : scoreA > scoreB ? "A" : "B";
  state.log.push(
    `Draft complete. Team A: ${scoreA.toFixed(1)} combined stat total, Team B: ${scoreB.toFixed(1)}. ${
      state.winner === "tie" ? "It's a tie!" : `Seat ${state.winner} wins!`
    }`
  );
}

/**
 * Once a team's roster is full, there's no one left to bid against, so the rest of the pool
 * just goes straight to the other team at $1 each until they're full too (or the pool runs dry).
 */
function autoFillIfOneTeamFull(state: MatchState): void {
  const fullSeat: SeatId | null =
    state.teams.A.roster.length >= ROSTER_SIZE ? "A" : state.teams.B.roster.length >= ROSTER_SIZE ? "B" : null;
  if (!fullSeat) return;

  const receiving = other(fullSeat);
  const team = state.teams[receiving];
  if (team.roster.length < ROSTER_SIZE) {
    state.log.push(`Seat ${fullSeat}'s roster is full — the rest of the draft goes to seat ${receiving}.`);
  }
  while (team.roster.length < ROSTER_SIZE && state.pool.length > 0) {
    const player = state.pool.shift() as PlayerCard;
    team.roster.push({ player, price: 1, slot: chooseSlotForNewPick(team, player) });
    team.budget -= 1;
    state.log.push(`${player.name} (${player.position}) auto-awarded to seat ${receiving} for $1.`);
  }

  if (team.roster.length >= ROSTER_SIZE) {
    finish(state);
  } else {
    // Pool ran dry before the receiving team filled up — nothing more can happen.
    state.phase = "onTheClock";
    state.turn = receiving;
  }
}

function checkComplete(state: MatchState): void {
  if (state.phase === "complete") return;
  if (state.teams.A.roster.length >= ROSTER_SIZE && state.teams.B.roster.length >= ROSTER_SIZE) {
    finish(state);
  } else {
    autoFillIfOneTeamFull(state);
  }
}

export function applyAction(state: MatchState, action: MatchAction): ActionResult {
  const next = clone(state);

  switch (action.type) {
    case "openBid": {
      if (next.phase !== "onTheClock") return fail(state, "No player is up for bidding right now.");
      if (action.seat !== next.turn) return fail(state, "It's not your turn.");
      const team = next.teams[action.seat];
      if (team.roster.length >= ROSTER_SIZE) return fail(state, "Your roster is already full.");
      if (next.pool.length === 0) return fail(state, "No players left in the pool.");
      if (!Number.isInteger(action.startBid) || action.startBid < 1) {
        return fail(state, "Starting bid must be a whole dollar amount, at least $1.");
      }
      if (action.startBid > maxAffordable(team)) {
        return fail(state, "That bid would leave you unable to afford your remaining roster slots.");
      }
      const player = next.pool.shift() as PlayerCard;
      next.auction = {
        player,
        currentBid: action.startBid,
        standingBidder: action.seat,
        turn: other(action.seat),
      };
      next.phase = "bidding";
      next.log.push(`${player.name} (${player.position}) is up. Seat ${action.seat} opens at $${action.startBid}.`);
      return { ok: true, state: next };
    }

    case "raiseBid": {
      if (next.phase !== "bidding" || !next.auction) return fail(state, "No active auction.");
      if (action.seat !== next.auction.turn) return fail(state, "It's not your turn to respond.");
      const team = next.teams[action.seat];
      if (!Number.isInteger(action.amount) || action.amount <= next.auction.currentBid) {
        return fail(state, "Your bid must be a whole-dollar raise above the current bid.");
      }
      if (action.amount > maxAffordable(team)) {
        return fail(state, "That bid would leave you unable to afford your remaining roster slots.");
      }
      next.auction.currentBid = action.amount;
      next.auction.standingBidder = action.seat;
      next.auction.turn = other(action.seat);
      next.log.push(`Seat ${action.seat} raises to $${action.amount} for ${next.auction.player.name}.`);
      return { ok: true, state: next };
    }

    case "acceptBid": {
      if (next.phase !== "bidding" || !next.auction) return fail(state, "No active auction.");
      if (action.seat !== next.auction.turn) return fail(state, "It's not your turn to respond.");
      const winner = next.auction.standingBidder;
      const price = next.auction.currentBid;
      const player = next.auction.player;
      next.log.push(`Seat ${action.seat} accepts — seat ${winner} wins ${player.name} for $${price}.`);
      const actedFirst = next.turn;
      beginPlacement(next, winner, player, price, actedFirst);
      return { ok: true, state: next };
    }

    case "useSkip": {
      if (next.phase !== "onTheClock") return fail(state, "No player is up for bidding right now.");
      if (action.seat !== next.turn) return fail(state, "It's not your turn.");
      if (next.teams[action.seat].skipUsed) return fail(state, "You've already used your skip.");
      if (next.pool.length === 0) return fail(state, "No players left in the pool.");
      const player = next.pool.shift() as PlayerCard;
      next.teams[action.seat].skipUsed = true;
      next.skipOffer = { player, skippedBy: action.seat, respondingSeat: other(action.seat) };
      next.phase = "skipOffer";
      next.log.push(`Seat ${action.seat} uses their skip. ${player.name} is offered to seat ${other(action.seat)} for $1.`);
      return { ok: true, state: next };
    }

    case "respondToSkip": {
      if (next.phase !== "skipOffer" || !next.skipOffer) return fail(state, "No pending skip offer.");
      if (action.seat !== next.skipOffer.respondingSeat) return fail(state, "This offer isn't yours to answer.");
      const { player } = next.skipOffer;
      const actedFirst = next.turn;

      if (action.accept) {
        next.log.push(`Seat ${action.seat} takes ${player.name} for $1.`);
        beginPlacement(next, action.seat, player, 1, actedFirst);
      } else {
        // Passing on someone else's skip offer is free — it doesn't touch your own skip.
        next.log.push(`Seat ${action.seat} passes too — ${player.name} is removed from the draft.`);
        next.skipOffer = null;
        next.phase = "onTheClock";
        next.turn = nextActor(next, actedFirst);
        checkComplete(next);
      }

      return { ok: true, state: next };
    }

    case "placePick": {
      if (next.phase !== "placing" || !next.pendingPlacement) return fail(state, "No player is waiting to be placed.");
      const pending = next.pendingPlacement;
      if (action.seat !== pending.seat) return fail(state, "This player belongs to the other team.");
      if (!POSITIONS.includes(action.slot)) return fail(state, "Unknown position slot.");

      const team = next.teams[action.seat];
      const allowedSlots = availablePlacementSlots(team, pending.player);
      if (!allowedSlots.includes(action.slot)) {
        return fail(state, "Choose one of the available lineup slots.");
      }
      team.roster.push({ player: pending.player, price: pending.price, slot: action.slot });
      team.budget -= pending.price;
      next.log.push(`${pending.player.name} placed at ${action.slot} for seat ${action.seat}.`);
      next.turn = nextActor(next, pending.actedFirst);
      next.pendingPlacement = null;
      next.phase = "onTheClock";
      checkComplete(next);
      return { ok: true, state: next };
    }

    case "setSlot": {
      const team = next.teams[action.seat];
      const pick = team.roster.find((p) => p.player.id === action.playerId);
      if (!pick) return fail(state, "That player isn't on your roster.");
      if (!POSITIONS.includes(action.slot)) return fail(state, "Unknown position slot.");
      if (action.slot === pick.slot) return { ok: true, state: next };

      const occupant = team.roster.find((p) => p.slot === action.slot && p.player.id !== action.playerId);
      const oldSlot = pick.slot;
      team.roster = team.roster.map((p) => {
        if (p.player.id === action.playerId) return { ...p, slot: action.slot };
        if (occupant && p.player.id === occupant.player.id) return { ...p, slot: oldSlot };
        return p;
      });
      return { ok: true, state: next };
    }

    default:
      return fail(state, "Unknown action.");
  }
}
