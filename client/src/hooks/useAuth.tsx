import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  AccountUser,
  beginGoogleSignIn,
  deleteAccount as deleteAccountRequest,
  getAccountSession,
  signOutAccount,
  syncAccountProgress,
  updateAccountProfile,
} from "../utils/authApi";
import { loadProgress, PROGRESS_CHANGED_EVENT, ProgressState, saveProgress } from "../utils/progressStorage";

type AuthStatus = "loading" | "guest" | "authenticated";
type SyncStatus = "idle" | "syncing" | "synced" | "error";

interface AuthContextValue {
  status: AuthStatus;
  syncStatus: SyncStatus;
  user: AccountUser | null;
  signIn: () => void;
  signOut: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [user, setUser] = useState<AccountUser | null>(null);
  const userRef = useRef<AccountUser | null>(null);
  const syncTimer = useRef<number | null>(null);

  const setCurrentUser = useCallback((next: AccountUser | null) => {
    userRef.current = next;
    setUser(next);
    setStatus(next ? "authenticated" : "guest");
  }, []);

  const pushProgress = useCallback(async (progress: ProgressState) => {
    if (!userRef.current) return;
    setSyncStatus("syncing");
    try {
      const cloud = await syncAccountProgress(progress);
      saveProgress(cloud, undefined, false);
      setSyncStatus("synced");
    } catch {
      setSyncStatus("error");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void getAccountSession()
      .then(async (account) => {
        if (!active) return;
        setCurrentUser(account);
        if (account) await pushProgress(loadProgress());
      })
      .catch(() => active && setCurrentUser(null));

    const url = new URL(window.location.href);
    if (url.searchParams.has("auth")) {
      url.searchParams.delete("auth");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    return () => { active = false; };
  }, [pushProgress, setCurrentUser]);

  useEffect(() => {
    const onProgress = (event: Event) => {
      if (!userRef.current) return;
      const progress = (event as CustomEvent<ProgressState>).detail;
      if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => void pushProgress(progress), 600);
    };
    window.addEventListener(PROGRESS_CHANGED_EVENT, onProgress);
    return () => {
      window.removeEventListener(PROGRESS_CHANGED_EVENT, onProgress);
      if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
    };
  }, [pushProgress]);

  const signOut = useCallback(async () => {
    await signOutAccount();
    setCurrentUser(null);
    setSyncStatus("idle");
  }, [setCurrentUser]);

  const updateDisplayName = useCallback(async (displayName: string) => {
    setCurrentUser(await updateAccountProfile(displayName));
  }, [setCurrentUser]);

  const deleteAccount = useCallback(async () => {
    await deleteAccountRequest();
    setCurrentUser(null);
    setSyncStatus("idle");
  }, [setCurrentUser]);

  return (
    <AuthContext.Provider value={{
      status,
      syncStatus,
      user,
      signIn: beginGoogleSignIn,
      signOut,
      updateDisplayName,
      deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
