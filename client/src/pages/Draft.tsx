import { ReactNode } from "react";
import { actingSeat as computeActingSeat, LineupSlot, MatchAction, MatchState, SeatId } from "@fiveaside/shared/core";
import { seatLabel, TeamPanel } from "../components/TeamPanel";
import { ActionPanel } from "../components/ActionPanel";
import { Results } from "./Results";

interface Props {
  state: MatchState;
  dispatch: (action: MatchAction) => void;
  error?: string | null;
  mySeat: SeatId | "local";
  seatNames?: Partial<Record<SeatId, string>>;
  onRematch?: () => void;
  headerExtra?: ReactNode;
  resultsSubtitle?: string;
  turnDeadlineAt?: number | null;
  resultsExtra?: ReactNode;
}

export function Draft({ state, dispatch, error, mySeat, seatNames, onRematch, headerExtra, resultsSubtitle, turnDeadlineAt, resultsExtra }: Props) {
  const acting = computeActingSeat(state);
  const canAct = mySeat === "local" ? acting !== null : acting === mySeat;
  const label = (seat: SeatId) => seatLabel(seat, seatNames);
  const canEdit = (seat: SeatId) => mySeat === "local" || mySeat === seat;
  const changeSlot = (seat: SeatId) => (playerId: string, slot: LineupSlot) =>
    dispatch({ type: "setSlot", seat, playerId, slot });

  return (
    <div className={`draft-workspace sport-${state.sport}`}>
      {headerExtra}
      {error && <div className="error-banner">{error}</div>}

      {state.phase !== "complete" && (
        <ActionPanel state={state} dispatch={dispatch} canAct={canAct} actingSeat={acting} seatLabel={label} turnDeadlineAt={turnDeadlineAt} />
      )}

      <div className="scoreboard">
        <TeamPanel
          team={state.teams.A}
          label={label("A")}
          isActing={acting === "A"}
          editable={canEdit("A")}
          onChangeSlot={changeSlot("A")}
          inCatchUp={state.phase === "catchUp" && state.turn === "A"}
          sport={state.sport}
          showPlayerScores={state.phase === "complete"}
        />
        <TeamPanel
          team={state.teams.B}
          label={label("B")}
          isActing={acting === "B"}
          editable={canEdit("B")}
          onChangeSlot={changeSlot("B")}
          inCatchUp={state.phase === "catchUp" && state.turn === "B"}
          sport={state.sport}
          showPlayerScores={state.phase === "complete"}
        />
      </div>

      {state.phase === "complete" && (
        <Results
          state={state}
          seatLabel={label}
          onRematch={onRematch}
          editableSeat={mySeat}
          onChangeSlot={(seat, playerId, slot) => dispatch({ type: "setSlot", seat, playerId, slot })}
          subtitle={resultsSubtitle}
          extraActions={resultsExtra}
        />
      )}
    </div>
  );
}
