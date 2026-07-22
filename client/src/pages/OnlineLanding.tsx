import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { PlayerPoolSelect } from "../components/PlayerPoolSelect";
import { connectMatchmaking, createRoomCode, getOnlineNickname, normalizeOnlineNickname, storeOnlineNickname } from "../utils/socket";
import { useSport } from "../hooks/useSport";
import { useAuth } from "../hooks/useAuth";
import { competitionLabel, type Competition } from "@fiveaside/shared";

interface CompetitionDrawState {
  choices: [Competition, Competition];
  selected: Competition;
  active: Competition;
  revealed: boolean;
}

export function OnlineLanding() {
  const navigate = useNavigate();
  const matchSocketRef = useRef<WebSocket | null>(null);
  const drawIntervalRef = useRef<number | null>(null);
  const drawRevealRef = useRef<number | null>(null);
  const drawNavigateRef = useRef<number | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [matchmaking, setMatchmaking] = useState(false);
  const [competitionDraw, setCompetitionDraw] = useState<CompetitionDrawState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState(getOnlineNickname);
  const { sport, basketballCompetition, footballCompetition } = useSport();
  const competitionChoice = sport === "soccer" ? footballCompetition : basketballCompetition;
  const { user } = useAuth();
  const normalizedNickname = normalizeOnlineNickname(nickname);
  const nicknameInvalid = normalizedNickname === null;

  useEffect(() => {
    return () => {
      matchSocketRef.current?.close();
      if (drawIntervalRef.current !== null) window.clearInterval(drawIntervalRef.current);
      if (drawRevealRef.current !== null) window.clearTimeout(drawRevealRef.current);
      if (drawNavigateRef.current !== null) window.clearTimeout(drawNavigateRef.current);
    };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("auto") === "1") findRandomOpponent();
    // Auto-search is consumed once when arriving from a completed or cancelled room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user || nickname.trim() || getOnlineNickname()) return;
    setNickname(user.displayName);
    storeOnlineNickname(user.displayName);
  }, [nickname, user]);

  const createRoom = async () => {
    if (normalizedNickname === null) return;
    storeOnlineNickname(normalizedNickname);
    setCreating(true);
    setError(null);
    try {
      const { code, token } = await createRoomCode(sport, competitionChoice);
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
    setCompetitionDraw(null);

    matchSocketRef.current?.close();
    const socket = connectMatchmaking(sport, competitionChoice, (message) => {
      if (message.type === "matchFound") {
        matchSocketRef.current = null;
        const destination = `/room/${message.code}?token=${encodeURIComponent(message.token)}`;
        if (!message.competitionDraw) {
          navigate(destination);
          return;
        }

        const draw = message.competitionDraw;
        let activeIndex = 0;
        setCompetitionDraw({ ...draw, active: draw.choices[activeIndex], revealed: false });
        drawIntervalRef.current = window.setInterval(() => {
          activeIndex = activeIndex === 0 ? 1 : 0;
          setCompetitionDraw((current) => current ? { ...current, active: draw.choices[activeIndex] } : current);
        }, 360);
        drawRevealRef.current = window.setTimeout(() => {
          if (drawIntervalRef.current !== null) window.clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
          setCompetitionDraw({ ...draw, active: draw.selected, revealed: true });
          drawNavigateRef.current = window.setTimeout(() => navigate(destination), 900);
        }, draw.durationMs);
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
    setCompetitionDraw(null);
  };

  const joinRoom = () => {
    const code = joinCode.trim().toUpperCase();
    if (code) navigate(`/room/${code}`);
  };

  return (
    <div className="game-page online-page">
      <AppHeader eyebrow="MATCHMAKING" title="Play online" detail={`Choose your ${sport === "soccer" ? "football" : "basketball"} matchup`} sportLocked={creating || matchmaking} />
      <PlayerPoolSelect disabled={creating || matchmaking} />
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
        competitionDraw ? (
          <section className={`competition-draw${competitionDraw.revealed ? " revealed" : ""}`} aria-live="polite">
            <span className="competition-draw-kicker">{competitionDraw.revealed ? "Pool selected" : "Choosing the match pool"}</span>
            <div className="competition-draw-options">
              {competitionDraw.choices.map((choice) => (
                <div className={`competition-draw-option${competitionDraw.active === choice ? " active" : ""}`} key={choice}>
                  {competitionLabel(sport, choice)}
                </div>
              ))}
            </div>
            <small>{competitionDraw.revealed ? "Loading your matchup" : "Both pool choices have an equal shot"}</small>
          </section>
        ) : (
          <div className="matchmaking-strip">
            <span className="search-pulse" />
            <span>Looking for an opponent</span>
            <button className="text-button" onClick={cancelMatchmaking}>Cancel</button>
          </div>
        )
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
