import {
  BASKETBALL_COMPETITION_CHOICES,
  BASKETBALL_COMPETITION_LABELS,
  FOOTBALL_COMPETITION_CHOICES,
  FOOTBALL_COMPETITION_LABELS,
  type BasketballCompetitionChoice,
  type FootballCompetitionChoice,
} from "@fiveaside/shared/core";
import { useSport } from "../hooks/useSport";

export function PlayerPoolSelect({ disabled = false }: { disabled?: boolean }) {
  const {
    sport,
    basketballCompetition,
    setBasketballCompetition,
    footballCompetition,
    setFootballCompetition,
  } = useSport();
  const basketball = sport === "basketball";
  const choices = basketball ? BASKETBALL_COMPETITION_CHOICES : FOOTBALL_COMPETITION_CHOICES;
  const value = basketball ? basketballCompetition : footballCompetition;
  const sportName = basketball ? "Basketball" : "Football";

  return (
    <label className={`football-competition-select${disabled ? " disabled" : ""}`}>
      <span className="football-competition-heading">
        <span className="page-eyebrow">PLAYER POOL</span>
        <strong>{sportName} competition</strong>
      </span>
      <select
        aria-label={`${sportName} competition`}
        value={value}
        disabled={disabled}
        title={disabled ? `Return home to change the ${sportName.toLowerCase()} competition` : `${sportName} competition`}
        onChange={(event) => {
          if (basketball) setBasketballCompetition(event.target.value as BasketballCompetitionChoice);
          else setFootballCompetition(event.target.value as FootballCompetitionChoice);
        }}
      >
        {choices.map((competition) => (
          <option key={competition} value={competition}>
            {basketball
              ? BASKETBALL_COMPETITION_LABELS[competition as BasketballCompetitionChoice]
              : FOOTBALL_COMPETITION_LABELS[competition as FootballCompetitionChoice]}
          </option>
        ))}
      </select>
    </label>
  );
}
