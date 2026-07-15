import { useCallback, useEffect, useRef, useState } from "react";
import {
  actingSeat,
  applyAction,
  createMatch,
  dailyRng,
  decideAiAction,
  MatchAction,
  MatchState,
  SeatId,
  teamScore,
  todayUtcDateString,
} from "@fiveaside/shared";

export const HUMAN_SEAT: SeatId = "A";
export const AI_SEAT: SeatId = "B";
const AI_THINK_DELAY_MS = 900;
const BEST_SCORE_KEY = "fiveaside-daily-best-score";
const completedKey = (date: string) => `fiveaside-daily-completed:${date}`;

function loadCompletedState(date: string): MatchState | null {
  try {
    const raw = localStorage.getItem(completedKey(date));
    return raw ? (JSON.parse(raw) as MatchState) : null;
  } catch {
    return null;
  }
}

function loadBestScore(): number | null {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function saveCompletedState(date: string, state: MatchState) {
  try {
    localStorage.setItem(completedKey(date), JSON.stringify(state));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — the result just won't persist.
  }
  const score = teamScore(state.teams[HUMAN_SEAT]);
  const best = loadBestScore();
  if (best === null || score > best) {
    try {
      localStorage.setItem(BEST_SCORE_KEY, String(score));
    } catch {
      // localStorage unavailable (private browsing, quota, etc.) — the best score just won't persist.
    }
  }
}

export function useDailyMatch() {
  const today = todayUtcDateString();
  const [state, setState] = useState<MatchState>(() => loadCompletedState(today) ?? createMatch(dailyRng(today)));
  const [error, setError] = useState<string | null>(null);
  const alreadyPlayedToday = useRef(loadCompletedState(today) !== null);
  const savedRef = useRef(alreadyPlayedToday.current);

  const dispatch = useCallback((action: MatchAction) => {
    setState((prev) => {
      const res = applyAction(prev, action);
      if (!res.ok) {
        setError(res.error ?? "Invalid action");
        return prev;
      }
      setError(null);
      return res.state;
    });
  }, []);

  // The AI plays its own turn automatically after a short "thinking" delay.
  useEffect(() => {
    if (actingSeat(state) !== AI_SEAT) return;
    const timer = setTimeout(() => {
      dispatch(decideAiAction(state, AI_SEAT));
    }, AI_THINK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state, dispatch]);

  // Record today's result the first time this draft completes.
  useEffect(() => {
    if (state.phase === "complete" && !savedRef.current) {
      savedRef.current = true;
      saveCompletedState(today, state);
    }
  }, [state, today]);

  return {
    state,
    dispatch,
    error,
    humanSeat: HUMAN_SEAT,
    aiSeat: AI_SEAT,
    today,
    bestScore: loadBestScore(),
    alreadyPlayedToday: alreadyPlayedToday.current,
  };
}
