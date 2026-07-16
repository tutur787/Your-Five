import { useCallback, useEffect, useRef, useState } from "react";
import {
  actingSeat,
  AiDecisionContext,
  AiDifficulty,
  aiThinkingDelay,
  applyAction,
  applyAiLineupOptimization,
  createMatch,
  dailyRng,
  decideAiAction,
  MatchAction,
  MatchState,
  PlayerCard,
  SeatId,
  todayUtcDateString,
} from "@fiveaside/shared";
import {
  AiRecord,
  loadAiRecord,
  loadDailyBestScore,
  loadDailyCompleted,
  recordAiResult,
  saveDailyResult,
} from "../utils/aiStorage";
import { useSport } from "./useSport";

export const HUMAN_SEAT: SeatId = "A";
export const AI_SEAT: SeatId = "B";
export type AiMatchMode = "daily" | "quick";

function shownPlayer(state: MatchState): PlayerCard | null {
  return state.auction?.player ?? state.skipOffer?.player ?? state.pendingPlacement?.player ?? state.pool[0] ?? null;
}

function quickSeed(sport: string, difficulty: AiDifficulty): string {
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
  return `quick:${sport}:${difficulty}:${randomPart}`;
}

export function useAiMatch({ mode, difficulty }: { mode: AiMatchMode; difficulty: AiDifficulty }) {
  const { sport } = useSport();
  const today = todayUtcDateString();
  const completedAtMount = useRef<MatchState | null | undefined>(undefined);
  if (completedAtMount.current === undefined) {
    completedAtMount.current = mode === "daily" ? loadDailyCompleted(sport, today) : null;
  }

  const [state, setState] = useState<MatchState>(() =>
    completedAtMount.current ?? (mode === "daily" ? createMatch(sport, dailyRng(`${today}:${sport}`)) : createMatch(sport))
  );
  const [error, setError] = useState<string | null>(null);
  const [bestScore, setBestScore] = useState<number | null>(() => loadDailyBestScore(sport));
  const [record, setRecord] = useState<AiRecord>(() => loadAiRecord(sport, difficulty));
  const sessionSeedRef = useRef("");
  if (!sessionSeedRef.current) {
    sessionSeedRef.current = mode === "daily"
      ? `daily:${today}:${sport}:competitive`
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
  }), [difficulty]);

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
    } else {
      setRecord(recordAiResult(sport, difficulty, state.winner, HUMAN_SEAT));
    }
  }, [state, mode, sport, today, difficulty]);

  const reset = useCallback(() => {
    if (mode !== "quick") return;
    sessionSeedRef.current = quickSeed(sport, difficulty);
    seenPlayerIdsRef.current = new Set();
    resultSavedRef.current = false;
    setError(null);
    setState(createMatch(sport));
  }, [mode, sport, difficulty]);

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
