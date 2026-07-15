export type Position = "PG" | "SG" | "SF" | "PF" | "C";
export const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

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

export interface PlayerCard {
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
}

export type SeatId = "A" | "B";

export interface RosterPick {
  player: PlayerCard;
  price: number;
  /** Position slot the GM has assigned this player to. */
  slot: Position;
}

export interface TeamState {
  seat: SeatId;
  budget: number;
  roster: RosterPick[];
  skipUsed: boolean;
  /** Each team may purchase one additional skip for $1 after using its free skip. */
  paidSkipUsed: boolean;
  /** At most one free-or-paid skip may be used after either roster reaches five. */
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
}

export type MatchAction =
  | { type: "openBid"; seat: SeatId; startBid: number }
  | { type: "raiseBid"; seat: SeatId; amount: number }
  | { type: "acceptBid"; seat: SeatId }
  | { type: "useSkip"; seat: SeatId }
  | { type: "buySkip"; seat: SeatId }
  | { type: "takeForOne"; seat: SeatId }
  | { type: "respondToSkip"; seat: SeatId; accept: boolean }
  | { type: "placePick"; seat: SeatId; slot: Position }
  | { type: "setSlot"; seat: SeatId; playerId: string; slot: Position };

export interface ActionResult {
  ok: boolean;
  error?: string;
  state: MatchState;
}
