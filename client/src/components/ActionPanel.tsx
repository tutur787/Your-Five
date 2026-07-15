import { useEffect, useState } from "react";
import { availablePlacementSlots, MatchAction, MatchState, maxAffordable, PlayerCard, SeatId, validSlotsFor } from "@fiveaside/shared";
import { formatPosition } from "../utils/position";

interface Props {
  state: MatchState;
  dispatch: (action: MatchAction) => void;
  canAct: boolean;
  actingSeat: SeatId | null;
  seatLabel: (seat: SeatId) => string;
}

const TIMER_SECONDS = 15;

function StatLine({ player }: { player: PlayerCard }) {
  const { ppg, rpg, apg, spg, bpg } = player.stats;
  const stats: Array<[string, number]> = [
    ["PPG", ppg],
    ["RPG", rpg],
    ["APG", apg],
    ...(spg !== undefined ? [["SPG", spg] as [string, number]] : []),
    ...(bpg !== undefined ? [["BPG", bpg] as [string, number]] : []),
  ];
  return (
    <div className="player-stat-grid">
      {stats.map(([label, value]) => (
        <span className="player-stat" key={label}><strong>{value.toFixed(1)}</strong><small>{label}</small></span>
      ))}
    </div>
  );
}

function PlayerSpotlight({ player }: { player: PlayerCard }) {
  return (
    <div className="player-spotlight">
      <span className="player-position-badge">{formatPosition(player)}</span>
      <div className="player-nameplate">
        <h2>{player.name}</h2>
        <span>{player.era} EDITION</span>
      </div>
    </div>
  );
}

const RING_RADIUS = 19;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Purely a pacing/feel countdown — nothing times out or auto-acts, it just adds auction pressure.
 * The ring sweep is driven entirely by a CSS animation (remounted via `key={resetKey}` so it
 * restarts cleanly every time), so it stays perfectly smooth regardless of React's render cadence;
 * the numeric label underneath is the only piece driven by the per-second JS interval.
 */
function Countdown({ resetKey, seconds = TIMER_SECONDS }: { resetKey: string; seconds?: number }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resetKey, seconds]);

  const urgent = remaining <= 5;

  return (
    <div className={`countdown-ring${urgent ? " urgent" : ""}`} key={resetKey}>
      <svg viewBox="0 0 44 44" className="countdown-ring-svg">
        <circle className="countdown-ring-track" cx="22" cy="22" r={RING_RADIUS} />
        <circle
          className="countdown-ring-progress"
          cx="22"
          cy="22"
          r={RING_RADIUS}
          style={{
            strokeDasharray: RING_CIRCUMFERENCE,
            animationDuration: `${seconds}s`,
          }}
        />
      </svg>
      <span className="countdown-ring-number">{remaining}</span>
    </div>
  );
}

export function ActionPanel({ state, dispatch, canAct, actingSeat, seatLabel }: Props) {
  if (state.phase === "complete") return null;

  if (!canAct || !actingSeat) {
    const waitingOn = actingSeat ? seatLabel(actingSeat) : "the other player";
    return (
      <section className="action-stage waiting-stage">
        <span className="search-pulse" />
        <div><span className="page-eyebrow">POSSESSION</span><strong>Waiting on {waitingOn}</strong></div>
      </section>
    );
  }

  if (state.phase === "onTheClock") {
    return <RevealPanel state={state} seat={actingSeat} dispatch={dispatch} seatLabel={seatLabel} />;
  }

  if (state.phase === "bidding" && state.auction) {
    const auction = state.auction;
    const cap = maxAffordable(state.teams[actingSeat]);
    return (
      <section className="action-stage live-stage">
        <div className="auction-box">
          <div className="action-stage-top">
            <div className="auction-eyebrow"><span className="live-dot" /> LIVE AUCTION</div>
            <Countdown resetKey={`bid-${auction.player.id}-${auction.currentBid}`} />
          </div>
          <div className="auction-context">
            <span className="standing-bidder-tag">{seatLabel(auction.standingBidder)}</span> is offering to buy{" "}
            <strong>{auction.player.name}</strong>
          </div>
          <PlayerSpotlight player={auction.player} />
          <StatLine player={auction.player} />
          <div className="price-block" key={auction.currentBid}>
            <span>CURRENT BID</span><strong>${auction.currentBid}</strong>
          </div>
          <RaiseControls
            currentBid={auction.currentBid}
            max={cap}
            onRaise={(amount) => dispatch({ type: "raiseBid", seat: actingSeat, amount })}
          />
          <div className="action-row">
            <button className="success" onClick={() => dispatch({ type: "acceptBid", seat: actingSeat })}>
              Let them have it for ${auction.currentBid}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (state.phase === "skipOffer" && state.skipOffer) {
    const offer = state.skipOffer;
    return (
      <section className="action-stage">
        <div className="skip-box">
          <div className="action-stage-top">
            <div className="auction-eyebrow neutral">SKIP OFFER</div>
            <Countdown resetKey={`skip-${offer.player.id}`} />
          </div>
          <div className="auction-context">{seatLabel(offer.skippedBy)} passed. Your call.</div>
          <PlayerSpotlight player={offer.player} />
          <StatLine player={offer.player} />
          <div className="price-block"><span>TAKE PRICE</span><strong>$1</strong></div>
          <div className="action-row">
            <button className="success" onClick={() => dispatch({ type: "respondToSkip", seat: actingSeat, accept: true })}>
              Add for $1
            </button>
            <button className="danger" onClick={() => dispatch({ type: "respondToSkip", seat: actingSeat, accept: false })}>
              Pass
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (state.phase === "placing" && state.pendingPlacement) {
    return <PlacementPanel state={state} seat={actingSeat} dispatch={dispatch} seatLabel={seatLabel} />;
  }

  return null;
}

function PlacementPanel({
  state,
  seat,
  dispatch,
  seatLabel,
}: {
  state: MatchState;
  seat: SeatId;
  dispatch: (action: MatchAction) => void;
  seatLabel: (seat: SeatId) => string;
}) {
  const pending = state.pendingPlacement!;
  const team = state.teams[seat];
  const slots = availablePlacementSlots(team, pending.player);
  const listedSlots = validSlotsFor(pending.player);
  const listedOpen = slots.some((slot) => listedSlots.includes(slot));

  return (
    <section className="action-stage">
      <div className="placement-box">
        <div className="action-stage-top"><div className="auction-eyebrow neutral">ROSTER MOVE</div></div>
        <div className="auction-context">{seatLabel(seat)} wins the card for ${pending.price}</div>
        <PlayerSpotlight player={pending.player} />
        <StatLine player={pending.player} />
        <div className="placement-copy">
          {listedOpen ? "Choose an open listed position." : "Listed positions are full. Choose any open slot."}
        </div>
        <div className="position-choice-row">
          {slots.map((slot) => (
            <button
              key={slot}
              className={listedSlots.includes(slot) ? "primary position-choice" : "position-choice"}
              onClick={() => dispatch({ type: "placePick", seat, slot })}
            >
              {slot}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

const QUICK_RAISE_INCREMENTS = [1, 5, 10];

/** Quick-tap chips for the common raises, plus a stepper for a precise custom amount — both capped at `max`. */
function RaiseControls({ currentBid, max, onRaise }: { currentBid: number; max: number; onRaise: (amount: number) => void }) {
  const min = currentBid + 1;
  const [amount, setAmount] = useState(Math.min(min, max));

  useEffect(() => {
    setAmount(Math.min(min, max));
  }, [min, max]);

  const chipValues = QUICK_RAISE_INCREMENTS.map((inc) => currentBid + inc).filter(
    (value, index, arr) => value <= max && arr.indexOf(value) === index
  );
  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  if (min > max) {
    return <div className="meta raise-unavailable">You can't afford to raise any further.</div>;
  }

  return (
    <div className="raise-controls">
      <div className="raise-chip-row">
        {chipValues.map((value) => (
          <button key={value} className="raise-chip" onClick={() => onRaise(value)}>
            ${value}
          </button>
        ))}
      </div>
      <div className="raise-stepper">
        <button
          type="button"
          className="stepper-btn"
          disabled={amount <= min}
          onClick={() => setAmount((a) => clamp(a - 1))}
          aria-label="Decrease custom bid"
        >
          &minus;
        </button>
        <span className="stepper-value">${amount}</span>
        <button
          type="button"
          className="stepper-btn"
          disabled={amount >= max}
          onClick={() => setAmount((a) => clamp(a + 1))}
          aria-label="Increase custom bid"
        >
          +
        </button>
        <button className="primary raise-submit" onClick={() => onRaise(clamp(amount))}>
          Raise to ${clamp(amount)}
        </button>
      </div>
    </div>
  );
}

function RevealPanel({
  state,
  seat,
  dispatch,
  seatLabel,
}: {
  state: MatchState;
  seat: SeatId;
  dispatch: (action: MatchAction) => void;
  seatLabel: (seat: SeatId) => string;
}) {
  const player = state.pool[0];
  const team = state.teams[seat];
  const skipAvailable = !team.skipUsed;
  const cap = maxAffordable(team);
  const [bid, setBid] = useState(1);

  useEffect(() => {
    setBid(1);
  }, [player?.id]);

  if (!player) {
    return (
      <section className="action-stage">
        <div className="waiting">No players left in the pool.</div>
      </section>
    );
  }

  const clamp = (v: number) => Math.max(1, Math.min(cap, v));
  const chipValues = [1, 2, 5].filter((v, i, arr) => v <= cap && arr.indexOf(v) === i);

  return (
    <section className="action-stage reveal-stage">
      <div className="reveal-box">
        <div className="action-stage-top">
          <div>
            <div className="page-eyebrow">ON THE CLOCK</div>
            <strong className="acting-name">{seatLabel(seat)}</strong>
          </div>
          <Countdown resetKey={`reveal-${player.id}`} />
        </div>
        <PlayerSpotlight player={player} />
        <StatLine player={player} />
        <div className="raise-controls opening-controls">
          <div className="raise-chip-row">
            {chipValues.map((value) => (
              <button
                key={value}
                className="raise-chip"
                onClick={() => dispatch({ type: "openBid", seat, startBid: value })}
              >
                ${value}
              </button>
            ))}
          </div>
          <div className="raise-stepper">
            <button
              type="button"
              className="stepper-btn"
              disabled={bid <= 1}
              onClick={() => setBid((b) => clamp(b - 1))}
              aria-label="Decrease starting bid"
            >
              &minus;
            </button>
            <span className="stepper-value">${bid}</span>
            <button
              type="button"
              className="stepper-btn"
              disabled={bid >= cap}
              onClick={() => setBid((b) => clamp(b + 1))}
              aria-label="Increase starting bid"
            >
              +
            </button>
            <button className="primary raise-submit" onClick={() => dispatch({ type: "openBid", seat, startBid: clamp(bid) })}>
              Open at ${clamp(bid)}
            </button>
          </div>
        </div>
        <div className="action-row">
          <button
            className="danger"
            disabled={!skipAvailable}
            title={skipAvailable ? "Use your one-time skip" : "You've already used your skip"}
            onClick={() => dispatch({ type: "useSkip", seat })}
          >
            Skip card
          </button>
        </div>
      </div>
    </section>
  );
}
