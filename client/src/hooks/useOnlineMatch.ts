import { useCallback, useEffect, useRef, useState } from "react";
import { MatchAction, MatchState, RoomKind, SeatId, SeatsFilled } from "@fiveaside/shared";
import { RoomSocket, storeRoomToken } from "../utils/socket";
import { useSport } from "./useSport";

export function useOnlineMatch(code: string, token: string | null = null) {
  const { setSport } = useSport();
  const socketRef = useRef<RoomSocket | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [seat, setSeat] = useState<SeatId | null>(null);
  const [seatsFilled, setSeatsFilled] = useState<SeatsFilled>({ A: false, B: false });
  const [error, setError] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [roomKind, setRoomKind] = useState<RoomKind | null>(null);

  useEffect(() => {
    if (!code) return;
    setState(null);
    setSeat(null);
    setSeatsFilled({ A: false, B: false });
    setError(null);
    setOpponentLeft(false);
    setRoomKind(null);

    let manualClose = false;
    const socket = new RoomSocket(code, token, {
      onMessage: (message) => {
        switch (message.type) {
          case "joined":
            setSport(message.sport);
            storeRoomToken(code, message.token);
            setSeat(message.seat);
            setRoomKind(message.roomKind);
            setState(message.state);
            setSeatsFilled(message.seatsFilled);
            if (message.seatsFilled.A && message.seatsFilled.B) setOpponentLeft(false);
            break;
          case "state":
            setState(message.state);
            break;
          case "roomUpdate":
            setSeatsFilled(message.seatsFilled);
            if (message.seatsFilled.A && message.seatsFilled.B) setOpponentLeft(false);
            break;
          case "opponentLeft":
            setOpponentLeft(true);
            break;
          case "error":
            setError(message.error);
            break;
        }
      },
      onClose: () => {
        if (!manualClose) setError("Disconnected from the server.");
      },
    });
    socketRef.current = socket;

    return () => {
      manualClose = true;
      socket.close();
      socketRef.current = null;
    };
  }, [code, token, setSport]);

  const dispatch = useCallback((action: MatchAction) => {
    socketRef.current?.action(action).catch((err: Error) => setError(err.message));
  }, []);

  const startDraft = useCallback(() => {
    socketRef.current?.startDraft().catch((err: Error) => setError(err.message));
  }, []);

  return { state, seat, seatsFilled, error, opponentLeft, roomKind, dispatch, startDraft };
}
