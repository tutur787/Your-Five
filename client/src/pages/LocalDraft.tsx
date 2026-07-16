import { AppHeader } from "../components/AppHeader";
import { useLocalMatch } from "../hooks/useLocalMatch";
import { useRecordProgress } from "../hooks/useRecordProgress";
import { RuntimeLoading, useSportRuntime } from "../hooks/useSportRuntime";
import { useSport } from "../hooks/useSport";
import type { SportRuntime } from "@fiveaside/shared/core";
import { Draft } from "./Draft";

export function LocalDraft() {
  const { sport } = useSport();
  const runtime = useSportRuntime(sport);
  if (!runtime) return <RuntimeLoading />;
  return <ActiveLocalDraft runtime={runtime} />;
}

function ActiveLocalDraft({ runtime }: { runtime: SportRuntime }) {
  const { state, dispatch, error, reset } = useLocalMatch(runtime);
  useRecordProgress(state, "local", null);
  return (
    <div className="game-page">
      <AppHeader
        eyebrow="LOCAL MATCH"
        title="Couch draft"
        detail="Pass the screen when possession changes"
        actions={<button className="secondary-button" onClick={reset}>Restart</button>}
      />
      <Draft state={state} dispatch={dispatch} error={error} mySeat="local" onRematch={reset} />
    </div>
  );
}
