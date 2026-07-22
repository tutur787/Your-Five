import { useState } from "react";
import { AppHeader } from "../components/AppHeader";
import { useAiDifficulty } from "../hooks/useAiDifficulty";
import { useAiMatch } from "../hooks/useAiMatch";
import { Draft } from "./Draft";
import { RuntimeLoading, useSportRuntime } from "../hooks/useSportRuntime";
import { useSport } from "../hooks/useSport";
import { competitionLabel, type SportRuntime } from "@fiveaside/shared/core";

export function QuickAiDraft() {
  const { sport, basketballCompetition, footballCompetition } = useSport();
  const [draftKey, setDraftKey] = useState(() => crypto.randomUUID());
  const runtime = useSportRuntime(sport, sport === "soccer" ? footballCompetition : basketballCompetition, `quick:${draftKey}`);
  if (!runtime) return <RuntimeLoading />;
  return <ActiveQuickAiDraft key={`${runtime.poolVersion}:${draftKey}`} runtime={runtime} onNewDraft={() => setDraftKey(crypto.randomUUID())} />;
}

function ActiveQuickAiDraft({ runtime, onNewDraft }: { runtime: SportRuntime; onNewDraft: () => void }) {
  const { difficulty } = useAiDifficulty();
  const { state, dispatch, error, humanSeat, record } = useAiMatch({ mode: "quick", difficulty, runtime });
  const label = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  return (
    <div className="game-page">
      <AppHeader
        eyebrow={`${label.toUpperCase()} AI`}
        title="Quick Draft"
        detail={`${competitionLabel(runtime.sport, runtime.competition)} · ${record.wins}W · ${record.losses}L · ${record.ties}T`}
        actions={<button className="secondary-button" onClick={onNewDraft}>Restart</button>}
      />
      <Draft
        state={state}
        dispatch={dispatch}
        error={error}
        mySeat={humanSeat}
        seatNames={{ A: "You", B: `${label} AI` }}
        onRematch={onNewDraft}
        resultsSubtitle={`Quick Draft · ${label} · ${competitionLabel(runtime.sport, runtime.competition)}`}
      />
    </div>
  );
}
