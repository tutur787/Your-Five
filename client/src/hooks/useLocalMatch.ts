import { useCallback, useState } from "react";
import { applyAction, createMatch, MatchAction, MatchState } from "@fiveaside/shared";

export function useLocalMatch() {
  const [state, setState] = useState<MatchState>(() => createMatch());
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
    setState(createMatch());
    setError(null);
  }, []);

  return { state, dispatch, error, reset };
}
