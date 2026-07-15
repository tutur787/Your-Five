import { PointerEvent as ReactPointerEvent, useState } from "react";
import {
  chemistryPairs,
  Position,
  positionPenaltyForSlot,
  POSITIONS,
  ROSTER_SIZE,
  SeatId,
  TeamState,
  validSlotsFor,
} from "@fiveaside/shared";
import { formatPosition } from "../utils/position";
import { ScoreBreakdown } from "./ScoreBreakdown";

interface Props {
  team: TeamState;
  label: string;
  isActing: boolean;
  editable?: boolean;
  onChangeSlot?: (playerId: string, slot: Position) => void;
}

/** playerId -> names of real-life teammates also on this roster, for the chemistry badge + tooltip. */
export function chemistryPartnersByPlayerId(team: TeamState): Map<string, string[]> {
  const partners = new Map<string, string[]>();
  for (const pair of chemistryPairs(team)) {
    const aId = pair.a.player.id;
    const bId = pair.b.player.id;
    if (!partners.has(aId)) partners.set(aId, []);
    if (!partners.has(bId)) partners.set(bId, []);
    partners.get(aId)!.push(pair.b.player.name);
    partners.get(bId)!.push(pair.a.player.name);
  }
  return partners;
}

export function TeamPanel({ team, label, isActing, editable, onChangeSlot }: Props) {
  return (
    <div className={`team-panel${isActing ? " acting" : ""}`}>
      <div className="team-panel-header">
        <div className="team-identity">
          <span className="team-label">{label}</span>
          {isActing && <span className="possession-tag"><span /> ON CLOCK</span>}
        </div>
        <div className="team-numbers">
          <span className="roster-count">{team.roster.length}<small>/{ROSTER_SIZE}</small></span>
          <span className="budget"><small>CAP</small>${team.budget}</span>
        </div>
      </div>
      <div className="team-utility-row">
        <span className={`skip-tag${team.skipUsed ? "" : " available"}`}>
          {team.skipUsed ? "SKIP USED" : "SKIP READY"}
        </span>
        <span className="lineup-label">STARTING FIVE</span>
      </div>
      <LineupCourt team={team} editable={editable} onChangeSlot={onChangeSlot} />
      {team.roster.length > 0 && <ScoreBreakdown team={team} />}
    </div>
  );
}

export function LineupCourt({
  team,
  editable,
  onChangeSlot,
}: {
  team: TeamState;
  editable?: boolean;
  onChangeSlot?: (playerId: string, slot: Position) => void;
}) {
  const partners = chemistryPartnersByPlayerId(team);
  const [draggedPlayer, setDraggedPlayer] = useState<{
    id: string;
    name: string;
    origin: Position;
    validSlots: Position[];
  } | null>(null);
  const [dragPoint, setDragPoint] = useState({ x: 0, y: 0 });
  const [hoveredSlot, setHoveredSlot] = useState<Position | null>(null);

  const positionAtPoint = (x: number, y: number): Position | null => {
    const target = document
      .elementsFromPoint(x, y)
      .find((element) => element instanceof HTMLElement && element.dataset.courtPosition);
    return target instanceof HTMLElement ? (target.dataset.courtPosition as Position) : null;
  };

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>, playerId: string, name: string, origin: Position) => {
    if (!editable || !onChangeSlot || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const player = team.roster.find((rosterPick) => rosterPick.player.id === playerId)?.player;
    if (!player) return;
    setDraggedPlayer({ id: playerId, name, origin, validSlots: validSlotsFor(player) });
    setDragPoint({ x: event.clientX, y: event.clientY });
    setHoveredSlot(origin);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggedPlayer) return;
    event.preventDefault();
    setDragPoint({ x: event.clientX, y: event.clientY });
    setHoveredSlot(positionAtPoint(event.clientX, event.clientY));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggedPlayer) return;
    const destination = positionAtPoint(event.clientX, event.clientY);
    if (destination && destination !== draggedPlayer.origin) {
      onChangeSlot?.(draggedPlayer.id, destination);
    }
    setDraggedPlayer(null);
    setHoveredSlot(null);
  };

  const cancelDrag = () => {
    setDraggedPlayer(null);
    setHoveredSlot(null);
  };

  return (
    <div className={`lineup-court${draggedPlayer ? " is-dragging" : ""}`} aria-label="Starting five lineup">
      <svg className="court-markings" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
        <rect className="court-boundary" x="4" y="4" width="992" height="552" rx="10" />
        <path className="court-three-point" d="M92 4 L92 105 C102 365 270 480 500 480 C730 480 898 365 908 105 L908 4" />
        <rect className="court-key" x="360" y="4" width="280" height="280" />
        <circle className="court-free-throw" cx="500" cy="284" r="90" />
        <line className="court-backboard" x1="454" y1="22" x2="546" y2="22" />
        <circle className="court-rim" cx="500" cy="46" r="13" />
      </svg>
      {POSITIONS.map((pos) => {
        const pick = team.roster.find((p) => p.slot === pos);
        const bondedWith = pick ? partners.get(pick.player.id) : undefined;
        const penalty = pick ? positionPenaltyForSlot(pick.player, pick.slot) : 0;
        const wrongPosition = penalty > 0;
        const dropState = draggedPlayer
          ? draggedPlayer.validSlots.includes(pos)
            ? " drop-valid"
            : " drop-invalid"
          : "";
        return (
          <div
            className={`court-slot court-slot-${pos}${pick ? " has-player" : ""}${wrongPosition ? " wrong-position" : ""}${dropState}${hoveredSlot === pos ? " drop-hovered" : ""}`}
            key={pos}
            data-court-position={pos}
          >
            <div className="court-position-target" aria-hidden="true">
              <span>{pos}</span>
            </div>
            {pick ? (
              <div
                className={`court-player-card${draggedPlayer?.id === pick.player.id ? " dragging-source" : ""}${editable && onChangeSlot ? " draggable" : ""}`}
                onPointerDown={(event) => beginDrag(event, pick.player.id, pick.player.name, pick.slot)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
                role={editable && onChangeSlot ? "button" : undefined}
                tabIndex={editable && onChangeSlot ? 0 : undefined}
                aria-label={editable && onChangeSlot ? `Drag ${pick.player.name} to change position` : undefined}
              >
                <div className="court-slot-label">{pos}</div>
                <div className="court-player-main">
                  <span className="court-player-name">
                    {pick.player.name}
                    {bondedWith && (
                      <span className="chemistry-flame" title={`Real NBA teammates with ${bondedWith.join(", ")}`}>
                        LINK
                      </span>
                    )}
                  </span>
                  <span className="court-player-meta">
                    {formatPosition(pick.player)} · {pick.player.era}
                  </span>
                </div>
                <div className="court-player-controls">
                  <span className="price-inline">${pick.price}</span>
                  {wrongPosition && <span className="mismatch-pill">-{penalty}</span>}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      {draggedPlayer && (
        <div className="court-drag-ghost" style={{ left: dragPoint.x, top: dragPoint.y }} aria-hidden="true">
          <strong>{draggedPlayer.name}</strong>
          <span>{hoveredSlot ?? "Move"}</span>
        </div>
      )}
    </div>
  );
}

export function seatLabel(seat: SeatId, names?: Partial<Record<SeatId, string>>): string {
  return names?.[seat] ?? `Team ${seat}`;
}
