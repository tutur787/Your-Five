import { applyAction, createMatch, MatchAction, MatchState, SeatId } from "@fiveaside/shared";

interface Room {
  code: string;
  state: MatchState | null;
  seats: Partial<Record<SeatId, string>>; // seat -> socket id
  createdAt: number;
}

const rooms = new Map<string, Room>();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

function generateCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

export function createRoom(): Room {
  const room: Room = { code: generateCode(), state: null, seats: {}, createdAt: Date.now() };
  rooms.set(room.code, room);
  return room;
}

export function createMatchedRoom(socketA: string, socketB: string): Room {
  const room: Room = {
    code: generateCode(),
    state: createMatch(),
    seats: { A: socketA, B: socketB },
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function joinRoom(code: string, socketId: string): { room: Room; seat: SeatId } | { error: string } {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };

  // Rejoining with the same socket (shouldn't normally happen) just returns existing seat.
  const existing = (Object.keys(room.seats) as SeatId[]).find((s) => room.seats[s] === socketId);
  if (existing) return { room, seat: existing };

  const openSeat: SeatId | undefined = !room.seats.A ? "A" : !room.seats.B ? "B" : undefined;
  if (!openSeat) return { error: "Room is full." };

  room.seats[openSeat] = socketId;
  return { room, seat: openSeat };
}

export function leaveSocket(socketId: string): { room: Room; seat: SeatId } | null {
  for (const room of rooms.values()) {
    const seat = (Object.keys(room.seats) as SeatId[]).find((s) => room.seats[s] === socketId);
    if (seat) {
      delete room.seats[seat];
      return { room, seat };
    }
  }
  return null;
}

export function startDraft(code: string, socketId: string): Room | { error: string } {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  if (!room.seats.A || !room.seats.B) return { error: "Waiting for both players to join." };
  if (room.seats.A !== socketId && room.seats.B !== socketId) return { error: "You don't control a seat in this room." };
  if (room.state) return { error: "Draft already started." };
  room.state = createMatch();
  return room;
}

export function applyRoomAction(
  code: string,
  socketId: string,
  action: MatchAction
): { room: Room; result: ReturnType<typeof applyAction> } | { error: string } {
  const room = getRoom(code);
  if (!room) return { error: "Room not found." };
  if (!room.state) return { error: "Draft hasn't started yet." };
  if (room.seats[action.seat] !== socketId) return { error: "You don't control that seat." };

  const result = applyAction(room.state, action);
  if (result.ok) room.state = result.state;
  return { room, result };
}

// Periodically sweep long-dead empty rooms so memory doesn't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 60 * 6; // 6 hours
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff) rooms.delete(code);
  }
}, 1000 * 60 * 30).unref();
