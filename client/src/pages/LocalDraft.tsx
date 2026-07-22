import { useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { useLocalMatch } from "../hooks/useLocalMatch";
import { useRecordProgress } from "../hooks/useRecordProgress";
import { RuntimeLoading, useSportRuntime } from "../hooks/useSportRuntime";
import { useSport } from "../hooks/useSport";
import { competitionLabel, type SportRuntime } from "@fiveaside/shared/core";
import { Draft } from "./Draft";

export function LocalDraft() {
  const { sport, basketballCompetition, footballCompetition } = useSport();
  const [draftKey, setDraftKey] = useState(() => crypto.randomUUID());
  const runtime = useSportRuntime(sport, sport === "soccer" ? footballCompetition : basketballCompetition, `local:${draftKey}`);
  if (!runtime) return <RuntimeLoading />;
  return <ActiveLocalDraft key={`${runtime.poolVersion}:${draftKey}`} runtime={runtime} onNewDraft={() => setDraftKey(crypto.randomUUID())} />;
}

function ActiveLocalDraft({ runtime, onNewDraft }: { runtime: SportRuntime; onNewDraft: () => void }) {
  const { state, dispatch, error } = useLocalMatch(runtime);
  useRecordProgress(state, "local", null);
  return (
    <div className="game-page">
      <AppHeader
        eyebrow="LOCAL MATCH"
        title="Couch draft"
        detail={`Pass the screen when possession changes · ${competitionLabel(runtime.sport, runtime.competition)}`}
        actions={<button className="secondary-button" onClick={onNewDraft}>Restart</button>}
      />
      <Draft state={state} dispatch={dispatch} error={error} mySeat="local" onRematch={onNewDraft} />
    </div>
  );
}
