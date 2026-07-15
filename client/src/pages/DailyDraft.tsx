import { AppHeader } from "../components/AppHeader";
import { useDailyMatch } from "../hooks/useDailyMatch";
import { Draft } from "./Draft";

export function DailyDraft() {
  const { state, dispatch, error, humanSeat, today, bestScore, alreadyPlayedToday } = useDailyMatch();
  return (
    <div className="game-page">
      <AppHeader
        eyebrow="DAILY CHALLENGE"
        title={today}
        detail={bestScore !== null ? `Best score ${bestScore.toFixed(1)}` : "Fresh board"}
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
        resultsSubtitle={`Daily Draft · ${today}`}
      />
    </div>
  );
}
