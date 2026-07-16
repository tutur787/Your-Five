import { useCallback, useEffect, useRef, useState } from "react";
import {
  actingSeat,
  AiDecisionContext,
  AiDifficulty,
  aiThinkingDelay,
  applyAction,
  applyAiLineupOptimization,
  createMatchWithRuntime,
  decideAiAction,
  MatchAction,
  MatchState,
  PlayerCard,
  SeatId,
  todayUtcDateString,
  SportRuntime,
} from "@fiveaside/shared/core";
import {
  AiRecord,
  loadDailyBestScore,
  loadDailyCompleted,
  saveDailyResult,
} from "../utils/aiStorage";
import { progressRecordFor } from "../utils/progressStorage";
import { recordCompletedMatch } from "../utils/progressRecorder";
import { useSport } from "./useSport";

export const HUMAN_SEAT: SeatId = "A";
export const AI_SEAT: SeatId = "B";
export type AiMatchMode = "daily" | "quick" | "challenge";

function shownPlayer(state: MatchState): PlayerCard | null {
  return state.auction?.player ?? state.skipOffer?.player ?? state.pendingPlacement?.player ?? state.pool[0] ?? null;
}

function quickSeed(sport: string, difficulty: AiDifficulty): string {
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
  return `quick:${sport}:${difficulty}:${randomPart}`;
}

export function useAiMatch({
  mode,
  difficulty,
  sportOverride,
  challengeSeed,
  targetScore,
  runtime,
}: {
  mode: AiMatchMode;
  difficulty: AiDifficulty;
  sportOverride?: "basketball" | "soccer";
  challengeSeed?: string;
  targetScore?: number;
  runtime: SportRuntime;
}) {
  const selected = useSport();
  const sport = sportOverride ?? selected.sport;
  const today = todayUtcDateString();
  const completedAtMount = useRef<MatchState | null | undefined>(undefined);
  if (completedAtMount.current === undefined) {
    completedAtMount.current = mode === "daily" ? loadDailyCompleted(sport, today) : null;
  }

  const makeInitialMatch = () => {
    if (mode === "daily") return createMatchWithRuntime(runtime, `daily:${today}:${sport}`, `daily:${today}:${sport}`);
    if (mode === "challenge" && challengeSeed) return createMatchWithRuntime(runtime, challengeSeed);
    return createMatchWithRuntime(runtime);
  };
  const [state, setState] = useState<MatchState>(() => completedAtMount.current ?? makeInitialMatch());
  const [error, setError] = useState<string | null>(null);
  const [bestScore, setBestScore] = useState<number | null>(() => loadDailyBestScore(sport));
  const [record, setRecord] = useState<AiRecord>(() => progressRecordFor(sport, `ai-${difficulty}`));
  const sessionSeedRef = useRef("");
  if (!sessionSeedRef.current) {
    sessionSeedRef.current = mode === "daily"
      ? `daily:${today}:${sport}:competitive`
      : mode === "challenge"
        ? `challenge:${challengeSeed}:${sport}:competitive`
        : quickSeed(sport, difficulty);
  }
  const seenPlayerIdsRef = useRef<Set<string>>(new Set());
  const resultSavedRef = useRef(mode === "daily" && completedAtMount.current !== null);
  const alreadyPlayedToday = mode === "daily" && completedAtMount.current !== null;

  useEffect(() => {
    const player = shownPlayer(state);
    if (player) seenPlayerIdsRef.current.add(player.id);
  }, [state]);

  const context = useCallback((): AiDecisionContext => ({
    difficulty,
    sessionSeed: sessionSeedRef.current,
    seenPlayerIds: [...seenPlayerIdsRef.current],
    candidateDatabase: runtime.database,
  }), [difficulty, runtime]);

  const dispatch = useCallback((action: MatchAction) => {
    setState((previous) => {
      const result = applyAction(previous, action);
      if (!result.ok) {
        setError(result.error ?? "Invalid action");
        return previous;
      }
      setError(null);
      return result.state;
    });
  }, []);

  useEffect(() => {
    if (actingSeat(state) !== AI_SEAT) return;
    const delay = aiThinkingDelay(state, AI_SEAT, context());
    const timer = window.setTimeout(() => {
      setState((previous) => {
        if (actingSeat(previous) !== AI_SEAT) return previous;
        const action = decideAiAction(previous, AI_SEAT, context());
        const result = applyAction(previous, action);
        if (!result.ok) {
          setError(result.error ?? "The AI could not complete its move");
          return previous;
        }
        setError(null);
        return action.type === "placePick" ? applyAiLineupOptimization(result.state, AI_SEAT) : result.state;
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state, context]);

  useEffect(() => {
    if (state.phase !== "complete" || resultSavedRef.current) return;
    resultSavedRef.current = true;
    if (mode === "daily") {
      setBestScore(saveDailyResult(sport, today, state, HUMAN_SEAT));
      recordCompletedMatch(state, "daily", HUMAN_SEAT);
    } else if (mode === "quick") {
      recordCompletedMatch(state, `ai-${difficulty}`, HUMAN_SEAT);
      setRecord(progressRecordFor(sport, `ai-${difficulty}`));
    } else {
      recordCompletedMatch(state, "challenge", HUMAN_SEAT, { targetScore });
    }
  }, [state, mode, sport, today, difficulty, targetScore]);

  const reset = useCallback(() => {
    if (mode === "daily") return;
    sessionSeedRef.current = mode === "challenge"
      ? `challenge:${challengeSeed}:${sport}:competitive:${crypto.randomUUID()}`
      : quickSeed(sport, difficulty);
    seenPlayerIdsRef.current = new Set();
    resultSavedRef.current = false;
    setError(null);
    setState(mode === "challenge" && challengeSeed
      ? createMatchWithRuntime(runtime, challengeSeed)
      : createMatchWithRuntime(runtime));
  }, [mode, sport, difficulty, challengeSeed, runtime]);

  return {
    state,
    dispatch,
    error,
    reset,
    humanSeat: HUMAN_SEAT,
    aiSeat: AI_SEAT,
    today,
    bestScore,
    record,
    alreadyPlayedToday,
  };
}
