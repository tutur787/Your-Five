import { DurableObject } from "cloudflare:workers";
import {
  applyAction,
  completeByForfeit,
  createMatchWithRuntime,
  DEFAULT_FOOTBALL_COMPETITION,
  DEFAULT_FOOTBALL_COMPETITION_CHOICE,
  FootballCompetition,
  FootballCompetitionChoice,
  MatchState,
  POSITIONS,
  RoomKind,
  RoomClientMessage,
  RoomMetadata,
  RoomServerMessage,
  RosterPick,
  SeatId,
  SeatsFilled,
  skipCount,
  SOCCER_SLOTS,
  Sport,
  timeoutActionFor,
  POOL_VERSIONS,
  resolveFootballCompetition,
  SportRuntime,
} from "@fiveaside/shared";
import { BASKETBALL_RUNTIME } from "@fiveaside/shared/basketball-runtime";
import { SOCCER_RUNTIME } from "@fiveaside/shared/soccer-runtime";
import { PREMIER_LEAGUE_RUNTIME } from "@fiveaside/shared/football-premier-league-runtime";
import { LALIGA_RUNTIME } from "@fiveaside/shared/football-laliga-runtime";
import { SERIE_A_RUNTIME } from "@fiveaside/shared/football-serie-a-runtime";
import { BUNDESLIGA_RUNTIME } from "@fiveaside/shared/football-bundesliga-runtime";
import { LIGUE_1_RUNTIME } from "@fiveaside/shared/football-ligue-1-runtime";
import { Env } from "./env";
import { generateClaimToken } from "./ids";

const ROOM_IDLE_TTL_MS = 60 * 60 * 1000;
const TURN_TIMEOUT_MS = 30 * 1000;
const RECONNECT_GRACE_MS = 45 * 1000;
const WS_OPEN = 1;

type SeatAttachment = { seat: SeatId };
type SeatAssignment = { seat: SeatId; token: string };

interface PersistedRuntime {
  seatNames: Partial<Record<SeatId, string>>;
  rematchReady: SeatsFilled;
  turnDeadlineAt: number | null;
  reconnectingSeat: SeatId | null;
  reconnectDeadlineAt: number | null;
  noShowDeadlineAt: number | null;
  idleDeleteAt: number | null;
}

const EMPTY_FILLED: SeatsFilled = { A: false, B: false };

export class RoomDO extends DurableObject<Env> {
  private state: MatchState | null = null;
  private claimTokens: Partial<Record<SeatId, string>> | null = null;
  private roomKind: RoomKind | null = null;
  private sport: Sport = "basketball";
  private competitionChoice: FootballCompetitionChoice = DEFAULT_FOOTBALL_COMPETITION_CHOICE;
  private competition: FootballCompetition = DEFAULT_FOOTBALL_COMPETITION;
  private runtime: PersistedRuntime = {
    seatNames: {},
    rematchReady: { ...EMPTY_FILLED },
    turnDeadlineAt: null,
    reconnectingSeat: null,
    reconnectDeadlineAt: null,
    noShowDeadlineAt: null,
    idleDeleteAt: null,
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const storedState = (await ctx.storage.get<MatchState>("state")) ?? null;
      this.state = normalizeLegacyState(storedState);
      this.claimTokens = (await ctx.storage.get<Partial<Record<SeatId, string>>>("claimTokens")) ?? null;
      this.roomKind = (await ctx.storage.get<RoomKind>("roomKind")) ?? null;
      this.sport = (await ctx.storage.get<Sport>("sport")) ?? this.state?.sport ?? "basketball";
      this.competitionChoice = (await ctx.storage.get<FootballCompetitionChoice>("competitionChoice")) ?? this.state?.competition ?? DEFAULT_FOOTBALL_COMPETITION_CHOICE;
      this.competition = (await ctx.storage.get<FootballCompetition>("competition")) ?? this.state?.competition ?? DEFAULT_FOOTBALL_COMPETITION;
      const runtime = await ctx.storage.get<Partial<PersistedRuntime>>("runtime");
      this.runtime = {
        ...this.runtime,
        ...runtime,
        seatNames: runtime?.seatNames ?? {},
        rematchReady: runtime?.rematchReady ?? { ...EMPTY_FILLED },
      };

      if (!this.roomKind && (this.state || this.claimTokens)) {
        this.roomKind = this.claimTokens ? "matched" : "private";
        await ctx.storage.put("roomKind", this.roomKind);
      }
      if (this.state && this.state !== storedState) await ctx.storage.put("state", this.state);
      await this.scheduleNextAlarm();
    });
  }

  async reservePrivateRoom(tokenA: string, sport: Sport = "basketball", competitionChoice: FootballCompetitionChoice = DEFAULT_FOOTBALL_COMPETITION_CHOICE, competition: FootballCompetition = DEFAULT_FOOTBALL_COMPETITION): Promise<boolean> {
    if (this.roomKind || this.state || this.claimTokens) return false;
    this.roomKind = "private";
    this.claimTokens = { A: tokenA };
    this.sport = sport;
    this.competitionChoice = competitionChoice;
    this.competition = competition;
    this.runtime.idleDeleteAt = Date.now() + ROOM_IDLE_TTL_MS;
    await this.persistBase();
    await this.persistRuntime();
    return true;
  }

  async initMatchedRoom(tokenA: string, tokenB: string, sport: Sport = "basketball", competitionChoice: FootballCompetitionChoice = DEFAULT_FOOTBALL_COMPETITION_CHOICE, competition: FootballCompetition = DEFAULT_FOOTBALL_COMPETITION): Promise<boolean> {
    if (this.roomKind || this.state || this.claimTokens) return false;
    this.sport = sport;
    this.competitionChoice = competitionChoice;
    this.competition = competition;
    this.claimTokens = { A: tokenA, B: tokenB };
    this.roomKind = "matched";
    this.runtime.idleDeleteAt = Date.now() + ROOM_IDLE_TTL_MS;
    await this.persistBase();
    await this.persistRuntime();
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade request.", { status: 426 });
    }
    if (!this.roomKind) return new Response("Room not found.", { status: 404 });

    const token = new URL(request.url).searchParams.get("token");
    const assignment = await this.assignSeat(token);
    if ("error" in assignment) return new Response(assignment.error, { status: 409 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: assignment.seat } satisfies SeatAttachment);
    this.runtime.idleDeleteAt = null;

    const startedNow = await this.updatePresence(Date.now());
    const seatsFilled = this.computeSeatsFilled();
    this.send(server, {
      type: "joined",
      seat: assignment.seat,
      token: assignment.token,
      sport: this.sport,
      competition: this.sport === "soccer" ? this.competition : undefined,
      roomKind: this.roomKind,
      state: this.state,
      seatsFilled,
      metadata: this.metadata(),
    });
    this.broadcast({ type: "roomUpdate", seatsFilled, metadata: this.metadata() }, server);
    if (startedNow && this.state) this.broadcastState();
    await this.persistRuntime();

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
    const id = isRecord(raw) && typeof raw.id === "string" ? raw.id : null;
    if (!id || !isRoomClientMessage(raw)) {
      if (id) this.sendAck(ws, id, false, "Invalid request.");
      return;
    }

    if (raw.type === "setNickname") {
      const nickname = normalizeNickname(raw.nickname);
      if (nickname === null) {
        this.sendAck(ws, id, false, "Use 2-16 letters, numbers, spaces, apostrophes, underscores, or hyphens.");
        return;
      }
      this.runtime.seatNames = { ...this.runtime.seatNames, [seat]: nickname || undefined };
      await this.persistRuntime();
      this.sendAck(ws, id, true);
      this.broadcastRoomUpdate();
      return;
    }

    if (raw.type === "setRematchReady") {
      if (!this.state || this.state.phase !== "complete") {
        this.sendAck(ws, id, false, "The current match is not complete.");
        return;
      }
      this.runtime.rematchReady = { ...this.runtime.rematchReady, [seat]: raw.ready };
      this.sendAck(ws, id, true);
      if (this.runtime.rematchReady.A && this.runtime.rematchReady.B && this.bothSeatsFilled()) {
        if (this.sport === "soccer" && this.competitionChoice === "random") {
          this.competition = resolveFootballCompetition("random");
          await this.ctx.storage.put("competition", this.competition);
        }
        this.state = this.freshMatch();
        this.runtime.rematchReady = { ...EMPTY_FILLED };
        this.runtime.turnDeadlineAt = Date.now() + TURN_TIMEOUT_MS;
        await this.ctx.storage.put("state", this.state);
        await this.persistRuntime();
        this.broadcastState();
      } else {
        await this.persistRuntime();
        this.broadcastRoomUpdate();
      }
      return;
    }

    if (raw.type === "startDraft") {
      if (this.state) {
        this.sendAck(ws, id, false, "Draft already started.");
        return;
      }
      if (!this.bothSeatsFilled()) {
        this.sendAck(ws, id, false, "Waiting for both players to join.");
        return;
      }
      this.state = this.freshMatch();
      this.runtime.turnDeadlineAt = Date.now() + TURN_TIMEOUT_MS;
      await this.ctx.storage.put("state", this.state);
      await this.persistRuntime();
      this.sendAck(ws, id, true);
      this.broadcastState();
      return;
    }

    if (!this.state) {
      this.sendAck(ws, id, false, "Draft hasn't started yet.");
      return;
    }
    if (!this.bothSeatsFilled()) {
      this.sendAck(ws, id, false, "The turn is paused while your opponent reconnects.");
      return;
    }
    if (raw.action.seat !== seat) {
      this.sendAck(ws, id, false, "You don't control that seat.");
      return;
    }
    const result = applyAction(this.state, raw.action);
    if (!result.ok) {
      this.sendAck(ws, id, false, result.error);
      return;
    }
    this.state = result.state;
    this.runtime.turnDeadlineAt = this.state.phase === "complete" ? null : Date.now() + TURN_TIMEOUT_MS;
    await this.ctx.storage.put("state", this.state);
    await this.persistRuntime();
    this.sendAck(ws, id, true);
    this.broadcastState();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const sockets = this.ctx.getWebSockets().filter((ws) => ws.readyState === WS_OPEN);

    if (this.runtime.noShowDeadlineAt !== null && this.runtime.noShowDeadlineAt <= now && !this.state && this.roomKind === "matched") {
      this.broadcast({ type: "matchCancelled", reason: "opponent_no_show" });
      for (const ws of sockets) this.closeSocket(ws, 4004, "opponent_no_show");
      await this.clearRoom();
      return;
    }

    if (
      this.runtime.reconnectDeadlineAt !== null &&
      this.runtime.reconnectDeadlineAt <= now &&
      this.runtime.reconnectingSeat &&
      this.state &&
      this.state.phase !== "complete" &&
      sockets.length === 1
    ) {
      this.state = completeByForfeit(this.state, this.runtime.reconnectingSeat);
      this.runtime.reconnectingSeat = null;
      this.runtime.reconnectDeadlineAt = null;
      this.runtime.turnDeadlineAt = null;
      await this.ctx.storage.put("state", this.state);
      await this.persistRuntime();
      this.broadcastState();
      return;
    }

    if (
      this.runtime.turnDeadlineAt !== null &&
      this.runtime.turnDeadlineAt <= now &&
      this.state &&
      this.state.phase !== "complete" &&
      this.bothSeatsFilled()
    ) {
      const action = timeoutActionFor(this.state);
      const result = action ? applyAction(this.state, action) : null;
      if (result?.ok) {
        this.state = result.state;
        this.state.log.push(`Seat ${action!.seat}'s clock expired. The default action was applied.`);
        this.runtime.turnDeadlineAt = this.state.phase === "complete" ? null : now + TURN_TIMEOUT_MS;
        await this.ctx.storage.put("state", this.state);
        await this.persistRuntime();
        this.broadcastState();
        return;
      }
      this.runtime.turnDeadlineAt = now + TURN_TIMEOUT_MS;
    }

    if (this.runtime.idleDeleteAt !== null && this.runtime.idleDeleteAt <= now && sockets.length === 0) {
      await this.clearRoom();
      return;
    }
    await this.persistRuntime();
  }

  private freshMatch(): MatchState {
    const runtime = this.runtimeForRoom();
    return createMatchWithRuntime(runtime, crypto.randomUUID(), crypto.randomUUID());
  }

  private runtimeForRoom(): SportRuntime {
    if (this.sport === "basketball") return BASKETBALL_RUNTIME;
    switch (this.competition) {
      case "premier-league-2025-26": return PREMIER_LEAGUE_RUNTIME;
      case "laliga-2025-26": return LALIGA_RUNTIME;
      case "serie-a-2025-26": return SERIE_A_RUNTIME;
      case "bundesliga-2025-26": return BUNDESLIGA_RUNTIME;
      case "ligue-1-2025-26": return LIGUE_1_RUNTIME;
      default: return SOCCER_RUNTIME;
    }
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const seat = this.seatOf(ws);
    const seatsFilled = this.computeSeatsFilled();
    const seatWasReplaced = seat ? seatsFilled[seat] : false;
    await this.updatePresence(Date.now());
    if (seat && !seatWasReplaced) {
      this.broadcast({
        type: "opponentLeft",
        seat,
        reconnectDeadlineAt: this.runtime.reconnectDeadlineAt,
      });
    }
    this.broadcastRoomUpdate();
    await this.persistRuntime();
  }

  /** Returns true when a matched room was started by the second seat arriving. */
  private async updatePresence(now: number): Promise<boolean> {
    const filled = this.computeSeatsFilled();
    const count = Number(filled.A) + Number(filled.B);
    let started = false;

    if (count === 0) {
      this.runtime.turnDeadlineAt = null;
      this.runtime.reconnectingSeat = null;
      this.runtime.reconnectDeadlineAt = null;
      this.runtime.noShowDeadlineAt = null;
      this.runtime.idleDeleteAt = now + ROOM_IDLE_TTL_MS;
    } else {
      this.runtime.idleDeleteAt = null;
    }

    if (!this.state && this.roomKind === "matched") {
      if (count === 2) {
        this.state = this.freshMatch();
        this.runtime.noShowDeadlineAt = null;
        this.runtime.turnDeadlineAt = now + TURN_TIMEOUT_MS;
        await this.ctx.storage.put("state", this.state);
        started = true;
      } else if (count === 1 && this.runtime.noShowDeadlineAt === null) {
        this.runtime.noShowDeadlineAt = now + RECONNECT_GRACE_MS;
      }
    }

    if (this.state && this.state.phase !== "complete") {
      if (count === 2) {
        this.runtime.reconnectingSeat = null;
        this.runtime.reconnectDeadlineAt = null;
        this.runtime.turnDeadlineAt = now + TURN_TIMEOUT_MS;
      } else if (count === 1) {
        const missing: SeatId = filled.A ? "B" : "A";
        this.runtime.turnDeadlineAt = null;
        if (this.runtime.reconnectingSeat !== missing || this.runtime.reconnectDeadlineAt === null) {
          this.runtime.reconnectingSeat = missing;
          this.runtime.reconnectDeadlineAt = now + RECONNECT_GRACE_MS;
        }
      } else {
        this.runtime.turnDeadlineAt = null;
        this.runtime.reconnectingSeat = null;
        this.runtime.reconnectDeadlineAt = null;
      }
    }
    return started;
  }

  private async assignSeat(token: string | null): Promise<SeatAssignment | { error: string }> {
    if (token) {
      const seat = (Object.keys(this.claimTokens ?? {}) as SeatId[]).find((candidate) => this.claimTokens?.[candidate] === token);
      if (!seat) return { error: "Invalid or expired seat token." };
      for (const existing of this.ctx.getWebSockets()) {
        if (existing.readyState === WS_OPEN && this.seatOf(existing) === seat) {
          this.closeSocket(existing, 4001, "seat_reconnected");
        }
      }
      return { seat, token };
    }

    if (this.roomKind === "matched") return { error: "This match requires its seat token." };
    const seat = (["A", "B"] as const).find((candidate) => !this.claimTokens?.[candidate]);
    if (!seat) return { error: "Room is full." };
    const claimToken = generateClaimToken();
    this.claimTokens = { ...this.claimTokens, [seat]: claimToken };
    await this.ctx.storage.put("claimTokens", this.claimTokens);
    return { seat, token: claimToken };
  }

  private metadata(): RoomMetadata {
    return {
      competition: this.sport === "soccer" ? this.competition : undefined,
      competitionChoice: this.sport === "soccer" ? this.competitionChoice : undefined,
      seatsFilled: this.computeSeatsFilled(),
      seatNames: this.runtime.seatNames,
      rematchReady: this.runtime.rematchReady,
      serverNow: Date.now(),
      turnDeadlineAt: this.runtime.turnDeadlineAt,
      reconnectingSeat: this.runtime.reconnectingSeat,
      reconnectDeadlineAt: this.runtime.reconnectDeadlineAt,
    };
  }

  private bothSeatsFilled(): boolean {
    const filled = this.computeSeatsFilled();
    return filled.A && filled.B;
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

  private seatOf(ws: WebSocket): SeatId | null {
    return (ws.deserializeAttachment() as SeatAttachment | null)?.seat ?? null;
  }

  private async persistBase(): Promise<void> {
    await this.ctx.storage.put({
      roomKind: this.roomKind,
      claimTokens: this.claimTokens,
      sport: this.sport,
      competitionChoice: this.competitionChoice,
      competition: this.competition,
    });
  }

  private async persistRuntime(): Promise<void> {
    await this.ctx.storage.put("runtime", this.runtime);
    await this.scheduleNextAlarm();
  }

  private async scheduleNextAlarm(): Promise<void> {
    const deadlines = [
      this.runtime.turnDeadlineAt,
      this.runtime.reconnectDeadlineAt,
      this.runtime.noShowDeadlineAt,
      this.runtime.idleDeleteAt,
    ].filter((value): value is number => value !== null);
    if (deadlines.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...deadlines)));
  }

  private async clearRoom(): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.state = null;
    this.claimTokens = null;
    this.roomKind = null;
    this.sport = "basketball";
    this.competitionChoice = DEFAULT_FOOTBALL_COMPETITION_CHOICE;
    this.competition = DEFAULT_FOOTBALL_COMPETITION;
    this.runtime = {
      seatNames: {},
      rematchReady: { ...EMPTY_FILLED },
      turnDeadlineAt: null,
      reconnectingSeat: null,
      reconnectDeadlineAt: null,
      noShowDeadlineAt: null,
      idleDeleteAt: null,
    };
  }

  private send(ws: WebSocket, message: RoomServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // The socket closed between the presence check and this send.
    }
  }

  private sendAck(ws: WebSocket, id: string, ok: boolean, error?: string): void {
    this.send(ws, error ? { type: "ack", id, ok, error } : { type: "ack", id, ok });
  }

  private broadcast(message: RoomServerMessage, exclude?: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude && ws.readyState === WS_OPEN) this.send(ws, message);
    }
  }

  private broadcastState(): void {
    if (this.state) this.broadcast({ type: "state", state: this.state, metadata: this.metadata() });
  }

  private broadcastRoomUpdate(): void {
    const seatsFilled = this.computeSeatsFilled();
    this.broadcast({ type: "roomUpdate", seatsFilled, metadata: this.metadata() });
  }

  private closeSocket(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed.
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
  if (value.type === "setNickname") return typeof value.nickname === "string";
  if (value.type === "setRematchReady") return typeof value.ready === "boolean";
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
      return typeof action.playerId === "string" && typeof action.slot === "string" && [...POSITIONS, ...SOCCER_SLOTS].includes(action.slot as never);
    default:
      return false;
  }
}

function normalizeNickname(value: string): string | null {
  const nickname = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!nickname) return "";
  const length = [...nickname].length;
  if (length < 2 || length > 16) return null;
  return /^[\p{L}\p{N} '_-]+$/u.test(nickname) ? nickname : null;
}

function normalizeLegacySoccerRoster(roster: RosterPick[]): RosterPick[] {
  const currentSlots = new Set(SOCCER_SLOTS);
  const reserved = new Set(roster.map((pick) => pick.slot).filter((slot): slot is typeof SOCCER_SLOTS[number] => currentSlots.has(slot as never)));
  const used = new Set<string>();
  return roster.map((pick) => {
    if (currentSlots.has(pick.slot as never) && !used.has(pick.slot)) {
      used.add(pick.slot);
      return pick;
    }
    const preferred: Array<(typeof SOCCER_SLOTS)[number]> = pick.slot === "ATT"
      ? ["ATT_L", "ATT_R", "DEF", "MID", "GK"]
      : pick.slot === "DEF_R"
        ? ["DEF", "ATT_R", "ATT_L", "MID", "GK"]
        : ["DEF", "ATT_L", "ATT_R", "MID", "GK"];
    const slot = preferred.find((candidate) => !reserved.has(candidate as never) && !used.has(candidate))
      ?? SOCCER_SLOTS.find((candidate) => !used.has(candidate));
    if (!slot) return pick;
    used.add(slot);
    return { ...pick, slot };
  });
}

function normalizeLegacyState(state: MatchState | null): MatchState | null {
  if (!state) return null;
  const sport = state.sport ?? "basketball";
  const normalizePlayer = <T extends { sport?: Sport }>(player: T): T => player.sport ? player : { ...player, sport: "basketball" };
  return {
    ...state,
    sport,
    competition: sport === "soccer" ? state.competition ?? DEFAULT_FOOTBALL_COMPETITION : undefined,
    matchId: state.matchId ?? crypto.randomUUID(),
    poolVersion: state.poolVersion ?? POOL_VERSIONS[sport],
    completionReason: state.phase === "complete" ? state.completionReason ?? "score" : state.completionReason,
    pool: state.pool.map(normalizePlayer),
    teams: {
      A: {
        ...state.teams.A,
        skipsUsed: skipCount(state.teams.A),
        skipUsed: undefined,
        paidSkipUsed: undefined,
        roster: (sport === "soccer" ? normalizeLegacySoccerRoster(state.teams.A.roster) : state.teams.A.roster)
          .map((pick) => ({ ...pick, player: normalizePlayer(pick.player) })),
      },
      B: {
        ...state.teams.B,
        skipsUsed: skipCount(state.teams.B),
        skipUsed: undefined,
        paidSkipUsed: undefined,
        roster: (sport === "soccer" ? normalizeLegacySoccerRoster(state.teams.B.roster) : state.teams.B.roster)
          .map((pick) => ({ ...pick, player: normalizePlayer(pick.player) })),
      },
    },
    auction: state.auction ? { ...state.auction, player: normalizePlayer(state.auction.player) } : null,
    skipOffer: state.skipOffer ? { ...state.skipOffer, player: normalizePlayer(state.skipOffer.player) } : null,
    pendingPlacement: state.pendingPlacement ? { ...state.pendingPlacement, player: normalizePlayer(state.pendingPlacement.player) } : null,
  } as MatchState;
}
