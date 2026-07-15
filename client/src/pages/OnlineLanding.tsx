import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Socket } from "socket.io-client";
import { MatchAction, MatchState, SeatId } from "@fiveaside/shared";
import { AppHeader } from "../components/AppHeader";
import { createSocket } from "../utils/socket";
import { Draft } from "./Draft";

interface SimpleAck {
  ok: boolean;
  error?: string;
}

interface FindMatchAck extends SimpleAck {
  status?: "waiting" | "matched";
  code?: string;
  seat?: SeatId;
  state?: MatchState;
}

interface MatchFoundPayload {
  code: string;
  seat: SeatId;
  state: MatchState;
}

export function OnlineLanding() {
  const navigate = useNavigate();
  const matchSocketRef = useRef<Socket | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [matchmaking, setMatchmaking] = useState(false);
  const [matchCode, setMatchCode] = useState<string | null>(null);
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [matchSeat, setMatchSeat] = useState<SeatId | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      matchSocketRef.current?.disconnect();
    };
  }, []);

  const createRoom = () => {
    setCreating(true);
    setError(null);
    const socket = createSocket();
    socket.on("connect", () => {
      socket.emit("createRoom", {}, (ack: { ok: boolean; code?: string; error?: string }) => {
        socket.disconnect();
        setCreating(false);
        if (ack.ok && ack.code) navigate(`/room/${ack.code}`);
        else setError(ack.error ?? "Could not create room.");
      });
    });
    socket.on("connect_error", () => {
      setCreating(false);
      setError("Couldn't reach the server.");
    });
  };

  const handleMatchFound = (payload: MatchFoundPayload) => {
    setMatchCode(payload.code);
    setMatchSeat(payload.seat);
    setMatchState(payload.state);
    setMatchmaking(false);
    setOpponentLeft(false);
    setError(null);
  };

  const findRandomOpponent = () => {
    setError(null);
    setOpponentLeft(false);
    setMatchState(null);
    setMatchSeat(null);
    setMatchCode(null);
    setMatchmaking(true);

    matchSocketRef.current?.disconnect();
    const socket = createSocket();
    matchSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("findMatch", {}, (ack: FindMatchAck) => {
        if (!ack.ok) {
          setMatchmaking(false);
          setError(ack.error ?? "Could not start matchmaking.");
          return;
        }
        if (ack.status === "matched" && ack.code && ack.seat && ack.state) {
          handleMatchFound({ code: ack.code, seat: ack.seat, state: ack.state });
        }
      });
    });

    socket.on("matchFound", handleMatchFound);
    socket.on("state", (state: MatchState) => setMatchState(state));
    socket.on("opponentLeft", () => setOpponentLeft(true));
    socket.on("connect_error", () => {
      setMatchmaking(false);
      setError("Couldn't reach the server.");
    });
  };

  const cancelMatchmaking = () => {
    matchSocketRef.current?.emit("cancelMatchmaking");
    matchSocketRef.current?.disconnect();
    matchSocketRef.current = null;
    setMatchmaking(false);
  };

  const dispatch = useCallback(
    (action: MatchAction) => {
      if (!matchCode) return;
      matchSocketRef.current?.emit("action", { code: matchCode, action }, (ack: SimpleAck) => {
        setError(ack.ok ? null : ack.error ?? "Invalid action");
      });
    },
    [matchCode]
  );

  const joinRoom = () => {
    const code = joinCode.trim().toUpperCase();
    if (code) navigate(`/room/${code}`);
  };

  if (matchState && matchSeat) {
    const opponentSeat: SeatId = matchSeat === "A" ? "B" : "A";
    const seatNames: Partial<Record<SeatId, string>> = { [matchSeat]: "You", [opponentSeat]: "Opponent" };

    return (
      <div className="game-page">
        <AppHeader eyebrow="ONLINE MATCH" title="Live opponent" detail={`You are Team ${matchSeat}`} />
        {opponentLeft && <div className="error-banner">Your opponent disconnected.</div>}
        <Draft state={matchState} dispatch={dispatch} error={error} mySeat={matchSeat} seatNames={seatNames} />
      </div>
    );
  }

  return (
    <div className="game-page online-page">
      <AppHeader eyebrow="MATCHMAKING" title="Play online" detail="Choose your matchup" />
      <section className="online-options">
        <button className="online-option primary-option" disabled={creating || matchmaking} onClick={findRandomOpponent}>
          <span className="option-index">01</span>
          <span><strong>{matchmaking ? "Searching" : "Quick match"}</strong><small>Find another GM now</small></span>
          <span aria-hidden="true">&rarr;</span>
        </button>
        <button className="online-option" disabled={creating || matchmaking} onClick={createRoom}>
          <span className="option-index">02</span>
          <span><strong>{creating ? "Creating room" : "Invite a friend"}</strong><small>Start a private matchup</small></span>
          <span aria-hidden="true">&rarr;</span>
        </button>
        <form className="join-room" onSubmit={(event) => { event.preventDefault(); joinRoom(); }}>
          <div className="join-room-label">
            <span className="option-index">03</span>
            <strong>Join a room</strong>
          </div>
          <input
            type="text"
            placeholder="Room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button className="primary" type="submit" disabled={!joinCode.trim()}>
            Join
          </button>
        </form>
      </section>
      {matchmaking && (
        <div className="matchmaking-strip">
          <span className="search-pulse" />
          <span>Looking for an opponent</span>
          <button className="text-button" onClick={cancelMatchmaking}>Cancel</button>
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
