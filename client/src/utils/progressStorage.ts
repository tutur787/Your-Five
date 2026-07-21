import type { AiDifficulty, Sport } from "@fiveaside/shared/core";

export type ProgressMode =
  | `ai-${AiDifficulty}`
  | "daily"
  | "online-random"
  | "online-private"
  | "challenge"
  | "local";

export interface ProgressRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface ProgressHistoryEntry {
  matchId: string;
  completedAt: string;
  sport: Sport;
  mode: ProgressMode;
  result: "win" | "loss" | "tie" | "neutral";
  scoreFor: number;
  scoreAgainst: number;
  lineup: string[];
  opponentLineup: string[];
  targetScore?: number;
  targetBeaten?: boolean;
}

interface SportProgress {
  overall: ProgressRecord;
  modes: Partial<Record<ProgressMode, ProgressRecord>>;
  currentWinStreak: number;
  bestScore: number | null;
}

export interface ProgressState {
  version: 1;
  sports: Record<Sport, SportProgress>;
  recent: ProgressHistoryEntry[];
  recordedMatchIds: string[];
  migratedLegacy: boolean;
}

export const PROGRESS_KEY = "your-five:progress:v1";
export const PROGRESS_CHANGED_EVENT = "your-five:progress-changed";
const MAX_RECENT = 10;
const MAX_RECORDED_IDS = 100;
const DIFFICULTIES: AiDifficulty[] = ["casual", "competitive", "expert"];

const emptyRecord = (): ProgressRecord => ({ wins: 0, losses: 0, ties: 0 });
const emptySport = (): SportProgress => ({
  overall: emptyRecord(),
  modes: {},
  currentWinStreak: 0,
  bestScore: null,
});

export function emptyProgress(): ProgressState {
  return {
    version: 1,
    sports: { basketball: emptySport(), soccer: emptySport() },
    recent: [],
    recordedMatchIds: [],
    migratedLegacy: false,
  };
}

function storeFor(storage?: Storage): Storage | null {
  if (storage) return storage;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sanitizeRecord(value: unknown): ProgressRecord {
  const raw = typeof value === "object" && value !== null ? value as Partial<ProgressRecord> : {};
  return {
    wins: Math.max(0, Math.floor(Number(raw.wins) || 0)),
    losses: Math.max(0, Math.floor(Number(raw.losses) || 0)),
    ties: Math.max(0, Math.floor(Number(raw.ties) || 0)),
  };
}

function addRecord(target: ProgressRecord, source: ProgressRecord): void {
  target.wins += source.wins;
  target.losses += source.losses;
  target.ties += source.ties;
}

function migrateLegacy(progress: ProgressState, storage: Storage | null): ProgressState {
  if (progress.migratedLegacy || !storage) return { ...progress, migratedLegacy: true };
  for (const sport of ["basketball", "soccer"] as const) {
    for (const difficulty of DIFFICULTIES) {
      try {
        const raw = storage.getItem(`your-five:ai-record:${sport}:${difficulty}`);
        if (!raw) continue;
        const record = sanitizeRecord(JSON.parse(raw));
        progress.sports[sport].modes[`ai-${difficulty}`] = record;
        addRecord(progress.sports[sport].overall, record);
      } catch {
        // A malformed legacy key should not prevent the rest of the progress panel from loading.
      }
    }
    const best = Number(storage.getItem(`your-five:daily-best-score:${sport}`));
    if (Number.isFinite(best) && best > 0) progress.sports[sport].bestScore = best;
  }
  progress.migratedLegacy = true;
  return progress;
}

export function loadProgress(storage?: Storage): ProgressState {
  const store = storeFor(storage);
  let progress = emptyProgress();
  try {
    const raw = store?.getItem(PROGRESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ProgressState>;
      progress = {
        ...progress,
        ...parsed,
        version: 1,
        sports: {
          basketball: { ...emptySport(), ...parsed.sports?.basketball, overall: sanitizeRecord(parsed.sports?.basketball?.overall) },
          soccer: { ...emptySport(), ...parsed.sports?.soccer, overall: sanitizeRecord(parsed.sports?.soccer?.overall) },
        },
        recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, MAX_RECENT) : [],
        recordedMatchIds: Array.isArray(parsed.recordedMatchIds) ? parsed.recordedMatchIds.slice(-MAX_RECORDED_IDS) : [],
      };
    }
  } catch {
    progress = emptyProgress();
  }
  const migrated = migrateLegacy(progress, store);
  try {
    store?.setItem(PROGRESS_KEY, JSON.stringify(migrated));
  } catch {
    // Progress remains usable for this render when storage is disabled.
  }
  return migrated;
}

export function progressRecordFor(sport: Sport, mode: ProgressMode, storage?: Storage): ProgressRecord {
  return { ...(loadProgress(storage).sports[sport].modes[mode] ?? emptyRecord()) };
}

export function saveProgress(progress: ProgressState, storage?: Storage, notify = true): void {
  progress.recent = progress.recent.slice(0, MAX_RECENT);
  progress.recordedMatchIds = progress.recordedMatchIds.slice(-MAX_RECORDED_IDS);
  try {
    storeFor(storage)?.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // The current result remains visible in memory when storage is unavailable.
  }
  if (notify && storage === undefined && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROGRESS_CHANGED_EVENT, { detail: progress }));
  }
}
