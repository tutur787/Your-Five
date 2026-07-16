import { useCallback, useState } from "react";
import { applyAction, createMatch, MatchAction, MatchState } from "@fiveaside/shared";
import { useSport } from "./useSport";

export function useLocalMatch() {
  const { sport } = useSport();
  const [state, setState] = useState<MatchState>(() => createMatch(sport));
  const [error, setError] = useState<string | null>(null);

  const dispatch = useCallback((action: MatchAction) => {
    setState((prev) => {
      const res = applyAction(prev, action);
      if (!res.ok) {
        setError(res.error ?? "Invalid action");
        return prev;
      }
      setError(null);
      return res.state;
    });
  }, []);

  const reset = useCallback(() => {
    setState(createMatch(sport));
    setError(null);
  }, [sport]);

  return { state, dispatch, error, reset };
}
