import { MatchState, Position, SeatId, teamScore } from "@fiveaside/shared";
import { ShareCard } from "../components/ShareCard";
import { ScoreBreakdown } from "../components/ScoreBreakdown";
import { LineupCourt } from "../components/TeamPanel";

interface Props {
  state: MatchState;
  seatLabel: (seat: SeatId) => string;
  onRematch?: () => void;
  editableSeat?: SeatId | "local" | null;
  onChangeSlot?: (seat: SeatId, playerId: string, slot: Position) => void;
  subtitle?: string;
}

export function Results({ state, seatLabel, onRematch, editableSeat, onChangeSlot, subtitle }: Props) {
  const seats: SeatId[] = ["A", "B"];
  const scoreA = teamScore(state.teams.A);
  const scoreB = teamScore(state.teams.B);

  return (
    <section className="results-shell">
      <div className="results-header">
        <div className="page-eyebrow">FINAL SCORE</div>
        <h2>{state.winner === "tie" ? "Dead even." : `${seatLabel(state.winner === "A" ? "A" : "B")} takes it.`}</h2>
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
              <ScoreBreakdown team={team} defaultOpen />
              <LineupCourt
                team={team}
                editable={editable}
                onChangeSlot={onChangeSlot ? (playerId, slot) => onChangeSlot(seat, playerId, slot) : undefined}
              />
              <p className="spent-line">Spent ${spent} of $20</p>
              <ShareCard state={state} seat={seat} label={seatLabel(seat)} subtitle={subtitle} />
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
    </section>
  );
}
