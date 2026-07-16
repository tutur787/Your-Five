import { useCallback, useEffect, useRef, useState } from "react";
import { MatchAction, MatchState, RoomKind, RoomMetadata, SeatId, SeatsFilled } from "@fiveaside/shared/core";
import {
  getOnlineNickname,
  getStoredRoomToken,
  RoomSocket,
  storeOnlineNickname,
  storeRoomToken,
} from "../utils/socket";
import { useSport } from "./useSport";

export type OnlineConnectionStatus = "connecting" | "connected" | "reconnecting" | "cancelled";

const EMPTY_FILLED: SeatsFilled = { A: false, B: false };
const EMPTY_METADATA: RoomMetadata = {
  seatsFilled: EMPTY_FILLED,
  seatNames: {},
  rematchReady: EMPTY_FILLED,
  serverNow: Date.now(),
  turnDeadlineAt: null,
  reconnectingSeat: null,
  reconnectDeadlineAt: null,
};

function localizeMetadata(metadata: RoomMetadata): RoomMetadata {
  const offset = Date.now() - metadata.serverNow;
  return {
    ...metadata,
    serverNow: Date.now(),
    turnDeadlineAt: metadata.turnDeadlineAt === null ? null : metadata.turnDeadlineAt + offset,
    reconnectDeadlineAt: metadata.reconnectDeadlineAt === null ? null : metadata.reconnectDeadlineAt + offset,
  };
}

export function useOnlineMatch(code: string, initialToken: string | null = null) {
  const { setSport } = useSport();
  const socketRef = useRef<RoomSocket | null>(null);
  const tokenRef = useRef(initialToken);
  const seatRef = useRef<SeatId | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [seat, setSeat] = useState<SeatId | null>(null);
  const [metadata, setMetadata] = useState<RoomMetadata>(EMPTY_METADATA);
  const [error, setError] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [roomKind, setRoomKind] = useState<RoomKind | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<OnlineConnectionStatus>("connecting");
  const [matchCancelled, setMatchCancelled] = useState(false);

  useEffect(() => {
    if (!code) return;
    tokenRef.current = initialToken ?? getStoredRoomToken(code);
    seatRef.current = null;
    setState(null);
    setSeat(null);
    setMetadata(EMPTY_METADATA);
    setError(null);
    setOpponentLeft(false);
    setRoomKind(null);
    setConnectionStatus("connecting");
    setMatchCancelled(false);

    let disposed = false;
    let cancelled = false;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const applyMetadata = (next?: RoomMetadata) => {
      if (!next) return;
      const localized = localizeMetadata(next);
      setMetadata(localized);
      if (localized.seatsFilled.A && localized.seatsFilled.B) setOpponentLeft(false);
    };

    const connect = () => {
      if (disposed) return;
      const socket = new RoomSocket(code, tokenRef.current, {
        onMessage: (message) => {
          if (socketRef.current !== socket) return;
          switch (message.type) {
            case "joined":
              attempt = 0;
              setSport(message.sport);
              tokenRef.current = message.token;
              storeRoomToken(code, message.token);
              seatRef.current = message.seat;
              setSeat(message.seat);
              setRoomKind(message.roomKind);
              setState(message.state);
              setConnectionStatus("connected");
              setError(null);
              applyMetadata(message.metadata ?? { ...EMPTY_METADATA, seatsFilled: message.seatsFilled });
              void socket.setNickname(getOnlineNickname()).catch((err: Error) => setError(err.message));
              break;
            case "state":
              setState(message.state);
              applyMetadata(message.metadata);
              break;
            case "roomUpdate":
              applyMetadata(message.metadata ?? { ...EMPTY_METADATA, seatsFilled: message.seatsFilled });
              break;
            case "opponentLeft":
              if (message.seat !== seatRef.current) setOpponentLeft(true);
              break;
            case "matchCancelled":
              cancelled = true;
              setMatchCancelled(true);
              setConnectionStatus("cancelled");
              break;
            case "error":
              setError(message.error);
              break;
          }
        },
        onClose: () => {
          if (disposed || socketRef.current !== socket || cancelled) return;
          socketRef.current = null;
          setConnectionStatus("reconnecting");
          setError(null);
          const delay = Math.min(8000, 500 * 2 ** attempt);
          attempt++;
          reconnectTimer = window.setTimeout(connect, delay);
        },
      });
      socketRef.current = socket;
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [code, initialToken, setSport]);

  const dispatch = useCallback((action: MatchAction) => {
    socketRef.current?.action(action).catch((err: Error) => setError(err.message));
  }, []);

  const startDraft = useCallback(() => {
    socketRef.current?.startDraft().catch((err: Error) => setError(err.message));
  }, []);

  const setNickname = useCallback((nickname: string) => {
    storeOnlineNickname(nickname);
    return socketRef.current?.setNickname(nickname).catch((err: Error) => {
      setError(err.message);
      throw err;
    });
  }, []);

  const setRematchReady = useCallback((ready: boolean) => {
    socketRef.current?.setRematchReady(ready).catch((err: Error) => setError(err.message));
  }, []);

  return {
    state,
    seat,
    seatsFilled: metadata.seatsFilled,
    metadata,
    error,
    opponentLeft,
    roomKind,
    connectionStatus,
    matchCancelled,
    dispatch,
    startDraft,
    setNickname,
    setRematchReady,
  };
}
