import { useCallback, useState } from "react";
import { applyAction, createMatchWithRuntime, MatchAction, MatchState, SportRuntime } from "@fiveaside/shared/core";

export function useLocalMatch(runtime: SportRuntime) {
  const [state, setState] = useState<MatchState>(() => createMatchWithRuntime(runtime));
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
    setState(createMatchWithRuntime(runtime));
    setError(null);
  }, [runtime]);

  return { state, dispatch, error, reset };
}
