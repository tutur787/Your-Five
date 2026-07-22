import { AppHeader } from "../components/AppHeader";
import { useDailyMatch } from "../hooks/useDailyMatch";
import { Draft } from "./Draft";
import { RuntimeLoading, useSportRuntime } from "../hooks/useSportRuntime";
import { useSport } from "../hooks/useSport";
import { footballCompetitionLabel, todayUtcDateString, type SportRuntime } from "@fiveaside/shared/core";

export function DailyDraft() {
  const { sport, footballCompetition } = useSport();
  const runtime = useSportRuntime(sport, footballCompetition, `daily:${todayUtcDateString()}`);
  if (!runtime) return <RuntimeLoading />;
  return <ActiveDailyDraft runtime={runtime} />;
}

function ActiveDailyDraft({ runtime }: { runtime: SportRuntime }) {
  const { state, dispatch, error, humanSeat, today, bestScore, alreadyPlayedToday } = useDailyMatch(runtime);
  return (
    <div className="game-page">
      <AppHeader
        eyebrow="DAILY CHALLENGE"
        title={today}
        detail={`${runtime.sport === "soccer" ? `${footballCompetitionLabel(runtime.competition)} · ` : ""}${bestScore !== null ? `Best score ${bestScore.toFixed(1)}` : "Fresh board"}`}
      />
      {alreadyPlayedToday && state.phase === "complete" && (
        <div className="notice-banner">Today's run is complete. A new board drops tomorrow.</div>
      )}
      <Draft
        state={state}
        dispatch={dispatch}
        error={error}
        mySeat={humanSeat}
        seatNames={{ A: "You", B: "AI Opponent" }}
        resultsSubtitle={`Daily Draft · ${today}${runtime.sport === "soccer" ? ` · ${footballCompetitionLabel(runtime.competition)}` : ""}`}
      />
    </div>
  );
}
