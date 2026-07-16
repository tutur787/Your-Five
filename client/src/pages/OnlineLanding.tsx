import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { connectMatchmaking, createRoomCode } from "../utils/socket";
import { useSport } from "../hooks/useSport";

export function OnlineLanding() {
  const navigate = useNavigate();
  const matchSocketRef = useRef<WebSocket | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [matchmaking, setMatchmaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { sport } = useSport();

  useEffect(() => {
    return () => {
      matchSocketRef.current?.close();
    };
  }, []);

  const createRoom = async () => {
    setCreating(true);
    setError(null);
    try {
      const { code, token } = await createRoomCode(sport);
      navigate(`/room/${code}?token=${encodeURIComponent(token)}`);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setCreating(false);
    }
  };

  const findRandomOpponent = () => {
    setError(null);
    setMatchmaking(true);

    matchSocketRef.current?.close();
    const socket = connectMatchmaking(sport, (message) => {
      if (message.type === "matchFound") {
        matchSocketRef.current = null;
        navigate(`/room/${message.code}?token=${encodeURIComponent(message.token)}`);
      } else if (message.type === "error") {
        matchSocketRef.current = null;
        setMatchmaking(false);
        setError(message.error);
        socket.close();
      }
    });
    socket.addEventListener("close", () => {
      if (matchSocketRef.current === socket) {
        matchSocketRef.current = null;
        setMatchmaking(false);
        setError("Lost connection while searching for a match.");
      }
    });
    matchSocketRef.current = socket;
  };

  const cancelMatchmaking = () => {
    matchSocketRef.current?.close();
    matchSocketRef.current = null;
    setMatchmaking(false);
  };

  const joinRoom = () => {
    const code = joinCode.trim().toUpperCase();
    if (code) navigate(`/room/${code}`);
  };

  return (
    <div className="game-page online-page">
      <AppHeader eyebrow="MATCHMAKING" title="Play online" detail={`Choose your ${sport === "soccer" ? "football" : "basketball"} matchup`} sportLocked={creating || matchmaking} />
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
