import { AiDifficulty, todayUtcDateString } from "@fiveaside/shared/core";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { useAiDifficulty } from "../hooks/useAiDifficulty";
import { useSport } from "../hooks/useSport";
import { loadDailyBestScore, loadDailyCompleted } from "../utils/aiStorage";
import { progressRecordFor } from "../utils/progressStorage";

const DIFFICULTIES: AiDifficulty[] = ["casual", "competitive", "expert"];

function difficultyLabel(difficulty: AiDifficulty): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

export function AiLanding() {
  const navigate = useNavigate();
  const { sport } = useSport();
  const { difficulty, setDifficulty } = useAiDifficulty();
  const today = todayUtcDateString();
  const dailyComplete = loadDailyCompleted(sport, today) !== null;
  const dailyBest = loadDailyBestScore(sport);

  return (
    <div className="game-page ai-landing">
      <AppHeader
        eyebrow="SOLO DRAFT"
        title="Play AI"
        detail="Choose a challenge"
        sportLocked={false}
      />

      <section className="ai-difficulty-section" aria-labelledby="difficulty-title">
        <div className="ai-section-heading">
          <div>
            <div className="page-eyebrow">QUICK DRAFT DIFFICULTY</div>
            <h2 id="difficulty-title">Pick your matchup</h2>
          </div>
          <span className="difficulty-current">{difficultyLabel(difficulty)}</span>
        </div>
        <div className="ai-difficulty-control" role="group" aria-label="AI difficulty">
          {DIFFICULTIES.map((option) => {
            const record = progressRecordFor(sport, `ai-${option}`);
            return (
              <button
                type="button"
                key={option}
                className={difficulty === option ? "active" : ""}
                aria-pressed={difficulty === option}
                onClick={() => setDifficulty(option)}
              >
                <strong>{difficultyLabel(option)}</strong>
                <span>{record.wins}W&nbsp;&nbsp;{record.losses}L&nbsp;&nbsp;{record.ties}T</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mode-select ai-mode-select" aria-label="Choose an AI game">
        <button className="mode-option featured" onClick={() => navigate("/ai/quick")}>
          <span className="mode-number">01</span>
          <span className="mode-copy">
            <span className="mode-label">Quick Draft</span>
            <span className="mode-meta">Fresh pool · {difficultyLabel(difficulty)} AI · Unlimited games</span>
          </span>
          <span className="mode-arrow" aria-hidden="true">&rarr;</span>
        </button>
        <button className="mode-option" onClick={() => navigate("/daily")}>
          <span className="mode-number">02</span>
          <span className="mode-copy">
            <span className="mode-label">Daily Challenge</span>
            <span className="mode-meta">
              {dailyComplete ? "Completed today" : "Today's shared board"} · Competitive AI
              {dailyBest !== null ? ` · Best ${dailyBest.toFixed(1)}` : ""}
            </span>
          </span>
          <span className="mode-arrow" aria-hidden="true">&rarr;</span>
        </button>
      </section>
    </div>
  );
}
