import { AiDifficulty, FootballCompetition, MatchState, SeatId, Sport, teamScore } from "@fiveaside/shared/core";

export interface AiRecord {
  wins: number;
  losses: number;
  ties: number;
}

export const EMPTY_AI_RECORD: AiRecord = { wins: 0, losses: 0, ties: 0 };
export const AI_DIFFICULTY_KEY = "your-five:ai-difficulty";

const dailyNamespace = (sport: Sport, competition?: FootballCompetition) => sport === "soccer" && competition ? `${sport}:${competition}` : sport;
export const dailyBestScoreKey = (sport: Sport, competition?: FootballCompetition) => `your-five:daily-best-score:${dailyNamespace(sport, competition)}`;
export const dailyCompletedKey = (sport: Sport, date: string, competition?: FootballCompetition) => `your-five:daily-completed:${dailyNamespace(sport, competition)}:${date}`;
export const aiRecordKey = (sport: Sport, difficulty: AiDifficulty) => `your-five:ai-record:${sport}:${difficulty}`;

function localStore(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadAiDifficulty(storage?: Storage): AiDifficulty {
  try {
    const value = localStore(storage)?.getItem(AI_DIFFICULTY_KEY);
    return value === "casual" || value === "expert" ? value : "competitive";
  } catch {
    return "competitive";
  }
}

export function saveAiDifficulty(difficulty: AiDifficulty, storage?: Storage): void {
  try {
    localStore(storage)?.setItem(AI_DIFFICULTY_KEY, difficulty);
  } catch {
    // The preference remains in React state when storage is unavailable.
  }
}

export function loadAiRecord(sport: Sport, difficulty: AiDifficulty, storage?: Storage): AiRecord {
  try {
    const raw = localStore(storage)?.getItem(aiRecordKey(sport, difficulty));
    if (!raw) return { ...EMPTY_AI_RECORD };
    const parsed = JSON.parse(raw) as Partial<AiRecord>;
    return {
      wins: Math.max(0, Math.floor(Number(parsed.wins) || 0)),
      losses: Math.max(0, Math.floor(Number(parsed.losses) || 0)),
      ties: Math.max(0, Math.floor(Number(parsed.ties) || 0)),
    };
  } catch {
    return { ...EMPTY_AI_RECORD };
  }
}

export function recordAiResult(
  sport: Sport,
  difficulty: AiDifficulty,
  winner: SeatId | "tie" | null,
  humanSeat: SeatId = "A",
  storage?: Storage
): AiRecord {
  const next = loadAiRecord(sport, difficulty, storage);
  if (winner === "tie") next.ties++;
  else if (winner === humanSeat) next.wins++;
  else if (winner) next.losses++;
  try {
    localStore(storage)?.setItem(aiRecordKey(sport, difficulty), JSON.stringify(next));
  } catch {
    // The current result still remains available in memory.
  }
  return next;
}

export function loadDailyCompleted(sport: Sport, date: string, storage?: Storage, competition?: FootballCompetition): MatchState | null {
  try {
    const store = localStore(storage);
    const raw = store?.getItem(dailyCompletedKey(sport, date, competition))
      ?? (competition === "uefa-all-time" ? store?.getItem(dailyCompletedKey(sport, date)) : null);
    return raw ? (JSON.parse(raw) as MatchState) : null;
  } catch {
    return null;
  }
}

export function loadDailyBestScore(sport: Sport, storage?: Storage, competition?: FootballCompetition): number | null {
  try {
    const store = localStore(storage);
    const raw = store?.getItem(dailyBestScoreKey(sport, competition))
      ?? (competition === "uefa-all-time" ? store?.getItem(dailyBestScoreKey(sport)) : null);
    if (!raw) return null;
    const score = Number(raw);
    return Number.isFinite(score) ? score : null;
  } catch {
    return null;
  }
}

export function saveDailyResult(
  sport: Sport,
  date: string,
  state: MatchState,
  humanSeat: SeatId = "A",
  storage?: Storage,
  competition?: FootballCompetition
): number {
  const store = localStore(storage);
  const score = teamScore(state.teams[humanSeat], state.sport);
  try {
    const resolved = competition ?? state.competition;
    store?.setItem(dailyCompletedKey(sport, date, resolved), JSON.stringify(state));
    const best = loadDailyBestScore(sport, storage, resolved);
    if (best === null || score > best) store?.setItem(dailyBestScoreKey(sport, resolved), String(score));
  } catch {
    // Daily persistence is optional when browser storage is unavailable.
  }
  return Math.max(score, loadDailyBestScore(sport, storage, competition ?? state.competition) ?? score);
}
