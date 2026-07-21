import { MatchState, SeatId, teamScore, validSlotsFor } from "@fiveaside/shared/core";
import {
  loadProgress,
  ProgressHistoryEntry,
  ProgressMode,
  ProgressRecord,
  ProgressState,
  ACHIEVEMENT_UNLOCKED_EVENT,
  saveProgress,
  unlockAchievements,
} from "./progressStorage";

const emptyRecord = (): ProgressRecord => ({ wins: 0, losses: 0, ties: 0 });

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
  }

  const entry: ProgressHistoryEntry = {
    matchId: state.matchId,
    completedAt: new Date().toISOString(),
    sport: state.sport,
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
