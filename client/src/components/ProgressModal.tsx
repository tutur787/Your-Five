import { useEffect, useRef, useState } from "react";
import { FaTrophy } from "react-icons/fa6";
import { loadProgress, ProgressHistoryEntry, ProgressMode, ProgressState } from "../utils/progressStorage";

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
  return (
    <div className="progress-history-row">
      <span className={`history-result ${entry.result}`}>{entry.result === "neutral" ? "LOCAL" : entry.result.toUpperCase()}</span>
      <span><strong>{MODE_LABELS[entry.mode]}</strong><small>{entry.sport === "soccer" ? "Football" : "Basketball"} · {new Date(entry.completedAt).toLocaleDateString()}</small></span>
      <span>{entry.scoreFor.toFixed(1)}<small>{entry.result === "neutral" ? ` vs ${entry.scoreAgainst.toFixed(1)}` : " score"}</small></span>
    </div>
  );
}

function ProgressModal({ progress, onClose }: { progress: ProgressState; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
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
        <button ref={closeRef} className="icon-button modal-close" onClick={onClose} aria-label="Close" title="Close">&times;</button>
        <div className="progress-modal-scroll">
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
        </div>
      </section>
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
