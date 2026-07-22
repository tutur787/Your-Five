import { useEffect, useRef, useState } from "react";
import { ACHIEVEMENT_DEFINITIONS, competitionForPoolVersion, competitionLabel, type AchievementId } from "@fiveaside/shared/core";
import { FaCheck, FaLock, FaMedal, FaTrophy } from "react-icons/fa6";
import {
  ACHIEVEMENT_UNLOCKED_EVENT,
  achievementProgress,
  loadProgress,
  ProgressHistoryEntry,
  ProgressMode,
  ProgressState,
} from "../utils/progressStorage";

const MODE_LABELS: Record<ProgressMode, string> = {
  "ai-casual": "Casual AI",
  "ai-competitive": "Competitive AI",
  "ai-expert": "Expert AI",
  daily: "Daily",
  "online-random": "Online",
  "online-private": "Private",
  challenge: "Challenge",
  local: "Couch",
};

function HistoryRow({ entry }: { entry: ProgressHistoryEntry }) {
  const competition = competitionForPoolVersion(entry.sport, entry.poolVersion) ?? entry.competition;
  return (
    <div className="progress-history-row">
      <span className={`history-result ${entry.result}`}>{entry.result === "neutral" ? "LOCAL" : entry.result.toUpperCase()}</span>
      <span><strong>{MODE_LABELS[entry.mode]}</strong><small>{entry.sport === "soccer" ? "Football" : "Basketball"} · {competitionLabel(entry.sport, competition)} · {new Date(entry.completedAt).toLocaleDateString()}</small></span>
      <span>{entry.scoreFor.toFixed(1)}<small>{entry.result === "neutral" ? ` vs ${entry.scoreAgainst.toFixed(1)}` : " score"}</small></span>
    </div>
  );
}

function DraftStatsPanel({ progress }: { progress: ProgressState["sports"]["basketball"] }) {
  const stats = progress.draftStats;
  if (stats.totalPicks === 0) {
    return <div className="progress-draft-empty">Draft stats begin with your next completed game.</div>;
  }
  const mostDrafted = [...stats.players].sort((a, b) => b.purchases - a.purchases || b.totalSpent - a.totalSpent || a.playerName.localeCompare(b.playerName))[0];
  const recordFee = [...stats.players].sort((a, b) => b.highestPrice - a.highestPrice || b.purchases - a.purchases || a.playerName.localeCompare(b.playerName))[0];
  return (
    <div className="progress-draft-stats">
      <h4>Draft stats</h4>
      <div className="progress-draft-grid">
        <span><small>Most drafted</small><strong>{mostDrafted?.playerName ?? "—"}</strong><em>{mostDrafted ? `${mostDrafted.purchases} acquisition${mostDrafted.purchases === 1 ? "" : "s"}` : "—"}</em></span>
        <span><small>Record fee</small><strong>{recordFee?.playerName ?? "—"}</strong><em>{recordFee ? `$${recordFee.highestPrice}` : "—"}</em></span>
        <span><small>Average fee</small><strong>${(stats.totalSpent / stats.totalPicks).toFixed(1)}</strong><em>per player</em></span>
        <span><small>Total picks</small><strong>{stats.totalPicks}</strong><em>${stats.totalSpent} spent</em></span>
      </div>
    </div>
  );
}

function AchievementGrid({ progress }: { progress: ProgressState }) {
  const earned = new Map(progress.achievements.map((achievement) => [achievement.id, achievement]));
  const categories = [...new Set(ACHIEVEMENT_DEFINITIONS.map((achievement) => achievement.category))];
  return (
    <section className="achievements-panel">
      <div className="achievements-summary">
        <span><strong>{earned.size}</strong> of {ACHIEVEMENT_DEFINITIONS.length} earned</span>
        <div className="achievement-total-track" aria-hidden="true"><span style={{ width: `${earned.size / ACHIEVEMENT_DEFINITIONS.length * 100}%` }} /></div>
      </div>
      {categories.map((category) => (
        <section className="achievement-category" key={category}>
          <h3>{category}</h3>
          <div className="achievement-grid">
            {ACHIEVEMENT_DEFINITIONS.filter((achievement) => achievement.category === category).map((achievement) => {
              const unlock = earned.get(achievement.id);
              const progressValue = achievementProgress(progress, achievement.id);
              return (
                <article className={`achievement-badge${unlock ? " earned" : " locked"}`} key={achievement.id}>
                  <span className="achievement-icon" aria-hidden="true">{unlock ? <FaMedal /> : <FaLock />}</span>
                  <div className="achievement-copy">
                    <div className="achievement-title-row">
                      <strong>{achievement.title}</strong>
                      {unlock && <FaCheck aria-label="Earned" />}
                    </div>
                    <p>{achievement.description}</p>
                    {unlock
                      ? <small>Earned {new Date(unlock.unlockedAt).toLocaleDateString()}</small>
                      : <div className="achievement-progress"><span style={{ width: `${progressValue.current / progressValue.target * 100}%` }} /><small>{progressValue.label}</small></div>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}

function ProgressModal({ progress, onClose }: { progress: ProgressState; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<"record" | "achievements">("record");
  useEffect(() => {
    const previous = document.body.style.overflow;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop progress-modal-backdrop" onClick={onClose}>
      <section className="modal progress-modal" role="dialog" aria-modal="true" aria-label="My record" onClick={(event) => event.stopPropagation()}>
        <header><div><span className="page-eyebrow">YOUR RESULTS</span><h2>My record</h2></div></header>
        <button ref={closeRef} className="icon-button modal-close progress-modal-close" onClick={onClose} aria-label="Close" title="Close">&times;</button>
        <div className="progress-modal-scroll">
          <div className="progress-tabs" role="tablist" aria-label="Trophy case sections">
            <button role="tab" aria-selected={view === "record"} className={view === "record" ? "active" : ""} onClick={() => setView("record")}>Record</button>
            <button role="tab" aria-selected={view === "achievements"} className={view === "achievements" ? "active" : ""} onClick={() => setView("achievements")}>Achievements <span>{progress.achievements.length}/{ACHIEVEMENT_DEFINITIONS.length}</span></button>
          </div>
          {view === "record" ? <>
            <div className="progress-sports">
              {(["basketball", "soccer"] as const).map((sport) => {
                const data = progress.sports[sport];
                return (
                  <section className="progress-sport" key={sport}>
                    <h3>{sport === "soccer" ? "Football" : "Basketball"}</h3>
                    <div className="progress-summary">
                      <span><strong>{data.overall.wins}-{data.overall.losses}-{data.overall.ties}</strong><small>W-L-T</small></span>
                      <span><strong>{data.currentWinStreak}</strong><small>Win streak</small></span>
                      <span><strong>{data.bestScore === null ? "—" : data.bestScore.toFixed(1)}</strong><small>Best score</small></span>
                    </div>
                    <div className="progress-modes">
                      {Object.entries(data.modes).map(([mode, record]) => record && (
                        <div key={mode}><span>{MODE_LABELS[mode as ProgressMode]}</span><strong>{record.wins}-{record.losses}-{record.ties}</strong></div>
                      ))}
                    </div>
                    <DraftStatsPanel progress={data} />
                  </section>
                );
              })}
            </div>
            <section className="progress-history">
              <h3>Recent drafts</h3>
              {progress.recent.length > 0
                ? progress.recent.map((entry) => <HistoryRow entry={entry} key={entry.matchId} />)
                : <p className="meta">Complete a draft and it will appear here.</p>}
            </section>
          </> : <AchievementGrid progress={progress} />}
        </div>
      </section>
    </div>
  );
}

export function AchievementToast() {
  const [unlocked, setUnlocked] = useState<AchievementId[]>([]);
  useEffect(() => {
    const onUnlock = (event: Event) => setUnlocked((event as CustomEvent<AchievementId[]>).detail);
    window.addEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlock);
    return () => window.removeEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlock);
  }, []);
  useEffect(() => {
    if (unlocked.length === 0) return;
    const timer = window.setTimeout(() => setUnlocked([]), 4800);
    return () => window.clearTimeout(timer);
  }, [unlocked]);
  if (unlocked.length === 0) return null;
  const first = ACHIEVEMENT_DEFINITIONS.find((achievement) => achievement.id === unlocked[0]);
  return (
    <div className="achievement-toast" role="status" aria-live="polite">
      <span className="achievement-toast-icon"><FaTrophy aria-hidden="true" /></span>
      <span><small>Achievement unlocked</small><strong>{first?.title ?? "New achievement"}{unlocked.length > 1 ? ` +${unlocked.length - 1}` : ""}</strong></span>
    </div>
  );
}

export function ProgressButton() {
  const [progress, setProgress] = useState<ProgressState | null>(null);
  return (
    <>
      <button className="icon-button progress-button" onClick={() => setProgress(loadProgress())} aria-label="My record" title="My record">
        <FaTrophy aria-hidden="true" />
      </button>
      {progress && <ProgressModal progress={progress} onClose={() => setProgress(null)} />}
    </>
  );
}
