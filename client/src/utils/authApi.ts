import type { ProgressState } from "./progressStorage";

export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
  isAdmin?: boolean;
}

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

function apiBase(): string {
  return (import.meta.env.VITE_SERVER_URL ?? "").replace(/\/$/, "");
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(body?.error ?? "The account service could not be reached.");
  return body as T;
}

export async function getAccountSession(): Promise<AccountUser | null> {
  return (await apiRequest<{ user: AccountUser | null }>("/auth/me")).user;
}

export function beginGoogleSignIn(): void {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`${apiBase()}/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function signOutAccount(): Promise<void> {
  await apiRequest<{ ok: true }>("/auth/logout", { method: "POST" });
}

export async function updateAccountProfile(displayName: string): Promise<AccountUser> {
  return (await apiRequest<{ user: AccountUser }>("/account/profile", {
    method: "POST",
    body: JSON.stringify({ displayName }),
  })).user;
}

export async function syncAccountProgress(progress: ProgressState): Promise<ProgressState> {
  return (await apiRequest<{ progress: ProgressState }>("/account/progress", {
    method: "POST",
    body: JSON.stringify({ progress }),
  })).progress;
}

export async function deleteAccount(): Promise<void> {
  await apiRequest<{ ok: true }>("/account", { method: "DELETE" });
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  return await apiRequest<AdminDashboardData>("/admin/summary");
}
