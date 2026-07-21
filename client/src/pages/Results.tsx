import { ReactNode } from "react";
import { LineupSlot, MatchState, SeatId, teamScore } from "@fiveaside/shared/core";
import { ShareCard } from "../components/ShareCard";
import { ScoreBreakdown } from "../components/ScoreBreakdown";
import { LineupCourt } from "../components/TeamPanel";
import { subjectVerb } from "../utils/grammar";

interface Props {
  state: MatchState;
  seatLabel: (seat: SeatId) => string;
  onRematch?: () => void;
  editableSeat?: SeatId | "local" | null;
  onChangeSlot?: (seat: SeatId, playerId: string, slot: LineupSlot) => void;
  subtitle?: string;
  extraActions?: ReactNode;
}

export function Results({ state, seatLabel, onRematch, editableSeat, onChangeSlot, subtitle, extraActions }: Props) {
  const seats: SeatId[] = ["A", "B"];
  const scoreA = teamScore(state.teams.A, state.sport);
  const scoreB = teamScore(state.teams.B, state.sport);
  const winner = state.winner === "tie" ? null : seatLabel(state.winner === "A" ? "A" : "B");

  return (
    <section className="results-shell">
      <div className="results-header">
        <div className="page-eyebrow">FINAL SCORE</div>
        <h2>{state.completionReason === "forfeit"
          ? `${winner} ${subjectVerb(winner ?? "", "win", "wins")} by forfeit.`
          : winner
            ? `${winner} ${subjectVerb(winner, "win", "wins")} the ${state.sport === "soccer" ? "match" : "game"}.`
            : "Dead even."}</h2>
        <div className="final-scoreline">
          <span>{seatLabel("A")} <strong>{scoreA.toFixed(1)}</strong></span>
          <span className="score-divider">&ndash;</span>
          <span><strong>{scoreB.toFixed(1)}</strong> {seatLabel("B")}</span>
        </div>
      </div>
      <div className="results-grid">
        {seats.map((seat) => {
          const team = state.teams[seat];
          const spent = team.roster.reduce((sum, p) => sum + p.price, 0);
          const editable = editableSeat === "local" || editableSeat === seat;
          return (
            <article className="result-team" key={seat}>
              <div className="result-team-header">
                <h3>{seatLabel(seat)}</h3>
                <span>${team.budget} left</span>
              </div>
              <ScoreBreakdown team={team} sport={state.sport} />
              <LineupCourt
                team={team}
                sport={state.sport}
                editable={editable}
                showPlayerScores
                onChangeSlot={onChangeSlot ? (playerId, slot) => onChangeSlot(seat, playerId, slot) : undefined}
              />
              <p className="spent-line">Spent ${spent} of $20</p>
              {state.completionReason !== "forfeit" && <ShareCard state={state} seat={seat} label={seatLabel(seat)} subtitle={subtitle} />}
            </article>
          );
        })}
      </div>
      {onRematch && (
        <div className="action-row">
          <button className="primary" onClick={onRematch}>
            Play again
          </button>
        </div>
      )}
      {extraActions}
    </section>
  );
}
