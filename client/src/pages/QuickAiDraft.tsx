import { AppHeader } from "../components/AppHeader";
import { useAiDifficulty } from "../hooks/useAiDifficulty";
import { useAiMatch } from "../hooks/useAiMatch";
import { Draft } from "./Draft";
import { RuntimeLoading, useSportRuntime } from "../hooks/useSportRuntime";
import { useSport } from "../hooks/useSport";
import type { SportRuntime } from "@fiveaside/shared/core";

export function QuickAiDraft() {
  const { sport } = useSport();
  const runtime = useSportRuntime(sport);
  if (!runtime) return <RuntimeLoading />;
  return <ActiveQuickAiDraft runtime={runtime} />;
}

function ActiveQuickAiDraft({ runtime }: { runtime: SportRuntime }) {
  const { difficulty } = useAiDifficulty();
  const { state, dispatch, error, reset, humanSeat, record } = useAiMatch({ mode: "quick", difficulty, runtime });
  const label = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  return (
    <div className="game-page">
      <AppHeader
        eyebrow={`${label.toUpperCase()} AI`}
        title="Quick Draft"
        detail={`${record.wins}W · ${record.losses}L · ${record.ties}T`}
        actions={<button className="secondary-button" onClick={reset}>Restart</button>}
      />
      <Draft
        state={state}
        dispatch={dispatch}
        error={error}
        mySeat={humanSeat}
        seatNames={{ A: "You", B: `${label} AI` }}
        onRematch={reset}
        resultsSubtitle={`Quick Draft · ${label}`}
      />
    </div>
  );
}
