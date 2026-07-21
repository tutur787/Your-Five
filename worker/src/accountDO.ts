import { DurableObject } from "cloudflare:workers";
import { AccountProgress, mergeAccountProgress } from "./accountProgress";
import type { Env } from "./env";

export interface GoogleAccountInput {
  id: string;
  googleSub: string;
  email: string;
  googleName: string;
}

export interface PublicAccount {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
}

interface StoredAccount extends GoogleAccountInput {
  displayName: string;
  createdAt: number;
  updatedAt: number;
}

interface StoredSession {
  expiresAt: number;
}

const ACCOUNT_KEY = "account";
const PROGRESS_KEY = "progress";
const SESSION_PREFIX = "session:";
const MAX_SESSIONS = 20;

function publicAccount(account: StoredAccount): PublicAccount {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    createdAt: account.createdAt,
  };
}

export class AccountDO extends DurableObject<Env> {
  async upsertGoogleAccount(input: GoogleAccountInput): Promise<PublicAccount> {
    const existing = await this.ctx.storage.get<StoredAccount>(ACCOUNT_KEY);
    const now = Date.now();
    const account: StoredAccount = existing
      ? { ...existing, email: input.email, googleName: input.googleName, updatedAt: now }
      : { ...input, displayName: input.googleName, createdAt: now, updatedAt: now };
    await this.ctx.storage.put(ACCOUNT_KEY, account);
    return publicAccount(account);
  }

  async createSession(tokenHash: string, expiresAt: number): Promise<void> {
    const sessions = await this.ctx.storage.list<StoredSession>({ prefix: SESSION_PREFIX });
    const now = Date.now();
    const expired = [...sessions].filter(([, session]) => session.expiresAt <= now).map(([key]) => key);
    if (expired.length > 0) await this.ctx.storage.delete(expired);
    const active = [...sessions]
      .filter(([key, session]) => !expired.includes(key) && session.expiresAt > now)
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const overflow = active.slice(0, Math.max(0, active.length - MAX_SESSIONS + 1)).map(([key]) => key);
    if (overflow.length > 0) await this.ctx.storage.delete(overflow);
    await this.ctx.storage.put(`${SESSION_PREFIX}${tokenHash}`, { expiresAt } satisfies StoredSession);
  }

  async authenticate(tokenHash: string): Promise<PublicAccount | null> {
    const sessionKey = `${SESSION_PREFIX}${tokenHash}`;
    const session = await this.ctx.storage.get<StoredSession>(sessionKey);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      await this.ctx.storage.delete(sessionKey);
      return null;
    }
    const account = await this.ctx.storage.get<StoredAccount>(ACCOUNT_KEY);
    return account ? publicAccount(account) : null;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.ctx.storage.delete(`${SESSION_PREFIX}${tokenHash}`);
  }

  async updateDisplayName(displayName: string): Promise<PublicAccount | null> {
    const account = await this.ctx.storage.get<StoredAccount>(ACCOUNT_KEY);
    if (!account) return null;
    const updated = { ...account, displayName, updatedAt: Date.now() };
    await this.ctx.storage.put(ACCOUNT_KEY, updated);
    return publicAccount(updated);
  }

  async mergeProgress(progress: unknown): Promise<AccountProgress> {
    const stored = await this.ctx.storage.get<AccountProgress>(PROGRESS_KEY);
    const merged = mergeAccountProgress(stored, progress);
    await this.ctx.storage.put(PROGRESS_KEY, merged);
    return merged;
  }

  async getProgress(): Promise<AccountProgress | null> {
    return await this.ctx.storage.get<AccountProgress>(PROGRESS_KEY) ?? null;
  }

  async deleteAccount(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
