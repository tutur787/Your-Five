import { competitionForSport } from "@fiveaside/shared/core";
import type { PublicAccount } from "./accountDO";
import type { AccountProgress, HistoryEntry } from "./accountProgress";

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_ADMIN_USERS = 100;

export interface AdminUserSummary {
  accountId: string;
  email: string;
  displayName: string;
  createdAt: number;
  lastLoginAt: number;
  lastActiveAt: number;
  gamesCompleted: number;
  basketballGames: number;
  footballGames: number;
}

export interface AdminUsageRow {
  key: string;
  count: number;
}

export interface AdminDashboardData {
  generatedAt: number;
  totals: {
    users: number;
    signups7d: number;
    signups30d: number;
    active7d: number;
    active30d: number;
    gamesCompleted: number;
  };
  poolUsage: AdminUsageRow[];
  modeUsage: AdminUsageRow[];
  users: AdminUserSummary[];
}

interface AggregateRow {
  users: number | string | null;
  signups_7d: number | string | null;
  signups_30d: number | string | null;
  active_7d: number | string | null;
  active_30d: number | string | null;
  games_completed: number | string | null;
}

interface UsageRow {
  key: string;
  count: number | string;
}

interface UserRow {
  account_id: string;
  email: string;
  display_name: string;
  created_at: number | string;
  last_login_at: number | string;
  last_active_at: number | string;
  games_completed: number | string;
  basketball_games: number | string;
  football_games: number | string;
}

function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function gameCount(progress: AccountProgress, sport: "basketball" | "soccer"): number {
  const record = progress.sports[sport].overall;
  return integer(record.wins) + integer(record.losses) + integer(record.ties);
}

export function progressGameTotals(progress: AccountProgress): { basketball: number; football: number; total: number } {
  const basketball = gameCount(progress, "basketball");
  const football = gameCount(progress, "soccer");
  return { basketball, football, total: basketball + football };
}

function matchCompetition(entry: HistoryEntry): string {
  return competitionForSport(entry.sport, entry.competition);
}

export function isAdminEmail(email: string, configuredEmails: string | undefined): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !configuredEmails) return false;
  return configuredEmails.split(",").some((candidate) => candidate.trim().toLowerCase() === normalized);
}

export async function recordAccountSeen(database: D1Database, account: PublicAccount, now = Date.now()): Promise<void> {
  await database.prepare(`
    INSERT INTO user_directory (
      account_id, email, display_name, created_at, last_login_at, last_active_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      last_active_at = MAX(user_directory.last_active_at, excluded.last_active_at)
  `).bind(account.id, account.email, account.displayName, account.createdAt, account.createdAt, now).run();
}

export async function recordAccountLogin(database: D1Database, account: PublicAccount, now = Date.now()): Promise<void> {
  await database.prepare(`
    INSERT INTO user_directory (
      account_id, email, display_name, created_at, last_login_at, last_active_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      last_login_at = excluded.last_login_at,
      last_active_at = MAX(user_directory.last_active_at, excluded.last_active_at)
  `).bind(account.id, account.email, account.displayName, account.createdAt, now, now).run();
}

export async function recordProgressSnapshot(
  database: D1Database,
  account: PublicAccount,
  progress: AccountProgress,
  now = Date.now()
): Promise<void> {
  const games = progressGameTotals(progress);
  await database.prepare(`
    INSERT INTO user_directory (
      account_id, email, display_name, created_at, last_login_at, last_active_at,
      games_completed, basketball_games, football_games
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      last_active_at = MAX(user_directory.last_active_at, excluded.last_active_at),
      games_completed = MAX(user_directory.games_completed, excluded.games_completed),
      basketball_games = MAX(user_directory.basketball_games, excluded.basketball_games),
      football_games = MAX(user_directory.football_games, excluded.football_games)
  `).bind(
    account.id,
    account.email,
    account.displayName,
    account.createdAt,
    account.createdAt,
    now,
    games.total,
    games.basketball,
    games.football
  ).run();

  const statements = progress.recent.map((entry) => database.prepare(`
    INSERT OR IGNORE INTO completed_match_directory (
      account_id, match_id, completed_at, sport, competition, mode
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    account.id,
    entry.matchId,
    new Date(entry.completedAt).getTime(),
    entry.sport,
    matchCompetition(entry),
    entry.mode
  ));
  if (statements.length > 0) await database.batch(statements);
}

export async function deleteAnalyticsUser(database: D1Database, accountId: string): Promise<void> {
  await database.batch([
    database.prepare("DELETE FROM completed_match_directory WHERE account_id = ?").bind(accountId),
    database.prepare("DELETE FROM user_directory WHERE account_id = ?").bind(accountId),
  ]);
}

export async function getAdminDashboard(database: D1Database, now = Date.now()): Promise<AdminDashboardData> {
  const sevenDaysAgo = now - 7 * DAY_MS;
  const thirtyDaysAgo = now - 30 * DAY_MS;
  const [aggregate, poolUsage, modeUsage, users] = await Promise.all([
    database.prepare(`
      SELECT
        COUNT(*) AS users,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS signups_7d,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS signups_30d,
        SUM(CASE WHEN last_active_at >= ? THEN 1 ELSE 0 END) AS active_7d,
        SUM(CASE WHEN last_active_at >= ? THEN 1 ELSE 0 END) AS active_30d,
        COALESCE(SUM(games_completed), 0) AS games_completed
      FROM user_directory
    `).bind(sevenDaysAgo, thirtyDaysAgo, sevenDaysAgo, thirtyDaysAgo).first<AggregateRow>(),
    database.prepare(`
      SELECT sport || ':' || competition AS key, COUNT(*) AS count
      FROM completed_match_directory
      GROUP BY sport, competition
      ORDER BY count DESC, key ASC
    `).all<UsageRow>(),
    database.prepare(`
      SELECT mode AS key, COUNT(*) AS count
      FROM completed_match_directory
      GROUP BY mode
      ORDER BY count DESC, key ASC
    `).all<UsageRow>(),
    database.prepare(`
      SELECT account_id, email, display_name, created_at, last_login_at, last_active_at,
             games_completed, basketball_games, football_games
      FROM user_directory
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(MAX_ADMIN_USERS).all<UserRow>(),
  ]);

  return {
    generatedAt: now,
    totals: {
      users: integer(aggregate?.users),
      signups7d: integer(aggregate?.signups_7d),
      signups30d: integer(aggregate?.signups_30d),
      active7d: integer(aggregate?.active_7d),
      active30d: integer(aggregate?.active_30d),
      gamesCompleted: integer(aggregate?.games_completed),
    },
    poolUsage: poolUsage.results.map((row) => ({ key: row.key, count: integer(row.count) })),
    modeUsage: modeUsage.results.map((row) => ({ key: row.key, count: integer(row.count) })),
    users: users.results.map((row) => ({
      accountId: row.account_id,
      email: row.email,
      displayName: row.display_name,
      createdAt: integer(row.created_at),
      lastLoginAt: integer(row.last_login_at),
      lastActiveAt: integer(row.last_active_at),
      gamesCompleted: integer(row.games_completed),
      basketballGames: integer(row.basketball_games),
      footballGames: integer(row.football_games),
    })),
  };
}
