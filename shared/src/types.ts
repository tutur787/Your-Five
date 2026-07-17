export type Sport = "basketball" | "soccer";

export type AiDifficulty = "casual" | "competitive" | "expert";

export interface AiDecisionContext {
  difficulty: AiDifficulty;
  sessionSeed: string;
  /** Cards whose identities have already been shown to both players. */
  seenPlayerIds: readonly string[];
  /** Public sport database supplied by the selected runtime; never the hidden match pool. */
  candidateDatabase?: readonly PlayerCard[];
}

export type Position = "PG" | "SG" | "SF" | "PF" | "C";
export const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

export type SoccerRole = "GK" | "DEF" | "MID" | "ATT";
export const SOCCER_ROLES: SoccerRole[] = ["GK", "DEF", "MID", "ATT"];
export type SoccerSlot = "GK" | "DEF" | "MID" | "ATT_L" | "ATT_R";
export const SOCCER_SLOTS: SoccerSlot[] = ["GK", "DEF", "MID", "ATT_L", "ATT_R"];
/** Accepted while in-progress rooms from the previous two-defender formation migrate. */
export type LegacySoccerSlot = "DEF_L" | "DEF_R" | "ATT";
export type LineupSlot = Position | SoccerSlot | LegacySoccerSlot;

export interface PlayerStats {
  ppg: number;
  rpg: number;
  apg: number;
  /** Steals per game. Undefined pre-1973-74 — the NBA didn't track steals before then. */
  spg?: number;
  /** Blocks per game. Undefined pre-1973-74 — the NBA didn't track blocks before then. */
  bpg?: number;
  /** Real average box plus-minus for the era range. Undefined pre-~1996-97 (no play-by-play tracking). */
  plusMinus?: number;
  /** This player's Defensive Rating vs. that season's league average, precomputed so positive always means better-than-average defense. Undefined pre-~1996-97. */
  defRtgVsAvg?: number;
}

/** Counts of major awards earned specifically during this card's era range (not the player's whole career). */
export interface PlayerAccolades {
  mvp?: number;
  champion?: number;
  allNba?: number;
  dpoy?: number;
  allDefense?: number;
}

export interface BasketballPlayerCard {
  sport: "basketball";
  id: string;
  name: string;
  position: Position;
  /** A second position this player is commonly also listed at (e.g. Curry is PG/SG). Not every player has one. */
  secondaryPosition?: Position;
  /** A third position, for genuinely multi-positional players (e.g. LeBron has real career stat lines crossing into PG-level playmaking and PF-level rebounding). Rare — most cards have zero or one extra position. */
  tertiaryPosition?: Position;
  era: string;
  stats: PlayerStats;
  /** Hand-curated, not every card has one — undefined means no notable accolades in this era range. */
  accolades?: PlayerAccolades;
  /** This card's team win% across its season range (games-played-weighted if traded). Essentially always available. */
  teamWinPct?: number;
  /** Multiplier applied only to the *scoring* formula (never to the real stats shown in the UI) to offset pace/scoring differences between eras. Defaults to 1 (no adjustment) when absent. */
  eraFactor?: number;
  /** IDs of real-life teammates within this match pool, attached when the pool is built. */
  chemistryWith?: string[];
}

export interface SoccerStats {
  minutes: number;
  appearances: number;
  goalsPer90: number;
  assistsPer90: number;
  shotsOnTargetPer90: number;
  shotAccuracyPct: number;
  cleanSheetPct: number;
  goalsConcededPerMatch: number;
  /** Omitted when UEFA shot-on-target tracking covers less than 70% of the card window. */
  savePct?: number;
  pointsPerMatch: number;
  goalDifferencePerMatch: number;
  /** Optional UEFA metrics are emitted only when at least 70% of this card's minutes tracked them. */
  nonPenaltyGoalsPer90?: number;
  tacklesWonPer90?: number;
  recoveriesPer90?: number;
  clearancesPer90?: number;
  passCompletionPct?: number;
  progressiveDeliveriesPer90?: number;
  dribblesPer90?: number;
  claimsPer90?: number;
}

export interface SoccerPerformance {
  attack: number;
  creation: number;
  control: number;
  defense: number;
  goalkeeping: number;
  /** Edition-only, role-weighted performance before sparse-data adjustment. */
  observedScore?: number;
  /** Verified repeat UEFA-selection career prior for this role. Awards are scored separately. */
  pedigreeScore?: number;
  /** How much of the adjusted performance comes from the observed edition, from 0 to 1. */
  dataConfidence?: number;
  /** Legacy rating used by rooms created before honors became an explicit score component. */
  achievementScore?: number;
  /** Final per-card quality used by lineup scoring. */
  roleScore: number;
}

export interface SoccerHonors {
  champion?: boolean;
  /** Human-readable competition(s) won in this card's exact scoring window. */
  championLabel?: string;
  /** UEFA's top overall player award for this card's exact year or season. */
  bestPlayer?: boolean;
  bestPlayerLabel?: string;
  ballonDor?: boolean;
  ballonDorLabel?: string;
  topScorer?: boolean;
  topScorerLabel?: string;
  positionalAward?: boolean;
  positionalAwardLabel?: string;
  youngPlayer?: boolean;
  youngPlayerLabel?: string;
  /** Legacy combined field retained for persisted rooms generated before the honor expansion. */
  topScorerOrKeeper?: boolean;
  topScorerOrKeeperLabel?: string;
}

export interface SoccerPlayerCard {
  sport: "soccer";
  id: string;
  sourcePlayerId: string;
  /** All UEFA provider IDs verified as the same canonical player record. */
  sourcePlayerIds: string[];
  /** Stable canonical-name and birth-date identity used to prevent duplicate eras in one pool. */
  sourceIdentity: string;
  name: string;
  role: SoccerRole;
  secondaryRole?: SoccerRole;
  tertiaryRole?: SoccerRole;
  era: string;
  team: string;
  /** Official UEFA team IDs represented by this card during its scoring window. */
  sourceTeamIds: string[];
  edition: string;
  editionKind: "calendar" | "season";
  stats: SoccerStats;
  performance: SoccerPerformance;
  teamSuccess: number;
  honors?: SoccerHonors;
  sourcePositionLabels: string[];
  sourceRevision: string;
}

export type PlayerCard = BasketballPlayerCard | SoccerPlayerCard;

export type SeatId = "A" | "B";

export interface RosterPick {
  player: PlayerCard;
  price: number;
  /** Position slot the GM has assigned this player to. */
  slot: LineupSlot;
}

export interface TeamState {
  seat: SeatId;
  budget: number;
  roster: RosterPick[];
  /** Number consumed from the free, $1, $5, $10 skip ladder. */
  skipsUsed: number;
  /** Legacy fields accepted while persisted rooms migrate to skipsUsed. */
  skipUsed?: boolean;
  paidSkipUsed?: boolean;
  /** Legacy catch-up flag retained while persisted rooms migrate to the full skip ladder. */
  catchUpSkipUsed: boolean;
}

export type DraftPhase =
  | "onTheClock" // a random player has been revealed; current seat must open a bid or skip
  | "bidding" // an active auction is in progress on the revealed player
  | "skipOffer" // a skip was used, the other seat must accept-for-$1 or pass
  | "catchUp" // one roster is full; the other seat takes $1 cards or spends its remaining skips
  | "placing" // a won player is waiting to be assigned to an open lineup slot
  | "complete"; // both rosters full

export interface ActiveAuction {
  player: PlayerCard;
  currentBid: number;
  /** seat currently standing to win the player if the other side accepts */
  standingBidder: SeatId;
  /** seat whose turn it is to respond (raise or accept) */
  turn: SeatId;
}

export interface ActiveSkipOffer {
  player: PlayerCard;
  skippedBy: SeatId;
  /** seat who must respond: accept for $1, or pass (free, no cost to them) */
  respondingSeat: SeatId;
}

export interface PendingPlacement {
  player: PlayerCard;
  price: number;
  seat: SeatId;
  actedFirst: SeatId;
  /** Returns to the one-player catch-up flow after placement instead of starting another auction. */
  catchUp: boolean;
}

export const ROSTER_SIZE = 5;
export const STARTING_BUDGET = 20;

export interface MatchState {
  sport: Sport;
  /** Stable identity used to record a completed match exactly once on a device. */
  matchId?: string;
  /** Seed that reproduces the initial reveal pool for shareable challenges. */
  poolSeed?: string;
  /** Version of the sport database/pool rules used with poolSeed. */
  poolVersion?: string;
  pool: PlayerCard[]; // remaining players yet to be revealed, in reveal order
  teams: Record<SeatId, TeamState>;
  turn: SeatId; // whose turn it is to act first on the next revealed player
  phase: DraftPhase;
  auction: ActiveAuction | null;
  skipOffer: ActiveSkipOffer | null;
  pendingPlacement: PendingPlacement | null;
  log: string[];
  /** Set once phase becomes "complete": whichever team has the higher combined stat total, or "tie". */
  winner: SeatId | "tie" | null;
  /** Missing on legacy completed rooms, where it is treated as a normal score result. */
  completionReason?: "score" | "forfeit";
  forfeitedSeat?: SeatId;
}

export type MatchAction =
  | { type: "openBid"; seat: SeatId; startBid: number }
  | { type: "raiseBid"; seat: SeatId; amount: number }
  | { type: "acceptBid"; seat: SeatId }
  | { type: "useSkip"; seat: SeatId }
  | { type: "buySkip"; seat: SeatId }
  | { type: "takeForOne"; seat: SeatId }
  | { type: "respondToSkip"; seat: SeatId; accept: boolean }
  | { type: "placePick"; seat: SeatId; slot: LineupSlot }
  | { type: "setSlot"; seat: SeatId; playerId: string; slot: LineupSlot };

export interface ActionResult {
  ok: boolean;
  error?: string;
  state: MatchState;
}
