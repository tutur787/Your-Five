import { useEffect } from "react";
import { MatchState, SeatId } from "@fiveaside/shared/core";
import { ProgressMode } from "../utils/progressStorage";
import { recordCompletedMatch } from "../utils/progressRecorder";

export function useRecordProgress(
  state: MatchState | null,
  mode: ProgressMode,
  perspective: SeatId | null,
  targetScore?: number
): void {
  useEffect(() => {
    if (!state || state.phase !== "complete") return;
    recordCompletedMatch(state, mode, perspective, { targetScore });
  }, [state, mode, perspective, targetScore]);
}
