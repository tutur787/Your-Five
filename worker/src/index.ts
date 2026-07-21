import { Env } from "./env";
import { generateClaimToken, generateRoomCode } from "./ids";
import { AccountDO } from "./accountDO";
import { handleAuthRequest } from "./auth";
import { MatchmakingDO } from "./matchmakingDO";
import { RoomDO } from "./roomDO";
import type { Sport } from "@fiveaside/shared";

// wrangler.jsonc's durable_objects.bindings reference these class names, so the module that's
// `main` must re-export both classes even though nothing in this file calls them directly.
export { AccountDO, MatchmakingDO, RoomDO };

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  const frontend = new URL(env.FRONTEND_ORIGIN).origin;
  const trusted = origin === frontend ||
    (origin?.startsWith("http://localhost:") ?? false) ||
    (origin?.startsWith("http://127.0.0.1:") ?? false);
  return {
    "Access-Control-Allow-Origin": trusted && origin ? origin : "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Your-Five-Client",
    ...(trusted ? { "Access-Control-Allow-Credentials": "true", "Vary": "Origin" } : {}),
  };
}

// Keep accepting the original five-character codes during the migration; all newly-created rooms
// use six characters to make invite-code guessing substantially harder.
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5,6}$/;
const ROOM_ALLOCATION_ATTEMPTS = 12;

function json(body: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
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

function rateLimited(cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Too many attempts. Please wait a minute and try again." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "60", ...cors },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const authResponse = await handleAuthRequest(request, env, cors);
    if (authResponse) return authResponse;

    if (url.pathname === "/health") {
      if (request.method !== "GET") return new Response("Method not allowed.", { status: 405, headers: cors });
      return json({ ok: true }, cors);
    }

    if (url.pathname === "/rooms/new") {
      if (request.method !== "GET") return new Response("Method not allowed.", { status: 405, headers: cors });

      const limit = await env.ROOM_CREATE_LIMITER.limit({ key: rateLimitKey(request, url) });
      if (!limit.success) return rateLimited(cors);

      const sport = requestedSport(url);
      if (!sport) return json({ error: "Invalid sport." }, cors, 400);
      const token = generateClaimToken();
      for (let attempt = 0; attempt < ROOM_ALLOCATION_ATTEMPTS; attempt += 1) {
        const code = generateRoomCode();
        const reserved = await env.ROOMS.getByName(code).reservePrivateRoom(token, sport);
        if (reserved) return json({ code, token, sport }, cors);
      }
      return json({ error: "Could not allocate a room. Please try again." }, cors, 503);
    }

    if (url.pathname === "/matchmaking") {
      const limit = await env.MATCHMAKING_LIMITER.limit({ key: rateLimitKey(request, url) });
      if (!limit.success) return rateLimited(cors);
      const sport = requestedSport(url);
      if (!sport) return json({ error: "Invalid sport." }, cors, 400);
      const stub = env.MATCHMAKING.getByName(sport);
      return stub.fetch(request);
    }

    const roomMatch = url.pathname.match(/^\/room\/([^/]+)$/);
    if (roomMatch && ROOM_CODE_PATTERN.test(roomMatch[1].toUpperCase())) {
      const stub = env.ROOMS.getByName(roomMatch[1].toUpperCase());
      return stub.fetch(request);
    }

    return new Response("Not found.", { status: 404, headers: cors });
  },
};
