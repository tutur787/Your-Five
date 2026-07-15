import { useCallback, useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";
import { MatchAction, MatchState, SeatId } from "@fiveaside/shared";
import { createSocket } from "../utils/socket";

interface JoinAck {
  ok: boolean;
  error?: string;
  seat?: SeatId;
  code?: string;
  state?: MatchState | null;
  full?: boolean;
}

interface SimpleAck {
  ok: boolean;
  error?: string;
}

export function useOnlineMatch(code: string) {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [seat, setSeat] = useState<SeatId | null>(null);
  const [seatsFilled, setSeatsFilled] = useState({ A: false, B: false });
  const [error, setError] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);

  useEffect(() => {
    if (!code) return;
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("joinRoom", { code }, (ack: JoinAck) => {
        if (!ack.ok) {
          setError(ack.error ?? "Could not join room.");
          return;
        }
        setSeat(ack.seat ?? null);
        setState(ack.state ?? null);
        if (ack.full) setSeatsFilled({ A: true, B: true });
      });
    });

    socket.on("state", (s: MatchState) => setState(s));
    socket.on("roomUpdate", (payload: { seatsFilled: { A: boolean; B: boolean } }) => {
      setSeatsFilled(payload.seatsFilled);
    });
    socket.on("opponentLeft", () => setOpponentLeft(true));
    socket.on("connect_error", () => setError("Couldn't reach the server."));

    return () => {
      socket.disconnect();
    };
  }, [code]);

  const dispatch = useCallback(
    (action: MatchAction) => {
      socketRef.current?.emit("action", { code, action }, (ack: SimpleAck) => {
        setError(ack.ok ? null : ack.error ?? "Invalid action");
      });
    },
    [code]
  );

  const startDraft = useCallback(() => {
    socketRef.current?.emit("startDraft", { code }, (ack: SimpleAck) => {
      if (!ack.ok) setError(ack.error ?? "Could not start draft.");
    });
  }, [code]);

  return { state, seat, seatsFilled, error, opponentLeft, dispatch, startDraft };
}
