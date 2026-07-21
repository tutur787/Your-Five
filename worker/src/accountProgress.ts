const SPORTS = ["basketball", "soccer"] as const;
const MODES = [
  "ai-casual",
  "ai-competitive",
  "ai-expert",
  "daily",
  "online-random",
  "online-private",
  "challenge",
  "local",
] as const;

type Sport = typeof SPORTS[number];
type ProgressMode = typeof MODES[number];
type Result = "win" | "loss" | "tie" | "neutral";

interface ProgressRecord {
  wins: number;
  losses: number;
  ties: number;
}

interface HistoryEntry {
  matchId: string;
  completedAt: string;
  sport: Sport;
  mode: ProgressMode;
  result: Result;
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

export interface AccountProgress {
  version: 1;
  sports: Record<Sport, SportProgress>;
  recent: HistoryEntry[];
  recordedMatchIds: string[];
  migratedLegacy: boolean;
}

const MAX_RECENT = 10;
const MAX_RECORDED_IDS = 100;
const MAX_TEXT = 100;

const emptyRecord = (): ProgressRecord => ({ wins: 0, losses: 0, ties: 0 });
const emptySport = (): SportProgress => ({
  overall: emptyRecord(),
  modes: {},
  currentWinStreak: 0,
  bestScore: null,
});

export function emptyAccountProgress(): AccountProgress {
  return {
    version: 1,
    sports: { basketball: emptySport(), soccer: emptySport() },
    recent: [],
    recordedMatchIds: [],
    migratedLegacy: true,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function boundedInteger(value: unknown, maximum = 1_000_000): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(0, Math.floor(number))) : 0;
}

function boundedScore(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1_000, Math.max(-1_000, number)) : 0;
}

function sanitizeRecord(value: unknown): ProgressRecord {
  const raw = objectValue(value);
  return {
    wins: boundedInteger(raw.wins),
    losses: boundedInteger(raw.losses),
    ties: boundedInteger(raw.ties),
  };
}

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "";
}

function sanitizeLineup(value: unknown): string[] {
  return Array.isArray(value) ? value.map(sanitizeText).filter(Boolean).slice(0, 5) : [];
}

function sanitizeHistory(value: unknown): HistoryEntry | null {
  const raw = objectValue(value);
  const matchId = sanitizeText(raw.matchId);
  const sport = SPORTS.includes(raw.sport as Sport) ? raw.sport as Sport : null;
  const mode = MODES.includes(raw.mode as ProgressMode) ? raw.mode as ProgressMode : null;
  const result = ["win", "loss", "tie", "neutral"].includes(String(raw.result)) ? raw.result as Result : null;
  const completed = typeof raw.completedAt === "string" ? new Date(raw.completedAt) : null;
  if (!matchId || !sport || !mode || !result || !completed || !Number.isFinite(completed.getTime())) return null;

  return {
    matchId,
    completedAt: completed.toISOString(),
    sport,
    mode,
    result,
    scoreFor: boundedScore(raw.scoreFor),
    scoreAgainst: boundedScore(raw.scoreAgainst),
    lineup: sanitizeLineup(raw.lineup),
    opponentLineup: sanitizeLineup(raw.opponentLineup),
    targetScore: raw.targetScore === undefined ? undefined : boundedScore(raw.targetScore),
    targetBeaten: typeof raw.targetBeaten === "boolean" ? raw.targetBeaten : undefined,
  };
}

function sanitizeSport(value: unknown): SportProgress {
  const raw = objectValue(value);
  const rawModes = objectValue(raw.modes);
  const modes: Partial<Record<ProgressMode, ProgressRecord>> = {};
  for (const mode of MODES) {
    if (rawModes[mode] !== undefined) modes[mode] = sanitizeRecord(rawModes[mode]);
  }
  const bestScore = Number(raw.bestScore);
  return {
    overall: sanitizeRecord(raw.overall),
    modes,
    currentWinStreak: boundedInteger(raw.currentWinStreak),
    bestScore: Number.isFinite(bestScore) ? boundedScore(bestScore) : null,
  };
}

export function sanitizeAccountProgress(value: unknown): AccountProgress {
  const raw = objectValue(value);
  const sports = objectValue(raw.sports);
  const recent = Array.isArray(raw.recent)
    ? raw.recent.map(sanitizeHistory).filter((entry): entry is HistoryEntry => entry !== null)
    : [];
  const dedupedRecent = [...new Map(recent.map((entry) => [entry.matchId, entry])).values()]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, MAX_RECENT);
  const ids = Array.isArray(raw.recordedMatchIds) ? raw.recordedMatchIds.map(sanitizeText).filter(Boolean) : [];

  return {
    version: 1,
    sports: {
      basketball: sanitizeSport(sports.basketball),
      soccer: sanitizeSport(sports.soccer),
    },
    recent: dedupedRecent,
    recordedMatchIds: [...new Set(ids)].slice(-MAX_RECORDED_IDS),
    migratedLegacy: true,
  };
}

function applyEntry(progress: AccountProgress, entry: HistoryEntry): void {
  if (entry.result === "neutral") return;
  const sport = progress.sports[entry.sport];
  const mode = sport.modes[entry.mode] ?? emptyRecord();
  if (entry.result === "win") {
    mode.wins += 1;
    sport.overall.wins += 1;
    sport.currentWinStreak += 1;
  } else if (entry.result === "loss") {
    mode.losses += 1;
    sport.overall.losses += 1;
    sport.currentWinStreak = 0;
  } else {
    mode.ties += 1;
    sport.overall.ties += 1;
    sport.currentWinStreak = 0;
  }
  sport.modes[entry.mode] = mode;
  sport.bestScore = Math.max(entry.scoreFor, sport.bestScore ?? Number.NEGATIVE_INFINITY);
}

/** The first device contributes its full legacy snapshot. Later devices contribute only match
 * entries whose IDs the account has not seen, preventing duplicated records across devices. */
export function mergeAccountProgress(stored: unknown, incoming: unknown): AccountProgress {
  const next = stored === null || stored === undefined ? null : sanitizeAccountProgress(stored);
  const candidate = sanitizeAccountProgress(incoming);
  if (!next) return candidate;

  const seen = new Set(next.recordedMatchIds);
  const additions = candidate.recent
    .filter((entry) => !seen.has(entry.matchId))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  for (const entry of additions) {
    applyEntry(next, entry);
    seen.add(entry.matchId);
  }

  next.recent = [...next.recent, ...additions]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, MAX_RECENT);
  next.recordedMatchIds = [...seen].slice(-MAX_RECORDED_IDS);
  return next;
}
