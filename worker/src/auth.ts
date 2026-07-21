import { createRemoteJWKSet, jwtVerify } from "jose";
import type { PublicAccount } from "./accountDO";
import type { Env } from "./env";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_MAX_AGE_SECONDS = 60 * 10;
const MAX_BODY_BYTES = 64 * 1024;

interface OAuthCookie {
  nonce: string;
  verifier: string;
  returnPath: string;
  expiresAt: number;
}

interface SessionAuth {
  accountId: string;
  tokenHash: string;
  user: PublicAccount;
}

type CorsHeaders = Record<string, string>;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}

async function sha256(value: string): Promise<string> {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function validHmac(value: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const padded = signature.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(signature.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(value));
  } catch {
    return false;
  }
}

async function signedOAuthCookie(value: OAuthCookie, secret: string): Promise<string> {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  return `${payload}.${await hmac(payload, secret)}`;
}

async function verifyOAuthCookie(value: string | null, secret: string): Promise<OAuthCookie | null> {
  if (!value) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || !await validHmac(payload, signature, secret)) return null;
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)))) as OAuthCookie;
    if (
      typeof decoded.nonce !== "string" ||
      typeof decoded.verifier !== "string" ||
      typeof decoded.returnPath !== "string" ||
      typeof decoded.expiresAt !== "number" ||
      decoded.expiresAt <= Date.now()
    ) return null;
    return decoded;
  } catch {
    return null;
  }
}

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

function cookieNames(request: Request): { oauth: string; session: string; secure: boolean } {
  const secure = new URL(request.url).protocol === "https:";
  return {
    oauth: secure ? "__Host-your_five_oauth" : "your_five_oauth",
    session: secure ? "__Host-your_five_session" : "your_five_session",
    secure,
  };
}

function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function json(body: unknown, status: number, cors: CorsHeaders): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.length > 500) return "/";
  return value;
}

function frontendRedirect(env: Env, path: string, status: string): URL {
  const redirect = new URL(safeReturnPath(path), env.FRONTEND_ORIGIN);
  redirect.searchParams.set("auth", status);
  return redirect;
}

function redirect(location: URL): Response {
  return new Response(null, { status: 302, headers: { Location: location.toString() } });
}

function normalizeGoogleName(value: unknown, email: string): string {
  const fallback = email.split("@")[0] || "Your Five GM";
  const candidate = typeof value === "string" ? value : fallback;
  return normalizeDisplayName(candidate) ?? normalizeDisplayName(fallback) ?? "Your Five GM";
}

export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  const length = [...normalized].length;
  if (length < 2 || length > 24) return null;
  return /^[\p{L}\p{N} '_-]+$/u.test(normalized) ? normalized : null;
}

function trustedMutation(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return !origin ||
    origin === new URL(env.FRONTEND_ORIGIN).origin ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");
}

async function requestJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Error("Request is too large.");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("Request is too large.");
  return JSON.parse(text);
}

async function authenticate(request: Request, env: Env): Promise<SessionAuth | null> {
  if (!env.SESSION_SECRET) return null;
  const names = cookieNames(request);
  const raw = parseCookies(request).get(names.session);
  if (!raw) return null;
  const [accountId, token, signature, extra] = raw.split(".");
  if (
    !accountId ||
    !token ||
    !signature ||
    extra ||
    !/^[A-Za-z0-9_-]{20,64}$/.test(accountId) ||
    !/^[A-Za-z0-9_-]{32,64}$/.test(token) ||
    !await validHmac(`${accountId}.${token}`, signature, env.SESSION_SECRET)
  ) return null;
  const tokenHash = await sha256(token);
  const user = await env.ACCOUNTS.getByName(accountId).authenticate(tokenHash);
  return user ? { accountId, tokenHash, user } : null;
}

async function beginGoogleAuth(request: Request, env: Env, cors: CorsHeaders): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return json({ error: "Google sign-in is not configured yet." }, 503, cors);
  }
  const url = new URL(request.url);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await sha256(verifier);
  const state: OAuthCookie = {
    nonce,
    verifier,
    returnPath: safeReturnPath(url.searchParams.get("returnTo")),
    expiresAt: Date.now() + OAUTH_MAX_AGE_SECONDS * 1000,
  };
  const redirectUri = `${url.origin}/auth/google/callback`;
  const authorization = new URL(GOOGLE_AUTH_URL);
  authorization.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authorization.searchParams.set("redirect_uri", redirectUri);
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "openid email profile");
  authorization.searchParams.set("state", nonce);
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");

  const names = cookieNames(request);
  const response = redirect(authorization);
  response.headers.append("Set-Cookie", cookie(names.oauth, await signedOAuthCookie(state, env.SESSION_SECRET), OAUTH_MAX_AGE_SECONDS, names.secure));
  return response;
}

async function finishGoogleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const names = cookieNames(request);
  const state = await verifyOAuthCookie(parseCookies(request).get(names.oauth) ?? null, env.SESSION_SECRET ?? "");
  const fail = (status: string, path = state?.returnPath ?? "/") => {
    const response = redirect(frontendRedirect(env, path, status));
    response.headers.append("Set-Cookie", cookie(names.oauth, "", 0, names.secure));
    return response;
  };
  if (!state || url.searchParams.get("state") !== state.nonce) return fail("error");
  if (url.searchParams.get("error")) return fail("cancelled");
  const code = url.searchParams.get("code");
  if (!code) return fail("error");

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        code_verifier: state.verifier,
        grant_type: "authorization_code",
        redirect_uri: `${url.origin}/auth/google/callback`,
      }),
    });
    const tokens = await tokenResponse.json() as { id_token?: string };
    if (!tokenResponse.ok || !tokens.id_token) return fail("error");
    const { payload } = await jwtVerify(tokens.id_token, GOOGLE_JWKS, {
      algorithms: ["RS256"],
      audience: env.GOOGLE_CLIENT_ID,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string" || payload.email_verified !== true) return fail("error");

    const accountId = await sha256(`google:${payload.sub}`);
    const account = env.ACCOUNTS.getByName(accountId);
    await account.upsertGoogleAccount({
      id: accountId,
      googleSub: payload.sub,
      email: payload.email,
      googleName: normalizeGoogleName(payload.name, payload.email),
    });
    const sessionToken = randomToken(32);
    await account.createSession(await sha256(sessionToken), Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
    const sessionValue = `${accountId}.${sessionToken}`;

    const response = redirect(frontendRedirect(env, state.returnPath, "success"));
    response.headers.append("Set-Cookie", cookie(names.oauth, "", 0, names.secure));
    response.headers.append("Set-Cookie", cookie(names.session, `${sessionValue}.${await hmac(sessionValue, env.SESSION_SECRET)}`, SESSION_MAX_AGE_SECONDS, names.secure));
    return response;
  } catch {
    return fail("error");
  }
}

export async function handleAuthRequest(request: Request, env: Env, cors: CorsHeaders): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/auth/google/start" && request.method === "GET") return beginGoogleAuth(request, env, cors);
  if (url.pathname === "/auth/google/callback" && request.method === "GET") return finishGoogleAuth(request, env);
  if (!["/auth/me", "/auth/logout", "/account/profile", "/account/progress", "/account"].includes(url.pathname)) return null;

  const auth = await authenticate(request, env);
  if (url.pathname === "/auth/me" && request.method === "GET") return json({ user: auth?.user ?? null }, 200, cors);
  if (!auth) return json({ error: "Sign in required." }, 401, cors);

  if (url.pathname === "/auth/logout" && request.method === "POST") {
    if (!trustedMutation(request, env)) return json({ error: "Invalid request origin." }, 403, cors);
    await env.ACCOUNTS.getByName(auth.accountId).revokeSession(auth.tokenHash);
    const names = cookieNames(request);
    const response = json({ ok: true }, 200, cors);
    response.headers.append("Set-Cookie", cookie(names.session, "", 0, names.secure));
    return response;
  }

  if (url.pathname === "/account/profile" && request.method === "POST") {
    if (!trustedMutation(request, env)) return json({ error: "Invalid request origin." }, 403, cors);
    try {
      const body = await requestJson(request) as { displayName?: unknown };
      const displayName = normalizeDisplayName(body.displayName);
      if (!displayName) return json({ error: "Use 2-24 letters, numbers, spaces, apostrophes, underscores, or hyphens." }, 400, cors);
      const user = await env.ACCOUNTS.getByName(auth.accountId).updateDisplayName(displayName);
      return json({ user }, 200, cors);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid request." }, 400, cors);
    }
  }

  if (url.pathname === "/account/progress" && request.method === "GET") {
    const progress = await env.ACCOUNTS.getByName(auth.accountId).getProgress();
    return json({ progress }, 200, cors);
  }

  if (url.pathname === "/account/progress" && request.method === "POST") {
    if (!trustedMutation(request, env)) return json({ error: "Invalid request origin." }, 403, cors);
    try {
      const body = await requestJson(request) as { progress?: unknown };
      const progress = await env.ACCOUNTS.getByName(auth.accountId).mergeProgress(body.progress);
      return json({ progress }, 200, cors);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid request." }, 400, cors);
    }
  }

  if (url.pathname === "/account" && request.method === "DELETE") {
    if (!trustedMutation(request, env)) return json({ error: "Invalid request origin." }, 403, cors);
    await env.ACCOUNTS.getByName(auth.accountId).deleteAccount();
    const names = cookieNames(request);
    const response = json({ ok: true }, 200, cors);
    response.headers.append("Set-Cookie", cookie(names.session, "", 0, names.secure));
    return response;
  }

  return json({ error: "Method not allowed." }, 405, cors);
}
