import { useState } from "react";
import { useParams } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { useOnlineMatch } from "../hooks/useOnlineMatch";
import { Draft } from "./Draft";

export function RoomPage() {
  const { code = "" } = useParams();
  const { state, seat, seatsFilled, error, opponentLeft, dispatch, startDraft } = useOnlineMatch(code);
  const [copied, setCopied] = useState(false);

  const roomLink = `${window.location.origin}/room/${code}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(roomLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const header = (
    <>
      <AppHeader
        eyebrow="PRIVATE ROOM"
        title={code}
        detail={seat ? `You are Team ${seat}` : "Connecting"}
        actions={<button className="secondary-button" onClick={copyLink}>{copied ? "Copied" : "Copy invite"}</button>}
      />
      {opponentLeft && <div className="error-banner">Your opponent disconnected.</div>}
    </>
  );

  if (!state) {
    return (
      <div className="game-page">
        {header}
        <section className="room-lobby">
          <div className="lobby-status">
            {seatsFilled.A && seatsFilled.B ? (
              <><span className="status-light ready" /><strong>Both GMs are ready</strong></>
            ) : (
              <><span className="status-light" /><strong>Waiting for opponent</strong></>
            )}
          </div>
          <div className="room-code-display">{code}</div>
          <div className="room-link">{roomLink}</div>
          {seatsFilled.A && seatsFilled.B && <button className="primary lobby-start" onClick={startDraft}>Start draft</button>}
        </section>
        {error && <div className="error-banner">{error}</div>}
      </div>
    );
  }

  return (
    <div className="game-page">
      {header}
      <Draft state={state} dispatch={dispatch} error={error} mySeat={seat ?? "A"} />
    </div>
  );
}
