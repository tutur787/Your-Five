import { Env } from "./env";
import { generateClaimToken, generateRoomCode } from "./ids";
import { MatchmakingDO } from "./matchmakingDO";
import { RoomDO } from "./roomDO";
import type { Sport } from "@fiveaside/shared";

// wrangler.jsonc's durable_objects.bindings reference these class names, so the module that's
// `main` must re-export both classes even though nothing in this file calls them directly.
export { MatchmakingDO, RoomDO };

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Your-Five-Client",
};

// Keep accepting the original five-character codes during the migration; all newly-created rooms
// use six characters to make invite-code guessing substantially harder.
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5,6}$/;
const ROOM_ALLOCATION_ATTEMPTS = 12;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function requestedSport(url: URL): Sport | null {
  const value = url.searchParams.get("sport") ?? "basketball";
  return value === "basketball" || value === "soccer" ? value : null;
}

function rateLimitKey(request: Request, url: URL): string {
  const candidate = request.headers.get("X-Your-Five-Client") ?? url.searchParams.get("client");
  if (candidate && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(candidate)) return `client:${candidate}`;
  return `ip:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`;
}

function rateLimited(): Response {
  return new Response(JSON.stringify({ error: "Too many attempts. Please wait a minute and try again." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "60", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/health") {
      if (request.method !== "GET") return new Response("Method not allowed.", { status: 405, headers: CORS_HEADERS });
      return json({ ok: true });
    }

    if (url.pathname === "/rooms/new") {
      if (request.method !== "GET") return new Response("Method not allowed.", { status: 405, headers: CORS_HEADERS });

      const limit = await env.ROOM_CREATE_LIMITER.limit({ key: rateLimitKey(request, url) });
      if (!limit.success) return rateLimited();

      const sport = requestedSport(url);
      if (!sport) return json({ error: "Invalid sport." }, 400);
      const token = generateClaimToken();
      for (let attempt = 0; attempt < ROOM_ALLOCATION_ATTEMPTS; attempt += 1) {
        const code = generateRoomCode();
        const reserved = await env.ROOMS.getByName(code).reservePrivateRoom(token, sport);
        if (reserved) return json({ code, token, sport });
      }
      return json({ error: "Could not allocate a room. Please try again." }, 503);
    }

    if (url.pathname === "/matchmaking") {
      const limit = await env.MATCHMAKING_LIMITER.limit({ key: rateLimitKey(request, url) });
      if (!limit.success) return rateLimited();
      const sport = requestedSport(url);
      if (!sport) return json({ error: "Invalid sport." }, 400);
      const stub = env.MATCHMAKING.getByName(sport);
      return stub.fetch(request);
    }

    const roomMatch = url.pathname.match(/^\/room\/([^/]+)$/);
    if (roomMatch && ROOM_CODE_PATTERN.test(roomMatch[1].toUpperCase())) {
      const stub = env.ROOMS.getByName(roomMatch[1].toUpperCase());
      return stub.fetch(request);
    }

    return new Response("Not found.", { status: 404, headers: CORS_HEADERS });
  },
};
