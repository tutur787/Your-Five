import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { connectMatchmaking, createRoomCode, getOnlineNickname, normalizeOnlineNickname, storeOnlineNickname } from "../utils/socket";
import { useSport } from "../hooks/useSport";

export function OnlineLanding() {
  const navigate = useNavigate();
  const matchSocketRef = useRef<WebSocket | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [matchmaking, setMatchmaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState(getOnlineNickname);
  const { sport } = useSport();
  const normalizedNickname = normalizeOnlineNickname(nickname);
  const nicknameInvalid = normalizedNickname === null;

  useEffect(() => {
    return () => {
      matchSocketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("auto") === "1") findRandomOpponent();
    // Auto-search is consumed once when arriving from a completed or cancelled room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = async () => {
    if (normalizedNickname === null) return;
    storeOnlineNickname(normalizedNickname);
    setCreating(true);
    setError(null);
    try {
      const { code, token } = await createRoomCode(sport);
      navigate(`/room/${code}?token=${encodeURIComponent(token)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the server.");
    } finally {
      setCreating(false);
    }
  };

  const findRandomOpponent = () => {
    if (normalizedNickname === null) return;
    storeOnlineNickname(normalizedNickname);
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
      <div className="online-identity">
        <label htmlFor="online-nickname">Playing as</label>
        <input
          id="online-nickname"
          value={nickname}
          maxLength={16}
          placeholder="Team name (optional)"
          onChange={(event) => {
            setNickname(event.target.value);
            const normalized = normalizeOnlineNickname(event.target.value);
            if (normalized !== null) storeOnlineNickname(normalized);
          }}
          onBlur={() => {
            if (normalizedNickname !== null) setNickname(normalizedNickname);
          }}
          aria-invalid={nicknameInvalid}
          aria-describedby={nicknameInvalid ? "online-nickname-error" : undefined}
        />
        {nicknameInvalid && <span className="online-nickname-error" id="online-nickname-error">Use 2-16 letters, numbers, spaces, apostrophes, underscores, or hyphens.</span>}
      </div>
      <section className="online-options">
        <button className="online-option primary-option" disabled={creating || matchmaking || nicknameInvalid} onClick={findRandomOpponent}>
          <span className="option-index">01</span>
          <span><strong>{matchmaking ? "Searching" : "Quick match"}</strong><small>Find another GM now</small></span>
          <span aria-hidden="true">&rarr;</span>
        </button>
        <button className="online-option" disabled={creating || matchmaking || nicknameInvalid} onClick={createRoom}>
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
