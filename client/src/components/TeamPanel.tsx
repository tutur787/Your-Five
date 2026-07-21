import { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import {
  canBuySkip,
  chemistryPairs,
  LineupSlot,
  nextSkipPrice,
  positionPenaltyForSlot,
  ROSTER_SIZE,
  SeatId,
  soccerChemistryPairs,
  Sport,
  slotsForSport,
  TeamState,
  validSlotsFor,
} from "@fiveaside/shared/core";
import { formatLineupSlot, formatPosition } from "../utils/position";

interface Props {
  team: TeamState;
  label: string;
  isActing: boolean;
  editable?: boolean;
  onChangeSlot?: (playerId: string, slot: LineupSlot) => void;
  inCatchUp?: boolean;
  sport: Sport;
}

/** playerId -> names of real-life teammates also on this roster, for the chemistry badge + tooltip. */
export function chemistryPartnersByPlayerId(team: TeamState, sport: Sport): Map<string, string[]> {
  const partners = new Map<string, string[]>();
  const pairs = sport === "soccer" ? soccerChemistryPairs(team) : chemistryPairs(team);
  for (const pair of pairs) {
    const aId = pair.a.player.id;
    const bId = pair.b.player.id;
    if (!partners.has(aId)) partners.set(aId, []);
    if (!partners.has(bId)) partners.set(bId, []);
    partners.get(aId)!.push(pair.b.player.name);
    partners.get(bId)!.push(pair.a.player.name);
  }
  return partners;
}

function lineupEra(player: TeamState["roster"][number]["player"]): string {
  if (player.sport === "basketball") return player.era;
  return player.era.match(/\d{4}(?:\/\d{2})?$/)?.[0] ?? player.era;
}

export function TeamPanel({ team, label, isActing, editable, onChangeSlot, inCatchUp = false, sport }: Props) {
  const skipPrice = nextSkipPrice(team);
  const paidSkipAvailable = canBuySkip(team, inCatchUp);
  const skipLabel = skipPrice === 0
    ? "FREE SKIP READY"
    : skipPrice === null
      ? "SKIPS USED"
      : `$${skipPrice} SKIP ${paidSkipAvailable ? "AVAILABLE" : "LOCKED"}`;
  const skipAvailable = skipPrice === 0 || paidSkipAvailable;

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
        <span className={`skip-tag${skipAvailable ? " available" : ""}`}>
          {skipLabel}
        </span>
        <span className="lineup-label">STARTING FIVE</span>
      </div>
      <LineupCourt team={team} sport={sport} editable={editable} onChangeSlot={onChangeSlot} />
    </div>
  );
}

export function LineupCourt({
  team,
  sport,
  editable,
  onChangeSlot,
}: {
  team: TeamState;
  sport: Sport;
  editable?: boolean;
  onChangeSlot?: (playerId: string, slot: LineupSlot) => void;
}) {
  const partners = chemistryPartnersByPlayerId(team, sport);
  const slots = slotsForSport(sport);
  const [draggedPlayer, setDraggedPlayer] = useState<{
    id: string;
    name: string;
    origin: LineupSlot;
    validSlots: LineupSlot[];
  } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    id: string;
    name: string;
    origin: LineupSlot;
    validSlots: LineupSlot[];
  } | null>(null);
  const [dragPoint, setDragPoint] = useState({ x: 0, y: 0 });
  const [hoveredSlot, setHoveredSlot] = useState<LineupSlot | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, moved: false });
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!selectedPlayer) return;
    const cancel = (event: KeyboardEvent) => event.key === "Escape" && setSelectedPlayer(null);
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [selectedPlayer]);

  const positionAtPoint = (x: number, y: number): LineupSlot | null => {
    const target = document
      .elementsFromPoint(x, y)
      .find((element) => element instanceof HTMLElement && element.dataset.courtPosition);
    return target instanceof HTMLElement ? (target.dataset.courtPosition as LineupSlot) : null;
  };

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>, playerId: string, name: string, origin: LineupSlot) => {
    if (!editable || !onChangeSlot || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const player = team.roster.find((rosterPick) => rosterPick.player.id === playerId)?.player;
    if (!player) return;
    setDraggedPlayer({ id: playerId, name, origin, validSlots: validSlotsFor(player) });
    dragStartRef.current = { x: event.clientX, y: event.clientY, moved: false };
    setDragPoint({ x: event.clientX, y: event.clientY });
    setHoveredSlot(origin);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggedPlayer) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - dragStartRef.current.x, event.clientY - dragStartRef.current.y) > 5) {
      dragStartRef.current.moved = true;
    }
    setDragPoint({ x: event.clientX, y: event.clientY });
    setHoveredSlot(positionAtPoint(event.clientX, event.clientY));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggedPlayer) return;
    const destination = positionAtPoint(event.clientX, event.clientY);
    if (dragStartRef.current.moved && destination && destination !== draggedPlayer.origin) {
      onChangeSlot?.(draggedPlayer.id, destination);
      suppressClickRef.current = true;
    }
    setDraggedPlayer(null);
    setHoveredSlot(null);
  };

  const cancelDrag = () => {
    setDraggedPlayer(null);
    setHoveredSlot(null);
  };
  const choosePlayer = (playerId: string, name: string, origin: LineupSlot) => {
    if (!editable || !onChangeSlot) return;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (selectedPlayer && selectedPlayer.id !== playerId) {
      onChangeSlot(selectedPlayer.id, origin);
      setSelectedPlayer(null);
      return;
    }
    const player = team.roster.find((pick) => pick.player.id === playerId)?.player;
    if (!player) return;
    setSelectedPlayer((current) => current?.id === playerId ? null : { id: playerId, name, origin, validSlots: validSlotsFor(player) });
  };
  const chooseSlot = (slot: LineupSlot) => {
    if (!selectedPlayer || slot === selectedPlayer.origin) return;
    onChangeSlot?.(selectedPlayer.id, slot);
    setSelectedPlayer(null);
  };
  const activateWithKeyboard = (event: ReactKeyboardEvent, action: () => void) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  };
  const slotLabel = formatLineupSlot;
  const movingPlayer = draggedPlayer ?? selectedPlayer;

  return (
    <div
      className={`lineup-court${sport === "soccer" ? " soccer-pitch" : ""}${movingPlayer ? " is-dragging" : ""}`}
      aria-label={`${sport === "soccer" ? "Football" : "Basketball"} starting five lineup`}
      onClick={(event) => { if (event.target === event.currentTarget) setSelectedPlayer(null); }}
    >
      {sport === "soccer" ? (
        <svg className="court-markings pitch-markings" viewBox="0 0 640 760" preserveAspectRatio="none" aria-hidden="true">
          <rect className="pitch-boundary" x="8" y="8" width="624" height="744" />
          <line className="pitch-line" x1="8" y1="8" x2="632" y2="8" />
          <path className="pitch-line" d="M230 8 C230 58 270 98 320 98 C370 98 410 58 410 8" />
          <circle className="pitch-dot" cx="320" cy="8" r="4" />
          <rect className="pitch-line" x="125" y="542" width="390" height="210" />
          <rect className="pitch-line" x="225" y="680" width="190" height="72" />
          <path className="pitch-line" d="M248 542 C260 474 380 474 392 542" />
          <circle className="pitch-dot" cx="320" cy="598" r="4" />
          <rect className="pitch-goal" x="274" y="744" width="92" height="16" />
        </svg>
      ) : (
        <svg className="court-markings" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
          <rect className="court-boundary" x="4" y="4" width="992" height="552" rx="10" />
          <path className="court-three-point" d="M92 4 L92 105 C102 365 270 480 500 480 C730 480 898 365 908 105 L908 4" />
          <rect className="court-key" x="360" y="4" width="280" height="280" />
          <circle className="court-free-throw" cx="500" cy="284" r="90" />
          <line className="court-backboard" x1="454" y1="22" x2="546" y2="22" />
          <circle className="court-rim" cx="500" cy="46" r="13" />
        </svg>
      )}
      {slots.map((pos) => {
        const pick = team.roster.find((p) => p.slot === pos);
        const bondedWith = pick ? partners.get(pick.player.id) : undefined;
        const penalty = pick ? positionPenaltyForSlot(pick.player, pick.slot) : 0;
        const wrongPosition = penalty > 0;
        const dropState = movingPlayer
          ? movingPlayer.validSlots.includes(pos)
            ? " drop-valid"
            : " drop-invalid"
          : "";
        return (
          <div
            className={`court-slot court-slot-${pos}${pick ? " has-player" : ""}${wrongPosition ? " wrong-position" : ""}${dropState}${hoveredSlot === pos ? " drop-hovered" : ""}`}
            key={pos}
            data-court-position={pos}
            onClick={() => { if (!pick) chooseSlot(pos); }}
            onKeyDown={(event) => { if (!pick && selectedPlayer) activateWithKeyboard(event, () => chooseSlot(pos)); }}
            role={!pick && selectedPlayer ? "button" : undefined}
            tabIndex={!pick && selectedPlayer ? 0 : undefined}
            aria-label={!pick && selectedPlayer ? `Move ${selectedPlayer.name} to ${slotLabel(pos)}` : undefined}
          >
            <div className="court-position-target" aria-hidden="true">
              <span>{slotLabel(pos)}</span>
            </div>
            {pick ? (
              <div
                className={`court-player-card${draggedPlayer?.id === pick.player.id ? " dragging-source" : ""}${selectedPlayer?.id === pick.player.id ? " selected-source" : ""}${editable && onChangeSlot ? " draggable" : ""}`}
                onPointerDown={(event) => beginDrag(event, pick.player.id, pick.player.name, pick.slot)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
                onClick={(event) => { event.stopPropagation(); choosePlayer(pick.player.id, pick.player.name, pick.slot); }}
                onKeyDown={(event) => activateWithKeyboard(event, () => choosePlayer(pick.player.id, pick.player.name, pick.slot))}
                role={editable && onChangeSlot ? "button" : undefined}
                tabIndex={editable && onChangeSlot ? 0 : undefined}
                aria-label={editable && onChangeSlot ? `${selectedPlayer ? "Move selected player to" : "Select"} ${pick.player.name} at ${slotLabel(pos)}` : undefined}
              >
                <div className="court-slot-label">{slotLabel(pos)}</div>
                <div className="court-player-main">
                  <span className="court-player-name">
                    {pick.player.name}
                    {bondedWith && (
                      <span className="chemistry-flame" title={`${sport === "soccer" ? "Verified club teammates" : "Real NBA teammates"} with ${bondedWith.join(", ")}`}>
                        LINK
                      </span>
                    )}
                  </span>
                  <span className="court-player-meta">
                    {formatPosition(pick.player)}
                    {pick.player.teamCode ? ` · ${pick.player.teamCode}` : ""}
                  </span>
                  <span className="court-player-era">{lineupEra(pick.player)}</span>
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
