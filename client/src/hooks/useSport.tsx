import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Sport } from "@fiveaside/shared/core";

const STORAGE_KEY = "your-five:selected-sport";

interface SportContextValue {
  sport: Sport;
  setSport: (sport: Sport) => void;
}

const SportContext = createContext<SportContextValue | null>(null);

function storedSport(): Sport {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "soccer" ? "soccer" : "basketball";
  } catch {
    return "basketball";
  }
}

export function SportProvider({ children }: { children: ReactNode }) {
  const [sport, setSportState] = useState<Sport>(storedSport);
  const setSport = useCallback((next: Sport) => {
    setSportState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Preference remains in memory. */ }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.sport = sport;
    if (/^Your Five \| (?:\$20 All-Time )?(?:Basketball|Football|Soccer|Sports) Draft$/.test(document.title)) {
      document.title = `Your Five | ${sport === "soccer" ? "Soccer" : "Basketball"} Draft`;
    }
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      sport === "soccer"
        ? "Draft, bid, and build your world football five with a $20 cap."
        : "Draft, bid, and build your all-time basketball five with a $20 cap."
    );
  }, [sport]);

  const value = useMemo(() => ({ sport, setSport }), [sport, setSport]);
  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
}

export function useSport(): SportContextValue {
  const context = useContext(SportContext);
  if (!context) throw new Error("useSport must be used within SportProvider");
  return context;
}
