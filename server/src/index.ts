import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { MatchAction } from "@fiveaside/shared";
import { applyRoomAction, createMatchedRoom, createRoom, joinRoom, leaveSocket, startDraft } from "./rooms";

const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const ACTION_TYPES = new Set(["openBid", "raiseBid", "acceptBid", "useSkip", "respondToSkip", "placePick", "setSlot"]);
let waitingSocketId: string | null = null;

io.on("connection", (socket) => {
  socket.on("createRoom", (_payload, ack?: (res: unknown) => void) => {
    const room = createRoom();
    socket.join(room.code);
    ack?.({ ok: true, code: room.code });
  });

  socket.on("joinRoom", (payload: { code: string }, ack?: (res: unknown) => void) => {
    const res = joinRoom(payload?.code ?? "", socket.id);
    if ("error" in res) {
      ack?.({ ok: false, error: res.error });
      return;
    }
    socket.join(res.room.code);
    ack?.({ ok: true, seat: res.seat, code: res.room.code, state: res.room.state, full: !!(res.room.seats.A && res.room.seats.B) });
    io.to(res.room.code).emit("roomUpdate", {
      seatsFilled: { A: !!res.room.seats.A, B: !!res.room.seats.B },
    });
  });

  socket.on("findMatch", (_payload, ack?: (res: unknown) => void) => {
    if (waitingSocketId === socket.id) {
      ack?.({ ok: true, status: "waiting" });
      return;
    }

    const waitingSocket = waitingSocketId ? io.sockets.sockets.get(waitingSocketId) : undefined;
    if (waitingSocket && waitingSocket.id !== socket.id) {
      const room = createMatchedRoom(waitingSocket.id, socket.id);
      waitingSocket.join(room.code);
      socket.join(room.code);
      waitingSocketId = null;

      waitingSocket.emit("matchFound", { code: room.code, seat: "A", state: room.state });
      socket.emit("matchFound", { code: room.code, seat: "B", state: room.state });
      ack?.({ ok: true, status: "matched", code: room.code, seat: "B", state: room.state });
      return;
    }

    waitingSocketId = socket.id;
    ack?.({ ok: true, status: "waiting" });
  });

  socket.on("cancelMatchmaking", () => {
    if (waitingSocketId === socket.id) waitingSocketId = null;
  });

  socket.on("startDraft", (payload: { code: string }, ack?: (res: unknown) => void) => {
    const res = startDraft(payload?.code ?? "", socket.id);
    if ("error" in res) {
      ack?.({ ok: false, error: res.error });
      return;
    }
    ack?.({ ok: true });
    io.to(res.code).emit("state", res.state);
  });

  socket.on("action", (payload: { code: string; action: MatchAction }, ack?: (res: unknown) => void) => {
    if (!payload || !ACTION_TYPES.has(payload.action?.type)) {
      ack?.({ ok: false, error: "Unknown action." });
      return;
    }
    const res = applyRoomAction(payload.code, socket.id, payload.action);
    if ("error" in res) {
      ack?.({ ok: false, error: res.error });
      return;
    }
    if (!res.result.ok) {
      ack?.({ ok: false, error: res.result.error });
      return;
    }
    ack?.({ ok: true });
    io.to(res.room.code).emit("state", res.room.state);
  });

  socket.on("disconnect", () => {
    if (waitingSocketId === socket.id) waitingSocketId = null;
    const left = leaveSocket(socket.id);
    if (left) {
      io.to(left.room.code).emit("roomUpdate", {
        seatsFilled: { A: !!left.room.seats.A, B: !!left.room.seats.B },
      });
      io.to(left.room.code).emit("opponentLeft", { seat: left.seat });
    }
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
httpServer.listen(PORT, () => {
  console.log(`Draft server listening on :${PORT}`);
});
