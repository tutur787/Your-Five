import { DurableObject } from "cloudflare:workers";
import {
  competitionChoiceForSport,
  isBasketballCompetitionChoice,
  isFootballCompetitionChoice,
  resolveCompetitionForSport,
  type Competition,
  type CompetitionChoice,
  MatchmakingServerMessage,
  Sport,
} from "@fiveaside/shared";
import { Env } from "./env";
import { generateClaimToken, generateRoomCode } from "./ids";

type WaitAttachment = { status: "waiting" | "matched"; sport?: Sport; competitionChoice?: CompetitionChoice };
const ROOM_ALLOCATION_ATTEMPTS = 12;
const WS_OPEN = 1;

/**
 * Single well-known instance (env.MATCHMAKING.getByName("global")), replacing index.ts's old
 * `waitingSocketId` global. Needs no ctx.storage at all — ctx.getWebSockets() is the live,
 * hibernation-safe source of truth for "is someone already waiting," and a Durable Object
 * processes one fetch() at a time up to its first await, so marking a candidate "matched"
 * synchronously before awaiting anything closes the only pairing race that matters.
 */
export class MatchmakingDO extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade request.", { status: 426 });
    }
    const requested = new URL(request.url).searchParams.get("sport") ?? "basketball";
    if (requested !== "basketball" && requested !== "soccer") return new Response("Invalid sport.", { status: 400 });
    const sport: Sport = requested;
    const requestedCompetition = new URL(request.url).searchParams.get("competition");
    if (requestedCompetition !== null && !(sport === "soccer" ? isFootballCompetitionChoice(requestedCompetition) : isBasketballCompetitionChoice(requestedCompetition))) {
      return new Response("Invalid player pool.", { status: 400 });
    }
    const competitionChoice = competitionChoiceForSport(sport, requestedCompetition);

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const waiting = this.ctx
      .getWebSockets()
      .find(
        (ws) =>
          ws.readyState === WS_OPEN &&
          this.compatible(ws.deserializeAttachment() as WaitAttachment | null, sport)
      );

    if (waiting) {
      // Claim both sides before the first await so a third connection arriving mid-pairing can't
      // also see `waiting` as up for grabs.
      const legacyAttachment = waiting.deserializeAttachment() as WaitAttachment;
      const waitingAttachment: Required<WaitAttachment> = {
        status: "matched",
        sport: legacyAttachment.sport ?? sport,
        competitionChoice: competitionChoiceForSport(sport, legacyAttachment.competitionChoice),
      };
      waiting.serializeAttachment(waitingAttachment satisfies WaitAttachment);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ status: "matched", sport, competitionChoice } satisfies WaitAttachment);
      await this.pair(waiting, server, sport, waitingAttachment.competitionChoice, competitionChoice);
    } else {
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ status: "waiting", sport, competitionChoice } satisfies WaitAttachment);
      this.send(server, { type: "waiting" });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(): Promise<void> {
    // No client->server payloads in this protocol — connecting IS "find a match."
  }

  async webSocketClose(): Promise<void> {
    // Nothing to do: a closed socket simply stops showing up in ctx.getWebSockets().
  }

  async webSocketError(): Promise<void> {
    // Same as close — no explicit cleanup needed.
  }

  private compatible(attachment: WaitAttachment | null, sport: Sport): boolean {
    return Boolean(attachment && attachment.status === "waiting" && (attachment.sport ?? sport) === sport);
  }

  private async pair(a: WebSocket, b: WebSocket, sport: Sport, choiceA: CompetitionChoice, choiceB: CompetitionChoice): Promise<void> {
    const tokenA = generateClaimToken();
    const tokenB = generateClaimToken();
    const candidateA = resolveCompetitionForSport(sport, choiceA);
    const candidateB = resolveCompetitionForSport(sport, choiceB);
    const competition: Competition = candidateA === candidateB || Math.random() < 0.5 ? candidateA : candidateB;
    const competitionDraw = candidateA !== candidateB
      ? { choices: [candidateA, candidateB] as [Competition, Competition], selected: competition, durationMs: 5_000 }
      : undefined;
    const roomChoice: CompetitionChoice = choiceA === choiceB
        ? choiceA
        : competition;
    let code: string | null = null;

    for (let attempt = 0; attempt < ROOM_ALLOCATION_ATTEMPTS; attempt += 1) {
      const candidate = generateRoomCode();
      if (await this.env.ROOMS.getByName(candidate).initMatchedRoom(tokenA, tokenB, sport, roomChoice, competition)) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      this.send(a, { type: "error", error: "Could not create a match. Please try again." });
      this.send(b, { type: "error", error: "Could not create a match. Please try again." });
      this.closeSoon(a);
      this.closeSoon(b);
      return;
    }

    // Either player can cancel while room allocation is awaiting storage. Keep the other player
    // in the queue instead of sending them into a match with nobody on the other side.
    if (a.readyState !== WS_OPEN || b.readyState !== WS_OPEN) {
      for (const ws of [a, b]) {
        if (ws.readyState !== WS_OPEN) continue;
        const previous = ws.deserializeAttachment() as WaitAttachment;
        ws.serializeAttachment({ ...previous, status: "waiting" } satisfies WaitAttachment);
        this.send(ws, { type: "waiting" });
      }
      return;
    }

    this.send(a, { type: "matchFound", code, seat: "A", token: tokenA, sport, competition, competitionDraw });
    this.send(b, { type: "matchFound", code, seat: "B", token: tokenB, sport, competition, competitionDraw });

    this.closeSoon(a);
    this.closeSoon(b);
  }

  private send(ws: WebSocket, message: MatchmakingServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // Socket already closing — nothing to do.
    }
  }

  private closeSoon(ws: WebSocket): void {
    try {
      ws.close(1000, "matched");
    } catch {
      // Already closing.
    }
  }
}
