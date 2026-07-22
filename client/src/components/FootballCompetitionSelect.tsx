import {
  FOOTBALL_COMPETITION_CHOICES,
  FOOTBALL_COMPETITION_LABELS,
  type FootballCompetitionChoice,
} from "@fiveaside/shared/core";
import { useSport } from "../hooks/useSport";

export function FootballCompetitionSelect({ disabled = false }: { disabled?: boolean }) {
  const { sport, footballCompetition, setFootballCompetition } = useSport();
  if (sport !== "soccer") return null;

  return (
    <label className={`football-competition-select${disabled ? " disabled" : ""}`}>
      <span className="football-competition-heading">
        <span className="page-eyebrow">PLAYER POOL</span>
        <strong>Football competition</strong>
      </span>
      <select
        aria-label="Football competition"
        value={footballCompetition}
        disabled={disabled}
        title={disabled ? "Return home to change the football competition" : "Football competition"}
        onChange={(event) => setFootballCompetition(event.target.value as FootballCompetitionChoice)}
      >
        {FOOTBALL_COMPETITION_CHOICES.map((competition) => (
          <option key={competition} value={competition}>{FOOTBALL_COMPETITION_LABELS[competition]}</option>
        ))}
      </select>
    </label>
  );
}
