import { MatchState, SeatId, teamScore } from "@fiveaside/shared/core";
import {
  loadProgress,
  ProgressHistoryEntry,
  ProgressMode,
  ProgressRecord,
  ProgressState,
  saveProgress,
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

  progress.recent = [{
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
  }, ...progress.recent];
  progress.recordedMatchIds = [...progress.recordedMatchIds, state.matchId];
  saveProgress(progress, options.storage);
  return progress;
}
