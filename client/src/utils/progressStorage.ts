import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_IDS,
  competitionForPoolVersion,
  competitionForSport,
  type AchievementId,
  type AchievementUnlock,
  type AiDifficulty,
  type Competition,
  type Sport,
} from "@fiveaside/shared/core";

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
  competition?: Competition;
  poolVersion?: string;
  mode: ProgressMode;
  result: "win" | "loss" | "tie" | "neutral";
  scoreFor: number;
  scoreAgainst: number;
  lineup: string[];
  opponentLineup: string[];
  targetScore?: number;
  targetBeaten?: boolean;
  completionReason?: "score" | "forfeit";
  budgetLeft?: number;
  skipsUsed?: number;
  maxPickPrice?: number;
  allPositionsValid?: boolean;
  purchases?: ProgressPurchase[];
}

export interface ProgressPurchase {
  playerKey: string;
  playerName: string;
  price: number;
}

export interface PlayerPurchaseStat {
  playerKey: string;
  playerName: string;
  purchases: number;
  totalSpent: number;
  highestPrice: number;
}

export interface DraftStats {
  totalPicks: number;
  totalSpent: number;
  players: PlayerPurchaseStat[];
}

export interface SportProgress {
  overall: ProgressRecord;
  modes: Partial<Record<ProgressMode, ProgressRecord>>;
  currentWinStreak: number;
  bestScore: number | null;
  draftStats: DraftStats;
}

export interface ProgressState {
  version: 1;
  sports: Record<Sport, SportProgress>;
  recent: ProgressHistoryEntry[];
  recordedMatchIds: string[];
  migratedLegacy: boolean;
  achievements: AchievementUnlock[];
}

export const PROGRESS_KEY = "your-five:progress:v1";
export const PROGRESS_CHANGED_EVENT = "your-five:progress-changed";
export const ACHIEVEMENT_UNLOCKED_EVENT = "your-five:achievement-unlocked";
const MAX_RECENT = 10;
const MAX_RECORDED_IDS = 100;
const MAX_PLAYER_STATS = 2_000;
const DIFFICULTIES: AiDifficulty[] = ["casual", "competitive", "expert"];
const PROGRESS_MODES: ProgressMode[] = [
  "ai-casual",
  "ai-competitive",
  "ai-expert",
  "daily",
  "online-random",
  "online-private",
  "challenge",
  "local",
];

const emptyRecord = (): ProgressRecord => ({ wins: 0, losses: 0, ties: 0 });
const emptyDraftStats = (): DraftStats => ({ totalPicks: 0, totalSpent: 0, players: [] });
const emptySport = (): SportProgress => ({
  overall: emptyRecord(),
  modes: {},
  currentWinStreak: 0,
  bestScore: null,
  draftStats: emptyDraftStats(),
});

export function emptyProgress(): ProgressState {
  return {
    version: 1,
    sports: { basketball: emptySport(), soccer: emptySport() },
    recent: [],
    recordedMatchIds: [],
    migratedLegacy: false,
    achievements: [],
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

function sanitizeModes(value: unknown): Partial<Record<ProgressMode, ProgressRecord>> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(
    Object.entries(value).map(([mode, record]) => [mode, sanitizeRecord(record)])
  ) as Partial<Record<ProgressMode, ProgressRecord>>;
}

function boundedInteger(value: unknown, maximum = 1_000_000): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(0, Math.floor(number))) : 0;
}

function sanitizeText(value: unknown, maximum = 100): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function sanitizePurchase(value: unknown): ProgressPurchase | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<ProgressPurchase>;
  const playerKey = sanitizeText(raw.playerKey);
  const playerName = sanitizeText(raw.playerName);
  if (!playerKey || !playerName) return null;
  return { playerKey, playerName, price: boundedInteger(raw.price, 20) };
}

function sanitizePlayerPurchaseStat(value: unknown): PlayerPurchaseStat | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<PlayerPurchaseStat>;
  const playerKey = sanitizeText(raw.playerKey);
  const playerName = sanitizeText(raw.playerName);
  if (!playerKey || !playerName) return null;
  return {
    playerKey,
    playerName,
    purchases: boundedInteger(raw.purchases),
    totalSpent: boundedInteger(raw.totalSpent),
    highestPrice: boundedInteger(raw.highestPrice, 20),
  };
}

function sanitizeDraftStats(value: unknown): DraftStats {
  if (typeof value !== "object" || value === null) return emptyDraftStats();
  const raw = value as Partial<DraftStats>;
  const players = Array.isArray(raw.players)
    ? raw.players.map(sanitizePlayerPurchaseStat).filter((entry): entry is PlayerPurchaseStat => entry !== null).slice(0, MAX_PLAYER_STATS)
    : [];
  return {
    totalPicks: boundedInteger(raw.totalPicks),
    totalSpent: boundedInteger(raw.totalSpent),
    players,
  };
}

function sanitizeHistoryEntry(value: unknown): ProgressHistoryEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<ProgressHistoryEntry>;
  if (raw.sport !== "basketball" && raw.sport !== "soccer") return null;
  const matchId = sanitizeText(raw.matchId);
  const completedAt = typeof raw.completedAt === "string" ? new Date(raw.completedAt) : null;
  const mode = PROGRESS_MODES.includes(raw.mode as ProgressMode) ? raw.mode as ProgressMode : null;
  if (!matchId || !completedAt || !Number.isFinite(completedAt.getTime()) || !mode) return null;
  const poolVersion = sanitizeText(raw.poolVersion) || undefined;
  const competition = competitionForPoolVersion(raw.sport, poolVersion)
    ?? competitionForSport(raw.sport, raw.competition);
  const result = raw.result === "win" || raw.result === "loss" || raw.result === "tie" || raw.result === "neutral"
    ? raw.result
    : "neutral";
  return {
    ...raw,
    matchId,
    completedAt: completedAt.toISOString(),
    sport: raw.sport,
    competition,
    poolVersion,
    mode,
    result,
    scoreFor: Number.isFinite(Number(raw.scoreFor)) ? Number(raw.scoreFor) : 0,
    scoreAgainst: Number.isFinite(Number(raw.scoreAgainst)) ? Number(raw.scoreAgainst) : 0,
    lineup: Array.isArray(raw.lineup) ? raw.lineup.map((name) => sanitizeText(name)).filter(Boolean).slice(0, 5) : [],
    opponentLineup: Array.isArray(raw.opponentLineup) ? raw.opponentLineup.map((name) => sanitizeText(name)).filter(Boolean).slice(0, 5) : [],
    purchases: Array.isArray(raw.purchases)
      ? raw.purchases.map(sanitizePurchase).filter((entry): entry is ProgressPurchase => entry !== null).slice(0, 5)
      : undefined,
  };
}

function sanitizeSportProgress(value: unknown): SportProgress {
  const raw = typeof value === "object" && value !== null ? value as Partial<SportProgress> : {};
  const bestScore = Number(raw.bestScore);
  return {
    overall: sanitizeRecord(raw.overall),
    modes: sanitizeModes(raw.modes),
    currentWinStreak: Math.max(0, Math.floor(Number(raw.currentWinStreak) || 0)),
    bestScore: Number.isFinite(bestScore) && bestScore > 0 ? bestScore : null,
    draftStats: sanitizeDraftStats(raw.draftStats),
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

function modeTotal(progress: ProgressState, sport: Sport, mode: ProgressMode): number {
  const record = progress.sports[sport].modes[mode];
  return record ? record.wins + record.losses + record.ties : 0;
}

function totalDrafts(progress: ProgressState): number {
  return (["basketball", "soccer"] as const).reduce((sum, sport) => {
    const record = progress.sports[sport].overall;
    return sum + record.wins + record.losses + record.ties;
  }, 0);
}

function onlineDrafts(progress: ProgressState): number {
  return (["basketball", "soccer"] as const).reduce(
    (sum, sport) => sum + modeTotal(progress, sport, "online-random") + modeTotal(progress, sport, "online-private"),
    0
  );
}

function sanitizeAchievements(value: unknown): AchievementUnlock[] {
  if (!Array.isArray(value)) return [];
  const validIds = new Set<string>(ACHIEVEMENT_IDS);
  const entries = value.flatMap((candidate): AchievementUnlock[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<AchievementUnlock>;
    const date = typeof raw.unlockedAt === "string" ? new Date(raw.unlockedAt) : null;
    if (!raw.id || !validIds.has(raw.id) || !date || !Number.isFinite(date.getTime())) return [];
    return [{
      id: raw.id,
      unlockedAt: date.toISOString(),
      matchId: typeof raw.matchId === "string" ? raw.matchId.slice(0, 100) : undefined,
    }];
  });
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}

function eventUnlocks(entry: ProgressHistoryEntry): AchievementId[] {
  if (entry.mode === "local" || entry.result === "neutral" || entry.completionReason === "forfeit") return [];
  const won = entry.result === "win";
  const margin = entry.scoreFor - entry.scoreAgainst;
  return [
    entry.allPositionsValid === true ? "perfect-fit" : null,
    won && (entry.budgetLeft ?? -1) >= 5 ? "cap-manager" : null,
    won && entry.skipsUsed === 0 ? "no-thanks" : null,
    won && (entry.maxPickPrice ?? Number.POSITIVE_INFINITY) <= 4 ? "value-five" : null,
    entry.budgetLeft === 0 ? "full-budget" : null,
    won && margin > 0 && margin < 1 ? "photo-finish" : null,
    won && margin >= 10 ? "statement-win" : null,
    entry.targetBeaten === true ? "challenge-accepted" : null,
  ].filter((id): id is AchievementId => id !== null);
}

function aggregateUnlocks(progress: ProgressState): AchievementId[] {
  const drafts = totalDrafts(progress);
  const maxStreak = Math.max(progress.sports.basketball.currentWinStreak, progress.sports.soccer.currentWinStreak);
  const maxScore = Math.max(progress.sports.basketball.bestScore ?? 0, progress.sports.soccer.bestScore ?? 0);
  const dailyDrafts = (["basketball", "soccer"] as const).reduce((sum, sport) => sum + modeTotal(progress, sport, "daily"), 0);
  return [
    drafts >= 1 ? "first-five" : null,
    drafts >= 10 ? "getting-the-hang" : null,
    drafts >= 50 ? "front-office-veteran" : null,
    progress.sports.basketball.overall.wins > 0 && progress.sports.soccer.overall.wins > 0 ? "both-sides" : null,
    dailyDrafts >= 7 ? "daily-routine" : null,
    (["basketball", "soccer"] as const).some((sport) => (progress.sports[sport].modes["ai-expert"]?.wins ?? 0) > 0) ? "against-the-odds" : null,
    onlineDrafts(progress) >= 1 ? "online-debut" : null,
    (["basketball", "soccer"] as const).some((sport) => (progress.sports[sport].modes["online-random"]?.wins ?? 0) > 0) ? "road-winner" : null,
    maxStreak >= 3 ? "hot-hand" : null,
    maxStreak >= 10 ? "dynasty" : null,
    maxScore >= 90 ? "ninety-club" : null,
    (progress.sports.basketball.bestScore ?? 0) >= 80 && (progress.sports.soccer.bestScore ?? 0) >= 80 ? "two-sport-star" : null,
  ].filter((id): id is AchievementId => id !== null);
}

export function unlockAchievements(progress: ProgressState, entry?: ProgressHistoryEntry): AchievementId[] {
  const existing = new Set(progress.achievements.map((achievement) => achievement.id));
  const candidates = [...aggregateUnlocks(progress), ...progress.recent.flatMap(eventUnlocks), ...(entry ? eventUnlocks(entry) : [])];
  const unlockedAt = entry?.completedAt ?? new Date().toISOString();
  const newlyUnlocked = [...new Set(candidates)].filter((id) => !existing.has(id));
  for (const id of newlyUnlocked) {
    progress.achievements.push({ id, unlockedAt, matchId: entry?.matchId });
  }
  return newlyUnlocked;
}

export function achievementProgress(progress: ProgressState, id: AchievementId): { current: number; target: number; label: string } {
  const earned = progress.achievements.some((achievement) => achievement.id === id);
  const drafts = totalDrafts(progress);
  const maxStreak = Math.max(progress.sports.basketball.currentWinStreak, progress.sports.soccer.currentWinStreak);
  const maxScore = Math.max(progress.sports.basketball.bestScore ?? 0, progress.sports.soccer.bestScore ?? 0);
  const dailyDrafts = (["basketball", "soccer"] as const).reduce((sum, sport) => sum + modeTotal(progress, sport, "daily"), 0);
  const numeric: Partial<Record<AchievementId, [number, number]>> = {
    "first-five": [drafts, 1],
    "getting-the-hang": [drafts, 10],
    "front-office-veteran": [drafts, 50],
    "both-sides": [Number(progress.sports.basketball.overall.wins > 0) + Number(progress.sports.soccer.overall.wins > 0), 2],
    "daily-routine": [dailyDrafts, 7],
    "online-debut": [onlineDrafts(progress), 1],
    "hot-hand": [maxStreak, 3],
    dynasty: [maxStreak, 10],
    "ninety-club": [maxScore, 90],
    "two-sport-star": [Number((progress.sports.basketball.bestScore ?? 0) >= 80) + Number((progress.sports.soccer.bestScore ?? 0) >= 80), 2],
  };
  const [current, target] = numeric[id] ?? [earned ? 1 : 0, 1];
  const bounded = Math.min(current, target);
  const label = id === "ninety-club" ? `${bounded.toFixed(1)} / ${target}` : `${bounded} / ${target}`;
  return { current: bounded, target, label };
}

export function achievementDefinition(id: AchievementId) {
  return ACHIEVEMENT_DEFINITIONS.find((achievement) => achievement.id === id);
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
          basketball: sanitizeSportProgress(parsed.sports?.basketball),
          soccer: sanitizeSportProgress(parsed.sports?.soccer),
        },
        recent: Array.isArray(parsed.recent)
          ? parsed.recent.map(sanitizeHistoryEntry).filter((entry): entry is ProgressHistoryEntry => entry !== null).slice(0, MAX_RECENT)
          : [],
        recordedMatchIds: Array.isArray(parsed.recordedMatchIds) ? parsed.recordedMatchIds.slice(-MAX_RECORDED_IDS) : [],
        achievements: sanitizeAchievements(parsed.achievements),
      };
    }
  } catch {
    progress = emptyProgress();
  }
  const migrated = migrateLegacy(progress, store);
  unlockAchievements(migrated);
  try {
    store?.setItem(PROGRESS_KEY, JSON.stringify(migrated));
  } catch {
    // Progress remains usable for this render when storage is disabled.
  }
  return migrated;
}

export function progressRecordFor(sport: Sport, mode: ProgressMode, storage?: Storage): ProgressRecord {
  return { ...(loadProgress(storage).sports[sport].modes?.[mode] ?? emptyRecord()) };
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
