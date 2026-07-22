import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_FOOTBALL_COMPETITION,
  resolveFootballCompetition,
  seededRng,
  type FootballCompetition,
  type FootballCompetitionChoice,
  type Sport,
  type SportRuntime,
} from "@fiveaside/shared/core";
import { useSport } from "./useSport";

const cache: Partial<Record<Sport | FootballCompetition, SportRuntime>> = {};

async function loadRuntime(sport: Sport, competition?: FootballCompetition): Promise<SportRuntime> {
  const key = sport === "soccer" ? competition ?? DEFAULT_FOOTBALL_COMPETITION : sport;
  if (cache[key]) return cache[key] as SportRuntime;
  const runtime = sport === "basketball"
    ? (await import("@fiveaside/shared/basketball-runtime")).BASKETBALL_RUNTIME
    : competition === "premier-league-2025-26"
      ? (await import("@fiveaside/shared/football-premier-league-runtime")).PREMIER_LEAGUE_RUNTIME
      : competition === "laliga-2025-26"
        ? (await import("@fiveaside/shared/football-laliga-runtime")).LALIGA_RUNTIME
        : competition === "serie-a-2025-26"
          ? (await import("@fiveaside/shared/football-serie-a-runtime")).SERIE_A_RUNTIME
          : competition === "bundesliga-2025-26"
            ? (await import("@fiveaside/shared/football-bundesliga-runtime")).BUNDESLIGA_RUNTIME
            : competition === "ligue-1-2025-26"
              ? (await import("@fiveaside/shared/football-ligue-1-runtime")).LIGUE_1_RUNTIME
              : (await import("@fiveaside/shared/soccer-runtime")).SOCCER_RUNTIME;
  cache[key] = runtime;
  return runtime;
}

export function useSportRuntime(
  sport: Sport,
  choiceOverride?: FootballCompetitionChoice,
  randomResolutionKey?: string | number
): SportRuntime | null {
  const selected = useSport();
  const choice = choiceOverride ?? selected.footballCompetition;
  const competition = useMemo(
    () => sport === "soccer"
      ? resolveFootballCompetition(choice, randomResolutionKey === undefined ? Math.random : seededRng(`football-competition:${randomResolutionKey}`))
      : undefined,
    [sport, choice, randomResolutionKey]
  );
  const key = sport === "soccer" ? competition ?? DEFAULT_FOOTBALL_COMPETITION : sport;
  const [runtime, setRuntime] = useState<SportRuntime | null>(() => cache[key] ?? null);
  useEffect(() => {
    let active = true;
    setRuntime(cache[key] ?? null);
    void loadRuntime(sport, competition).then((loaded) => { if (active) setRuntime(loaded); });
    return () => { active = false; };
  }, [sport, competition, key]);
  return runtime;
}

export function RuntimeLoading() {
  return <div className="route-loading"><span className="search-pulse" /> Loading player pool</div>;
}
