import {
  competitionForPoolVersion,
  competitionForSport,
  MatchState,
  SeatId,
  teamScore,
  validSlotsFor,
} from "@fiveaside/shared/core";
import {
  DraftStats,
  loadProgress,
  ProgressHistoryEntry,
  ProgressMode,
  ProgressPurchase,
  ProgressRecord,
  ProgressState,
  ACHIEVEMENT_UNLOCKED_EVENT,
  saveProgress,
  unlockAchievements,
} from "./progressStorage";

const emptyRecord = (): ProgressRecord => ({ wins: 0, losses: 0, ties: 0 });

function playerKey(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function addPurchases(stats: DraftStats, purchases: ProgressPurchase[]): void {
  const players = new Map(stats.players.map((player) => [player.playerKey, player]));
  for (const purchase of purchases) {
    const existing = players.get(purchase.playerKey);
    if (existing) {
      existing.purchases++;
      existing.totalSpent += purchase.price;
      existing.highestPrice = Math.max(existing.highestPrice, purchase.price);
      existing.playerName = purchase.playerName;
    } else {
      const created = {
        playerKey: purchase.playerKey,
        playerName: purchase.playerName,
        purchases: 1,
        totalSpent: purchase.price,
        highestPrice: purchase.price,
      };
      stats.players.push(created);
      players.set(created.playerKey, created);
    }
    stats.totalPicks++;
    stats.totalSpent += purchase.price;
  }
}

export function recordCompletedMatch(
  state: MatchState,
  mode: ProgressMode,
  perspective: SeatId | null,
  options: { targetScore?: number; storage?: Storage } = {}
): ProgressState {
  const progress = loadProgress(options.storage);
  if (state.phase !== "complete" || !state.matchId || progress.recordedMatchIds.includes(state.matchId)) return progress;

  const scoreA = teamScore(state.teams.A, state.sport);
  const scoreB = teamScore(state.teams.B, state.sport);
  const ownSeat = perspective ?? "A";
  const otherSeat = ownSeat === "A" ? "B" : "A";
  const scoreFor = ownSeat === "A" ? scoreA : scoreB;
  const scoreAgainst = ownSeat === "A" ? scoreB : scoreA;
  const result: ProgressHistoryEntry["result"] = perspective === null
    ? "neutral"
    : state.winner === "tie"
      ? "tie"
      : state.winner === ownSeat
        ? "win"
        : "loss";
  const purchases: ProgressPurchase[] = state.teams[ownSeat].roster.map((pick) => ({
    playerKey: playerKey(pick.player.name),
    playerName: pick.player.name,
    price: pick.price,
  }));

  if (perspective !== null) {
    const sportProgress = progress.sports[state.sport];
    const modeRecord = sportProgress.modes[mode] ?? emptyRecord();
    if (result === "win") {
      modeRecord.wins++;
      sportProgress.overall.wins++;
      sportProgress.currentWinStreak++;
    } else if (result === "loss") {
      modeRecord.losses++;
      sportProgress.overall.losses++;
      sportProgress.currentWinStreak = 0;
    } else {
      modeRecord.ties++;
      sportProgress.overall.ties++;
      sportProgress.currentWinStreak = 0;
    }
    sportProgress.modes[mode] = modeRecord;
    sportProgress.bestScore = Math.max(scoreFor, sportProgress.bestScore ?? Number.NEGATIVE_INFINITY);
    addPurchases(sportProgress.draftStats, purchases);
  }

  const poolVersionCompetition = competitionForPoolVersion(state.sport, state.poolVersion);

  const entry: ProgressHistoryEntry = {
    matchId: state.matchId,
    completedAt: new Date().toISOString(),
    sport: state.sport,
    competition: poolVersionCompetition ?? competitionForSport(state.sport, state.competition),
    poolVersion: state.poolVersion,
    mode,
    result,
    scoreFor,
    scoreAgainst,
    lineup: state.teams[ownSeat].roster.map((pick) => pick.player.name),
    opponentLineup: state.teams[otherSeat].roster.map((pick) => pick.player.name),
    targetScore: options.targetScore,
    targetBeaten: options.targetScore === undefined ? undefined : scoreFor > options.targetScore,
    completionReason: state.completionReason ?? "score",
    budgetLeft: state.teams[ownSeat].budget,
    skipsUsed: state.teams[ownSeat].skipsUsed,
    maxPickPrice: Math.max(0, ...state.teams[ownSeat].roster.map((pick) => pick.price)),
    allPositionsValid: state.teams[ownSeat].roster.length === 5
      && state.teams[ownSeat].roster.every((pick) => validSlotsFor(pick.player).includes(pick.slot)),
    purchases: perspective === null ? undefined : purchases,
  };
  progress.recent = [entry, ...progress.recent];
  progress.recordedMatchIds = [...progress.recordedMatchIds, state.matchId];
  const newlyUnlocked = unlockAchievements(progress, entry);
  saveProgress(progress, options.storage);
  if (newlyUnlocked.length > 0 && options.storage === undefined && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ACHIEVEMENT_UNLOCKED_EVENT, { detail: newlyUnlocked }));
  }
  return progress;
}
