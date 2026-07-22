import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_FOOTBALL_COMPETITION_CHOICE,
  normalizeFootballCompetitionChoice,
  type FootballCompetitionChoice,
  type Sport,
} from "@fiveaside/shared/core";

const STORAGE_KEY = "your-five:selected-sport";
const FOOTBALL_COMPETITION_STORAGE_KEY = "your-five:selected-football-competition";

interface SportContextValue {
  sport: Sport;
  setSport: (sport: Sport) => void;
  footballCompetition: FootballCompetitionChoice;
  setFootballCompetition: (competition: FootballCompetitionChoice) => void;
}

const SportContext = createContext<SportContextValue | null>(null);

function storedSport(): Sport {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "soccer" ? "soccer" : "basketball";
  } catch {
    return "basketball";
  }
}

function storedFootballCompetition(): FootballCompetitionChoice {
  try {
    return normalizeFootballCompetitionChoice(window.localStorage.getItem(FOOTBALL_COMPETITION_STORAGE_KEY));
  } catch {
    return DEFAULT_FOOTBALL_COMPETITION_CHOICE;
  }
}

export function SportProvider({ children }: { children: ReactNode }) {
  const [sport, setSportState] = useState<Sport>(storedSport);
  const [footballCompetition, setFootballCompetitionState] = useState<FootballCompetitionChoice>(storedFootballCompetition);
  const setSport = useCallback((next: Sport) => {
    setSportState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Preference remains in memory. */ }
  }, []);
  const setFootballCompetition = useCallback((next: FootballCompetitionChoice) => {
    setFootballCompetitionState(next);
    try { window.localStorage.setItem(FOOTBALL_COMPETITION_STORAGE_KEY, next); } catch { /* Preference remains in memory. */ }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.sport = sport;
  }, [sport]);

  const value = useMemo(
    () => ({ sport, setSport, footballCompetition, setFootballCompetition }),
    [sport, setSport, footballCompetition, setFootballCompetition]
  );
  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
}

export function useSport(): SportContextValue {
  const context = useContext(SportContext);
  if (!context) throw new Error("useSport must be used within SportProvider");
  return context;
}
