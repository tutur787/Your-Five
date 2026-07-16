import { DurableObject } from "cloudflare:workers";
import { MatchmakingServerMessage, Sport } from "@fiveaside/shared";
import { Env } from "./env";
import { generateClaimToken, generateRoomCode } from "./ids";

type WaitAttachment = { status: "waiting" | "matched" };
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

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const waiting = this.ctx
      .getWebSockets()
      .find(
        (ws) =>
          ws.readyState === WS_OPEN &&
          (ws.deserializeAttachment() as WaitAttachment | null)?.status === "waiting"
      );

    if (waiting) {
      // Claim both sides before the first await so a third connection arriving mid-pairing can't
      // also see `waiting` as up for grabs.
      waiting.serializeAttachment({ status: "matched" } satisfies WaitAttachment);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ status: "matched" } satisfies WaitAttachment);
      await this.pair(waiting, server, sport);
    } else {
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ status: "waiting" } satisfies WaitAttachment);
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

  private async pair(a: WebSocket, b: WebSocket, sport: Sport): Promise<void> {
    const tokenA = generateClaimToken();
    const tokenB = generateClaimToken();
    let code: string | null = null;

    for (let attempt = 0; attempt < ROOM_ALLOCATION_ATTEMPTS; attempt += 1) {
      const candidate = generateRoomCode();
      if (await this.env.ROOMS.getByName(candidate).initMatchedRoom(tokenA, tokenB, sport)) {
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
        ws.serializeAttachment({ status: "waiting" } satisfies WaitAttachment);
        this.send(ws, { type: "waiting" });
      }
      return;
    }

    this.send(a, { type: "matchFound", code, seat: "A", token: tokenA, sport });
    this.send(b, { type: "matchFound", code, seat: "B", token: tokenB, sport });

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
