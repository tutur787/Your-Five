import {
  ACHIEVEMENT_IDS,
  competitionForPoolVersion,
  competitionForSport,
  type AchievementId,
  type AchievementUnlock,
  type Competition,
} from "@fiveaside/shared/core";

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
  competition?: Competition;
  poolVersion?: string;
  mode: ProgressMode;
  result: Result;
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
  purchases?: Purchase[];
}

interface Purchase {
  playerKey: string;
  playerName: string;
  price: number;
}

interface PlayerPurchaseStat {
  playerKey: string;
  playerName: string;
  purchases: number;
  totalSpent: number;
  highestPrice: number;
}

interface DraftStats {
  totalPicks: number;
  totalSpent: number;
  players: PlayerPurchaseStat[];
}

interface SportProgress {
  overall: ProgressRecord;
  modes: Partial<Record<ProgressMode, ProgressRecord>>;
  currentWinStreak: number;
  bestScore: number | null;
  draftStats: DraftStats;
}

export interface AccountProgress {
  version: 1;
  sports: Record<Sport, SportProgress>;
  recent: HistoryEntry[];
  recordedMatchIds: string[];
  migratedLegacy: boolean;
  achievements: AchievementUnlock[];
}

const MAX_RECENT = 10;
const MAX_RECORDED_IDS = 100;
const MAX_TEXT = 100;
const MAX_PLAYER_STATS = 2_000;

const emptyRecord = (): ProgressRecord => ({ wins: 0, losses: 0, ties: 0 });
const emptyDraftStats = (): DraftStats => ({ totalPicks: 0, totalSpent: 0, players: [] });
const emptySport = (): SportProgress => ({
  overall: emptyRecord(),
  modes: {},
  currentWinStreak: 0,
  bestScore: null,
  draftStats: emptyDraftStats(),
});

export function emptyAccountProgress(): AccountProgress {
  return {
    version: 1,
    sports: { basketball: emptySport(), soccer: emptySport() },
    recent: [],
    recordedMatchIds: [],
    migratedLegacy: true,
    achievements: [],
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

function sanitizePurchase(value: unknown): Purchase | null {
  const raw = objectValue(value);
  const playerKey = sanitizeText(raw.playerKey);
  const playerName = sanitizeText(raw.playerName);
  if (!playerKey || !playerName) return null;
  return { playerKey, playerName, price: boundedInteger(raw.price, 20) };
}

function sanitizePlayerPurchaseStat(value: unknown): PlayerPurchaseStat | null {
  const raw = objectValue(value);
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
  const raw = objectValue(value);
  const players = Array.isArray(raw.players)
    ? raw.players.map(sanitizePlayerPurchaseStat).filter((entry): entry is PlayerPurchaseStat => entry !== null).slice(0, MAX_PLAYER_STATS)
    : [];
  return {
    totalPicks: boundedInteger(raw.totalPicks),
    totalSpent: boundedInteger(raw.totalSpent),
    players,
  };
}

function sanitizeHistory(value: unknown): HistoryEntry | null {
  const raw = objectValue(value);
  const matchId = sanitizeText(raw.matchId);
  const sport = SPORTS.includes(raw.sport as Sport) ? raw.sport as Sport : null;
  const mode = MODES.includes(raw.mode as ProgressMode) ? raw.mode as ProgressMode : null;
  const result = ["win", "loss", "tie", "neutral"].includes(String(raw.result)) ? raw.result as Result : null;
  const completed = typeof raw.completedAt === "string" ? new Date(raw.completedAt) : null;
  if (!matchId || !sport || !mode || !result || !completed || !Number.isFinite(completed.getTime())) return null;

  const poolVersion = sanitizeText(raw.poolVersion) || undefined;
  return {
    matchId,
    completedAt: completed.toISOString(),
    sport,
    competition: competitionForPoolVersion(sport, poolVersion) ?? competitionForSport(sport, raw.competition),
    poolVersion,
    mode,
    result,
    scoreFor: boundedScore(raw.scoreFor),
    scoreAgainst: boundedScore(raw.scoreAgainst),
    lineup: sanitizeLineup(raw.lineup),
    opponentLineup: sanitizeLineup(raw.opponentLineup),
    targetScore: raw.targetScore === undefined ? undefined : boundedScore(raw.targetScore),
    targetBeaten: typeof raw.targetBeaten === "boolean" ? raw.targetBeaten : undefined,
    completionReason: raw.completionReason === "forfeit" ? "forfeit" : "score",
    budgetLeft: raw.budgetLeft === undefined ? undefined : boundedInteger(raw.budgetLeft, 20),
    skipsUsed: raw.skipsUsed === undefined ? undefined : boundedInteger(raw.skipsUsed, 100),
    maxPickPrice: raw.maxPickPrice === undefined ? undefined : boundedInteger(raw.maxPickPrice, 20),
    allPositionsValid: typeof raw.allPositionsValid === "boolean" ? raw.allPositionsValid : undefined,
    purchases: Array.isArray(raw.purchases)
      ? raw.purchases.map(sanitizePurchase).filter((entry): entry is Purchase => entry !== null).slice(0, 5)
      : undefined,
  };
}

function sanitizeAchievements(value: unknown): AchievementUnlock[] {
  if (!Array.isArray(value)) return [];
  const validIds = new Set<string>(ACHIEVEMENT_IDS);
  const entries = value.flatMap((candidate): AchievementUnlock[] => {
    const raw = objectValue(candidate);
    const id = sanitizeText(raw.id) as AchievementId;
    const unlocked = typeof raw.unlockedAt === "string" ? new Date(raw.unlockedAt) : null;
    if (!validIds.has(id) || !unlocked || !Number.isFinite(unlocked.getTime())) return [];
    const matchId = sanitizeText(raw.matchId);
    return [{ id, unlockedAt: unlocked.toISOString(), matchId: matchId || undefined }];
  });
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
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
    draftStats: sanitizeDraftStats(raw.draftStats),
  };
}

function addPurchases(stats: DraftStats, purchases: Purchase[]): void {
  const players = new Map(stats.players.map((player) => [player.playerKey, player]));
  for (const purchase of purchases) {
    const existing = players.get(purchase.playerKey);
    if (existing) {
      existing.purchases += 1;
      existing.totalSpent += purchase.price;
      existing.highestPrice = Math.max(existing.highestPrice, purchase.price);
      existing.playerName = purchase.playerName;
    } else {
      const created = {
        playerKey: purchase.playerKey,
        playerName: purchase.playerName,
        purchases: 1,
        totalSpent: purchase.price,
        highestPrice: purchase.price,
      };
      stats.players.push(created);
      players.set(created.playerKey, created);
    }
    stats.totalPicks += 1;
    stats.totalSpent += purchase.price;
  }
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
    achievements: sanitizeAchievements(raw.achievements),
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
  addPurchases(sport.draftStats, entry.purchases ?? []);
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
  const achievements = new Map(next.achievements.map((achievement) => [achievement.id, achievement]));
  for (const achievement of candidate.achievements) {
    const existing = achievements.get(achievement.id);
    if (!existing || achievement.unlockedAt < existing.unlockedAt) achievements.set(achievement.id, achievement);
  }
  next.achievements = [...achievements.values()];
  return next;
}
