import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { footballCompetitionLabel } from "@fiveaside/shared/core";
import { AppHeader } from "../components/AppHeader";
import { useOnlineMatch } from "../hooks/useOnlineMatch";
import { useRecordProgress } from "../hooks/useRecordProgress";
import { Draft } from "./Draft";
import { getStoredRoomToken, storeRoomToken } from "../utils/socket";

function GraceBanner({ deadlineAt }: { deadlineAt: number | null }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () => setRemaining(deadlineAt ? Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)) : 0);
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadlineAt]);
  return <div className="notice-banner">Opponent reconnecting · {remaining}s remaining</div>;
}

export function RoomPage() {
  const navigate = useNavigate();
  const { code = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryToken = searchParams.get("token");
  const token = queryToken ?? getStoredRoomToken(code);
  const online = useOnlineMatch(code, token);
  const { state, seat, seatsFilled, metadata, error, opponentLeft, roomKind, connectionStatus, matchCancelled, dispatch, startDraft, setRematchReady } = online;
  const [copied, setCopied] = useState(false);
  useRecordProgress(state, roomKind === "matched" ? "online-random" : "online-private", seat);

  useEffect(() => {
    if (!queryToken) return;
    storeRoomToken(code, queryToken);
    const next = new URLSearchParams(searchParams);
    next.delete("token");
    setSearchParams(next, { replace: true });
  }, [code, queryToken, searchParams, setSearchParams]);

  useEffect(() => {
    if (matchCancelled) navigate("/online?auto=1", { replace: true });
  }, [matchCancelled, navigate]);

  const roomLink = `${window.location.origin}/room/${code}`;
  const copyLink = async () => {
    await navigator.clipboard.writeText(roomLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const myLabel = seat ? metadata.seatNames[seat] ?? `Team ${seat}` : "Connecting";
  const labels = {
    A: metadata.seatNames.A ?? "Team A",
    B: metadata.seatNames.B ?? "Team B",
  };
  const myRematchReady = seat ? metadata.rematchReady[seat] : false;
  const otherSeat = seat === "A" ? "B" : "A";
  const otherRematchReady = metadata.rematchReady[otherSeat];
  const competitionDetail = metadata.competition
    ? footballCompetitionLabel(metadata.competition)
    : null;

  const header = (
    <>
      <AppHeader
        eyebrow={roomKind === "matched" ? "ONLINE MATCH" : "PRIVATE ROOM"}
        title={code}
        detail={connectionStatus === "reconnecting"
          ? `Reconnecting${competitionDetail ? ` · ${competitionDetail}` : ""}`
          : `Playing as ${myLabel}${competitionDetail ? ` · ${competitionDetail}` : ""}`}
        actions={roomKind === "private" ? <button className="secondary-button" onClick={copyLink}>{copied ? "Copied" : "Copy invite"}</button> : undefined}
      />
      {connectionStatus === "reconnecting" && <div className="error-banner">Reconnecting to your seat...</div>}
      {opponentLeft && metadata.reconnectDeadlineAt && <GraceBanner deadlineAt={metadata.reconnectDeadlineAt} />}
    </>
  );

  if (!state) {
    return (
      <div className="game-page">
        {header}
        <section className="room-lobby">
          <div className="lobby-status">
            {seatsFilled.A && seatsFilled.B ? (
              <><span className="status-light ready" /><strong>{roomKind === "matched" ? "Preparing your matchup" : "Both GMs are ready"}</strong></>
            ) : (
              <><span className="status-light" /><strong>Waiting for opponent</strong></>
            )}
          </div>
          <div className="room-code-display">{code}</div>
          {roomKind === "private" && <div className="room-link">{roomLink}</div>}
          {roomKind === "private" && seatsFilled.A && seatsFilled.B && <button className="primary lobby-start" onClick={startDraft}>Start draft</button>}
        </section>
        {error && <div className="error-banner">{error}</div>}
      </div>
    );
  }

  const resultActions = state.phase === "complete" ? (
    <div className="online-result-actions">
      <button className={myRematchReady ? "secondary-button" : "primary"} onClick={() => setRematchReady(!myRematchReady)}>
        {myRematchReady ? "Rematch requested" : "Run it back"}
      </button>
      {otherRematchReady && !myRematchReady && <span className="meta">Your opponent wants a rematch.</span>}
      <button className="secondary-button" onClick={() => navigate("/online?auto=1")}>Find new opponent</button>
    </div>
  ) : undefined;

  return (
    <div className="game-page">
      {header}
      <Draft
        state={state}
        dispatch={dispatch}
        error={error}
        mySeat={seat ?? "A"}
        seatNames={labels}
        turnDeadlineAt={metadata.turnDeadlineAt}
        resultsExtra={resultActions}
        resultsSubtitle={`${roomKind === "matched" ? "Online Quick Match" : "Private Match"}${state.sport === "soccer" ? ` · ${footballCompetitionLabel(state.competition)}` : ""}`}
      />
    </div>
  );
}
