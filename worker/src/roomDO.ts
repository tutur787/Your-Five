import { DurableObject } from "cloudflare:workers";
import {
  applyAction,
  createMatch,
  MatchState,
  POSITIONS,
  RoomKind,
  RoomClientMessage,
  RoomServerMessage,
  SeatId,
  SeatsFilled,
  skipCount,
  SOCCER_SLOTS,
  Sport,
} from "@fiveaside/shared";
import { Env } from "./env";
import { generateClaimToken } from "./ids";

/** How long a room may sit with nobody connected before it's cleaned up. Rescheduled on every
 * join/action/message, so an actively-played draft (even a slow one) never hits this — it only
 * fires for rooms nobody ever finished joining, or that both players walked away from. */
const ROOM_IDLE_TTL_MS = 60 * 60 * 1000; // 1 hour

type SeatAttachment = { seat: SeatId };
type SeatAssignment = { seat: SeatId; token: string };
const WS_OPEN = 1;

/**
 * One instance per room code (addressed via env.ROOMS.getByName(code)). State lives in this
 * object's own durable storage (required: hibernation discards in-memory fields after ~10s of
 * socket idle, so a `state` field alone is not durable) and its WebSocket connections are
 * hibernatable via the Hibernation API.
 */
export class RoomDO extends DurableObject<Env> {
  private state: MatchState | null = null;
  private claimTokens: Partial<Record<SeatId, string>> | null = null;
  private roomKind: RoomKind | null = null;
  private sport: Sport = "basketball";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // The constructor reruns on every wake (cold start AND every hibernation resume), so this is
    // the one guaranteed rehydration point — kept intentionally minimal per Cloudflare's guidance.
    ctx.blockConcurrencyWhile(async () => {
      this.state = normalizeLegacyState((await ctx.storage.get<MatchState>("state")) ?? null);
      this.claimTokens = (await ctx.storage.get<Partial<Record<SeatId, string>>>("claimTokens")) ?? null;
      this.roomKind = (await ctx.storage.get<RoomKind>("roomKind")) ?? null;
      this.sport = (await ctx.storage.get<Sport>("sport")) ?? this.state?.sport ?? "basketball";

      // Preserve rooms created by an earlier Worker version during a rolling deployment.
      if (!this.roomKind && (this.state || this.claimTokens)) {
        this.roomKind = this.claimTokens ? "matched" : "private";
        await ctx.storage.put("roomKind", this.roomKind);
      }
    });
  }

  /** Reserves a new private room and permanently assigns its creator to seat A. */
  async reservePrivateRoom(tokenA: string, sport: Sport = "basketball"): Promise<boolean> {
    if (this.roomKind || this.state || this.claimTokens) return false;
    this.roomKind = "private";
    this.claimTokens = { A: tokenA };
    this.sport = sport;
    await this.ctx.storage.put("roomKind", this.roomKind);
    await this.ctx.storage.put("claimTokens", this.claimTokens);
    await this.ctx.storage.put("sport", this.sport);
    await this.touchAlarm();
    return true;
  }

  /** Called via RPC by MatchmakingDO once it's paired two waiting players, before either of their
   * `matchFound` messages goes out — guarantees this room's state exists by the time either client's
   * reconnect-to-`/room/:code` attempt can possibly arrive. */
  async initMatchedRoom(tokenA: string, tokenB: string, sport: Sport = "basketball"): Promise<boolean> {
    if (this.roomKind || this.state || this.claimTokens) return false;
    this.sport = sport;
    this.state = createMatch(sport);
    this.claimTokens = { A: tokenA, B: tokenB };
    this.roomKind = "matched";
    await this.ctx.storage.put("state", this.state);
    await this.ctx.storage.put("claimTokens", this.claimTokens);
    await this.ctx.storage.put("roomKind", this.roomKind);
    await this.ctx.storage.put("sport", this.sport);
    await this.touchAlarm();
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade request.", { status: 426 });
    }

    if (!this.roomKind) return new Response("Room not found.", { status: 404 });

    const token = new URL(request.url).searchParams.get("token");
    const assignment = await this.assignSeat(token);
    if ("error" in assignment) {
      return new Response(assignment.error, { status: 409 });
    }
    const { seat, token: claimToken } = assignment;

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat } satisfies SeatAttachment);
    await this.touchAlarm();

    const seatsFilled = this.computeSeatsFilled();
    this.send(server, {
      type: "joined",
      seat,
      token: claimToken,
      sport: this.sport,
      roomKind: this.roomKind,
      state: this.state,
      seatsFilled,
    });
    this.broadcast({ type: "roomUpdate", seatsFilled }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      return;
    }

    const seat = this.seatOf(ws);
    if (!seat) return;
    await this.touchAlarm();

    const id = isRecord(raw) && typeof raw.id === "string" ? raw.id : null;
    if (!id || !isRoomClientMessage(raw)) {
      if (id) this.sendAck(ws, id, false, "Invalid request.");
      return;
    }
    const parsed = raw;

    if (parsed.type === "startDraft") {
      if (this.state) {
        this.sendAck(ws, parsed.id, false, "Draft already started.");
        return;
      }
      const seatsFilled = this.computeSeatsFilled();
      if (!seatsFilled.A || !seatsFilled.B) {
        this.sendAck(ws, parsed.id, false, "Waiting for both players to join.");
        return;
      }
      this.state = createMatch(this.sport);
      await this.ctx.storage.put("state", this.state);
      this.sendAck(ws, parsed.id, true);
      this.broadcast({ type: "state", state: this.state });
      return;
    }

    if (parsed.type === "action") {
      if (!this.state) {
        this.sendAck(ws, parsed.id, false, "Draft hasn't started yet.");
        return;
      }
      if (parsed.action.seat !== seat) {
        this.sendAck(ws, parsed.id, false, "You don't control that seat.");
        return;
      }
      const result = applyAction(this.state, parsed.action);
      if (!result.ok) {
        this.sendAck(ws, parsed.id, false, result.error);
        return;
      }
      this.state = result.state;
      await this.ctx.storage.put("state", this.state);
      this.sendAck(ws, parsed.id, true);
      this.broadcast({ type: "state", state: this.state });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length > 0) {
      // Someone's tab is still open even if idle — don't tear down an active session.
      await this.touchAlarm();
      return;
    }
    await this.ctx.storage.deleteAll();
    this.state = null;
    this.claimTokens = null;
    this.roomKind = null;
    this.sport = "basketball";
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const seat = this.seatOf(ws);
    if (seat) {
      this.broadcast({ type: "opponentLeft", seat });
      this.broadcast({ type: "roomUpdate", seatsFilled: this.computeSeatsFilled() });
    }
    await this.touchAlarm();
  }

  private seatOf(ws: WebSocket): SeatId | null {
    const attachment = ws.deserializeAttachment() as SeatAttachment | null;
    return attachment?.seat ?? null;
  }

  private computeSeatsFilled(): SeatsFilled {
    const occupied = new Set<SeatId>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WS_OPEN) continue;
      const seat = this.seatOf(ws);
      if (seat) occupied.add(seat);
    }
    return { A: occupied.has("A"), B: occupied.has("B") };
  }

  /** Returns the seat named by a valid token. In private rooms, the first guest without a token
   * claims the remaining seat and receives a token for future reconnects. */
  private async assignSeat(token: string | null): Promise<SeatAssignment | { error: string }> {
    const seatsFilled = this.computeSeatsFilled();

    if (token) {
      const seat = (Object.keys(this.claimTokens ?? {}) as SeatId[]).find((s) => this.claimTokens?.[s] === token);
      if (seat) {
        if (seatsFilled[seat]) return { error: "That seat has already been claimed." };
        return { seat, token };
      }
      return { error: "Invalid or expired seat token." };
    }

    if (this.roomKind === "matched") return { error: "This match requires its seat token." };

    const seat = (["A", "B"] as const).find((candidate) => !this.claimTokens?.[candidate]);
    if (seat) {
      const claimToken = generateClaimToken();
      this.claimTokens = { ...this.claimTokens, [seat]: claimToken };
      await this.ctx.storage.put("claimTokens", this.claimTokens);
      return { seat, token: claimToken };
    }
    return { error: "Room is full." };
  }

  private touchAlarm(): Promise<void> {
    return this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE_TTL_MS);
  }

  private send(ws: WebSocket, message: RoomServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Socket already closing — nothing to do.
    }
  }

  private sendAck(ws: WebSocket, id: string, ok: boolean, error?: string): void {
    this.send(ws, error ? { type: "ack", id, ok, error } : { type: "ack", id, ok });
  }

  private broadcast(message: RoomServerMessage, exclude?: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      this.send(ws, message);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSeat(value: unknown): value is SeatId {
  return value === "A" || value === "B";
}

function isRoomClientMessage(value: unknown): value is RoomClientMessage {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || value.id.length > 128) return false;
  if (value.type === "startDraft") return true;
  if (value.type !== "action" || !isRecord(value.action)) return false;

  const action = value.action;
  if (!isSeat(action.seat) || typeof action.type !== "string") return false;
  switch (action.type) {
    case "openBid":
      return typeof action.startBid === "number" && Number.isInteger(action.startBid);
    case "raiseBid":
      return typeof action.amount === "number" && Number.isInteger(action.amount);
    case "acceptBid":
    case "useSkip":
    case "buySkip":
    case "takeForOne":
      return true;
    case "respondToSkip":
      return typeof action.accept === "boolean";
    case "placePick":
      return typeof action.slot === "string" && [...POSITIONS, ...SOCCER_SLOTS].includes(action.slot as never);
    case "setSlot":
      return (
        typeof action.playerId === "string" &&
        typeof action.slot === "string" &&
        [...POSITIONS, ...SOCCER_SLOTS].includes(action.slot as never)
      );
    default:
      return false;
  }
}

function normalizeLegacyState(state: MatchState | null): MatchState | null {
  if (!state) return null;
  const sport = state.sport ?? "basketball";
  const normalizePlayer = <T extends { sport?: Sport }>(player: T): T => {
    if (player.sport) return player;
    return { ...player, sport: "basketball" };
  };
  return {
    ...state,
    sport,
    pool: state.pool.map(normalizePlayer),
    teams: {
      A: {
        ...state.teams.A,
        skipsUsed: skipCount(state.teams.A),
        skipUsed: undefined,
        paidSkipUsed: undefined,
        roster: state.teams.A.roster.map((pick) => ({ ...pick, player: normalizePlayer(pick.player) })),
      },
      B: {
        ...state.teams.B,
        skipsUsed: skipCount(state.teams.B),
        skipUsed: undefined,
        paidSkipUsed: undefined,
        roster: state.teams.B.roster.map((pick) => ({ ...pick, player: normalizePlayer(pick.player) })),
      },
    },
    auction: state.auction ? { ...state.auction, player: normalizePlayer(state.auction.player) } : null,
    skipOffer: state.skipOffer ? { ...state.skipOffer, player: normalizePlayer(state.skipOffer.player) } : null,
    pendingPlacement: state.pendingPlacement ? { ...state.pendingPlacement, player: normalizePlayer(state.pendingPlacement.player) } : null,
  } as MatchState;
}
