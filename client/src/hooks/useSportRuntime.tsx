import { useEffect, useState } from "react";
import type { Sport, SportRuntime } from "@fiveaside/shared/core";

const cache: Partial<Record<Sport, SportRuntime>> = {};

async function loadRuntime(sport: Sport): Promise<SportRuntime> {
  if (cache[sport]) return cache[sport] as SportRuntime;
  const runtime = sport === "soccer"
    ? (await import("@fiveaside/shared/soccer-runtime")).SOCCER_RUNTIME
    : (await import("@fiveaside/shared/basketball-runtime")).BASKETBALL_RUNTIME;
  cache[sport] = runtime;
  return runtime;
}

export function useSportRuntime(sport: Sport): SportRuntime | null {
  const [runtime, setRuntime] = useState<SportRuntime | null>(() => cache[sport] ?? null);
  useEffect(() => {
    let active = true;
    setRuntime(cache[sport] ?? null);
    void loadRuntime(sport).then((loaded) => { if (active) setRuntime(loaded); });
    return () => { active = false; };
  }, [sport]);
  return runtime;
}

export function RuntimeLoading() {
  return <div className="route-loading"><span className="search-pulse" /> Loading player pool</div>;
}
