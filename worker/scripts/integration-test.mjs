import assert from "node:assert/strict";

const HTTP_BASE = (process.env.WORKER_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = HTTP_BASE.replace(/^http/, "ws");
const TIMEOUT_MS = 5000;
const FOOTBALL_COMPETITIONS = [
  "uefa-all-time",
  "premier-league-2025-26",
  "laliga-2025-26",
  "serie-a-2025-26",
  "bundesliga-2025-26",
  "ligue-1-2025-26",
];

class TestSocket {
  constructor(path) {
    this.messages = [];
    this.waiters = [];
    this.ws = new WebSocket(`${WS_BASE}${path}`);
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const waiterIndex = this.waiters.findIndex(({ predicate }) => predicate(message));
      if (waiterIndex >= 0) {
        const [{ resolve, timer }] = this.waiters.splice(waiterIndex, 1);
        clearTimeout(timer);
        resolve(message);
      } else {
        this.messages.push(message);
      }
    });
  }

  waitFor(predicate) {
    const messageIndex = this.messages.findIndex(predicate);
    if (messageIndex >= 0) return Promise.resolve(this.messages.splice(messageIndex, 1)[0]);

    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
          reject(new Error("Timed out waiting for a WebSocket message."));
        }, TIMEOUT_MS),
      };
      this.waiters.push(waiter);
    });
  }

  send(message) {
    this.ws.send(JSON.stringify(message));
  }

  discard(predicate) {
    this.messages = this.messages.filter((message) => !predicate(message));
  }

  async close() {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    const closed = new Promise((resolve) => this.ws.addEventListener("close", resolve, { once: true }));
    this.ws.close();
    await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 250))]);
  }
}

async function connectRoom(code, token = null) {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const socket = new TestSocket(`/room/${code}${query}`);
  const joined = await socket.waitFor((message) => message.type === "joined");
  return { socket, joined };
}

async function expectRejectedRoom(code, token = null) {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const socket = new WebSocket(`${WS_BASE}/room/${code}${query}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for a rejected room connection.")), TIMEOUT_MS);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error("Room connection unexpectedly succeeded."));
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function createPrivateRoom(sport = "basketball", competition) {
  const query = new URLSearchParams({ sport });
  if (competition) query.set("competition", competition);
  const response = await fetch(`${HTTP_BASE}/rooms/new?${query}`);
  assert.equal(response.status, 200);
  const room = await response.json();
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(typeof room.token, "string");
  assert.ok(room.token.length > 0);
  assert.equal(room.sport, sport);
  if (sport === "soccer") {
    assert.ok(FOOTBALL_COMPETITIONS.includes(room.competition));
    if (competition && competition !== "random") assert.equal(room.competition, competition);
  }
  return room;
}

async function testPrivateRoom(sport = "basketball", competition) {
  const room = await createPrivateRoom(sport, competition);
  const a = await connectRoom(room.code, room.token);
  const b = await connectRoom(room.code);
  assert.equal(a.joined.seat, "A");
  assert.equal(b.joined.seat, "B");
  assert.equal(a.joined.roomKind, "private");
  assert.equal(a.joined.sport, sport);
  assert.equal(b.joined.sport, sport);
  if (sport === "soccer") {
    assert.equal(a.joined.competition, room.competition);
    assert.equal(b.joined.competition, room.competition);
    assert.equal(a.joined.metadata.competition, room.competition);
  }
  assert.notEqual(a.joined.token, b.joined.token);

  await expectRejectedRoom(room.code);
  await Promise.all([a.socket.close(), b.socket.close()]);

  // Reconnect in reverse order to prove the seat belongs to the token, not arrival order.
  const bAgain = await connectRoom(room.code, b.joined.token);
  const aAgain = await connectRoom(room.code, a.joined.token);
  assert.equal(bAgain.joined.seat, "B");
  assert.equal(aAgain.joined.seat, "A");
  assert.equal(aAgain.joined.sport, sport);

  aAgain.socket.send({ type: "startDraft", id: "private-start" });
  const ack = await aAgain.socket.waitFor((message) => message.type === "ack" && message.id === "private-start");
  assert.equal(ack.ok, true);
  const started = await aAgain.socket.waitFor((message) => message.type === "state");
  assert.equal(started.state.sport, sport);
  if (sport === "soccer") assert.equal(started.state.competition, room.competition);
  await Promise.all([aAgain.socket.close(), bAgain.socket.close()]);
}

async function testMatchmaking(sport = "basketball") {
  const first = new TestSocket(`/matchmaking?sport=${sport}`);
  await first.waitFor((message) => message.type === "waiting");
  const second = new TestSocket(`/matchmaking?sport=${sport}`);
  const [matchA, matchB] = await Promise.all([
    first.waitFor((message) => message.type === "matchFound"),
    second.waitFor((message) => message.type === "matchFound"),
  ]);

  assert.equal(matchA.code, matchB.code);
  assert.equal(matchA.seat, "A");
  assert.equal(matchB.seat, "B");
  assert.notEqual(matchA.token, matchB.token);
  assert.equal(matchA.sport, sport);
  assert.equal(matchB.sport, sport);
  await expectRejectedRoom(matchA.code);

  const a = await connectRoom(matchA.code, matchA.token);
  assert.equal(a.joined.state, null, "A random match must wait for the second room socket");
  assert.equal(a.joined.metadata.turnDeadlineAt, null);
  const b = await connectRoom(matchB.code, matchB.token);
  assert.equal(a.joined.seat, "A");
  assert.equal(b.joined.seat, "B");
  assert.equal(a.joined.roomKind, "matched");
  assert.equal(a.joined.sport, sport);
  assert.ok(b.joined.state);
  assert.equal(b.joined.state.sport, sport);
  assert.ok(b.joined.metadata.turnDeadlineAt > b.joined.metadata.serverNow);

  const initial = await a.socket.waitFor((message) => message.type === "state" && message.state.matchId === b.joined.state.matchId);
  assert.equal(initial.state.sport, sport);

  // A valid token replaces a stale socket for the same seat without creating a disconnect grace period.
  const replacement = await connectRoom(matchA.code, matchA.token);
  assert.equal(replacement.joined.seat, "A");
  assert.equal(replacement.joined.state.matchId, initial.state.matchId);
  assert.equal(replacement.joined.metadata.reconnectingSeat, null);

  await replacement.socket.close();
  const left = await b.socket.waitFor((message) => message.type === "opponentLeft" && message.seat === "A");
  assert.ok(left.reconnectDeadlineAt > Date.now(), "a disconnected seat receives a grace deadline");
  const reconnected = await connectRoom(matchA.code, matchA.token);
  assert.equal(reconnected.joined.seat, "A");
  assert.equal(reconnected.joined.state.matchId, initial.state.matchId);
  assert.equal(reconnected.joined.metadata.reconnectingSeat, null);
  assert.ok(reconnected.joined.metadata.turnDeadlineAt > reconnected.joined.metadata.serverNow);

  reconnected.socket.send({ type: "setNickname", id: "nickname-valid", nickname: "  Arthur  A  " });
  const nicknameAck = await reconnected.socket.waitFor((message) => message.type === "ack" && message.id === "nickname-valid");
  assert.equal(nicknameAck.ok, true);
  const named = await b.socket.waitFor((message) => message.type === "roomUpdate" && message.metadata?.seatNames?.A === "Arthur A");
  assert.equal(named.metadata.seatNames.A, "Arthur A");

  reconnected.socket.send({ type: "setNickname", id: "nickname-invalid", nickname: "x" });
  const invalidNickname = await reconnected.socket.waitFor((message) => message.type === "ack" && message.id === "nickname-invalid");
  assert.equal(invalidNickname.ok, false);

  reconnected.socket.send({ type: "action", id: "malformed" });
  const invalidAck = await reconnected.socket.waitFor((message) => message.type === "ack" && message.id === "malformed");
  assert.equal(invalidAck.ok, false);

  const actingSeat = reconnected.joined.state.turn;
  const actor = actingSeat === "A" ? reconnected.socket : b.socket;
  actor.send({ type: "action", id: "valid", action: { type: "openBid", seat: actingSeat, startBid: 1 } });
  const validAck = await actor.waitFor((message) => message.type === "ack" && message.id === "valid");
  assert.equal(validAck.ok, true);

  if (sport === "basketball") {
    const sockets = { A: reconnected.socket, B: b.socket };
    let state = await actor.waitFor((message) => message.type === "state" && message.state.phase === "bidding").then((message) => message.state);
    state = await finishDraft(sockets, state);
    const finishedMatchId = state.matchId;

    sockets.A.send({ type: "setRematchReady", id: "rematch-a", ready: true });
    assert.equal((await sockets.A.waitFor((message) => message.type === "ack" && message.id === "rematch-a")).ok, true);
    await sockets.B.waitFor((message) => message.type === "roomUpdate" && message.metadata?.rematchReady?.A === true);

    sockets.B.send({ type: "setRematchReady", id: "rematch-b", ready: true });
    assert.equal((await sockets.B.waitFor((message) => message.type === "ack" && message.id === "rematch-b")).ok, true);
    const rematch = await sockets.B.waitFor((message) => message.type === "state" && message.state.matchId !== finishedMatchId);
    assert.equal(rematch.state.sport, sport);
    assert.equal(rematch.state.phase, "onTheClock");
    assert.equal(rematch.metadata.seatNames.A, "Arthur A");
    assert.equal(rematch.metadata.rematchReady.A, false);
    assert.equal(rematch.metadata.rematchReady.B, false);
  }

  await Promise.all([a.socket.close(), reconnected.socket.close(), b.socket.close()]);
}

function listedSlots(player) {
  if (player.sport === "basketball") {
    return [player.position, player.secondaryPosition, player.tertiaryPosition].filter(Boolean);
  }
  const roles = [player.role, player.secondaryRole, player.tertiaryRole].filter(Boolean);
  return roles.flatMap((role) => role === "ATT" ? ["ATT_L", "ATT_R"] : [role]);
}

function firstPlacementSlot(state) {
  const pending = state.pendingPlacement;
  const occupied = new Set(state.teams[pending.seat].roster.map((pick) => pick.slot));
  const all = state.sport === "soccer" ? ["GK", "DEF", "MID", "ATT_L", "ATT_R"] : ["PG", "SG", "SF", "PF", "C"];
  return listedSlots(pending.player).find((slot) => !occupied.has(slot)) ?? all.find((slot) => !occupied.has(slot));
}

async function sendAction(sockets, state, action) {
  const socket = sockets[action.seat];
  const id = `drive-${state.log.length}-${action.type}`;
  socket.discard((message) => message.type === "state" && message.state.matchId === state.matchId && message.state.log.length <= state.log.length);
  socket.send({ type: "action", id, action });
  const ack = await socket.waitFor((message) => message.type === "ack" && message.id === id);
  assert.equal(ack.ok, true, ack.error ?? `Expected ${action.type} to succeed`);
  const updated = await socket.waitFor(
    (message) => message.type === "state" && message.state.matchId === state.matchId && message.state.log.length > state.log.length
  );
  return updated.state;
}

async function finishDraft(sockets, initialState) {
  let state = initialState;
  let guard = 0;
  while (state.phase !== "complete") {
    if (++guard > 80) throw new Error(`Draft driver did not complete; stopped in ${state.phase}.`);
    if (state.phase === "onTheClock") {
      state = await sendAction(sockets, state, { type: "openBid", seat: state.turn, startBid: 1 });
    } else if (state.phase === "bidding") {
      state = await sendAction(sockets, state, { type: "acceptBid", seat: state.auction.turn });
    } else if (state.phase === "placing") {
      state = await sendAction(sockets, state, { type: "placePick", seat: state.pendingPlacement.seat, slot: firstPlacementSlot(state) });
    } else if (state.phase === "catchUp") {
      state = await sendAction(sockets, state, { type: "takeForOne", seat: state.turn });
    } else if (state.phase === "skipOffer") {
      state = await sendAction(sockets, state, { type: "respondToSkip", seat: state.skipOffer.respondingSeat, accept: false });
    }
  }
  return state;
}

async function testIsolatedQueues() {
  const soccerFirst = new TestSocket("/matchmaking?sport=soccer");
  const basketballFirst = new TestSocket("/matchmaking?sport=basketball");
  await Promise.all([
    soccerFirst.waitFor((message) => message.type === "waiting"),
    basketballFirst.waitFor((message) => message.type === "waiting"),
  ]);

  const soccerSecond = new TestSocket("/matchmaking?sport=soccer");
  const [soccerA, soccerB] = await Promise.all([
    soccerFirst.waitFor((message) => message.type === "matchFound"),
    soccerSecond.waitFor((message) => message.type === "matchFound"),
  ]);
  assert.equal(soccerA.sport, "soccer");
  assert.equal(soccerB.sport, "soccer");

  const basketballSecond = new TestSocket("/matchmaking?sport=basketball");
  const [basketballA, basketballB] = await Promise.all([
    basketballFirst.waitFor((message) => message.type === "matchFound"),
    basketballSecond.waitFor((message) => message.type === "matchFound"),
  ]);
  assert.equal(basketballA.sport, "basketball");
  assert.equal(basketballB.sport, "basketball");
  await Promise.all([soccerFirst.close(), soccerSecond.close(), basketballFirst.close(), basketballSecond.close()]);
}

async function testFootballCompetitionQueues() {
  const premier = new TestSocket("/matchmaking?sport=soccer&competition=premier-league-2025-26");
  await premier.waitFor((message) => message.type === "waiting");
  const laliga = new TestSocket("/matchmaking?sport=soccer&competition=laliga-2025-26");
  const [differentA, differentB] = await Promise.all([
    premier.waitFor((message) => message.type === "matchFound"),
    laliga.waitFor((message) => message.type === "matchFound"),
  ]);
  assert.equal(differentA.code, differentB.code, "different explicit leagues enter the same match");
  assert.deepEqual(
    differentA.competitionDraw.choices,
    ["premier-league-2025-26", "laliga-2025-26"],
    "the draw presents both requested pools"
  );
  assert.equal(differentA.competitionDraw.durationMs, 5_000, "different pools use the five-second draw");
  assert.equal(differentA.competitionDraw.selected, differentA.competition, "the draw reveals the room competition");
  assert.deepEqual(differentA.competitionDraw, differentB.competitionDraw, "both players receive the same draw result");
  assert.ok(differentA.competitionDraw.choices.includes(differentA.competition), "one of the two requested pools wins");

  const explicit = new TestSocket("/matchmaking?sport=soccer&competition=premier-league-2025-26");
  await explicit.waitFor((message) => message.type === "waiting");
  const randomA = new TestSocket("/matchmaking?sport=soccer&competition=random");
  const [firstExplicit, firstRandom] = await Promise.all([
    explicit.waitFor((message) => message.type === "matchFound"),
    randomA.waitFor((message) => message.type === "matchFound"),
  ]);
  assert.equal(firstExplicit.competition, firstRandom.competition, "both players receive the same resolved pool");
  assert.ok(FOOTBALL_COMPETITIONS.includes(firstRandom.competition), "Random resolves to a supported pool before pairing");
  if (firstExplicit.competitionDraw) {
    assert.ok(firstExplicit.competitionDraw.choices.includes("premier-league-2025-26"), "the explicit preference is one draw option");
    assert.deepEqual(firstExplicit.competitionDraw, firstRandom.competitionDraw, "explicit versus Random shares one draw result");
  } else {
    assert.equal(firstRandom.competition, "premier-league-2025-26", "no draw is needed when Random resolves to the explicit pool");
  }

  const randomFirst = new TestSocket("/matchmaking?sport=soccer&competition=random");
  await randomFirst.waitFor((message) => message.type === "waiting");
  const randomSecond = new TestSocket("/matchmaking?sport=soccer&competition=random");
  const [randomMatchA, randomMatchB] = await Promise.all([
    randomFirst.waitFor((message) => message.type === "matchFound"),
    randomSecond.waitFor((message) => message.type === "matchFound"),
  ]);
  assert.equal(randomMatchA.competition, randomMatchB.competition, "Random versus Random resolves one shared league");
  assert.ok(FOOTBALL_COMPETITIONS.includes(randomMatchA.competition), "Random versus Random resolves one of the six supported leagues");
  assert.deepEqual(randomMatchA.competitionDraw, randomMatchB.competitionDraw, "Random versus Random shares any required draw");

  await Promise.all([premier.close(), laliga.close(), explicit.close(), randomA.close(), randomFirst.close(), randomSecond.close()]);
}

async function testInvalidSport() {
  const response = await fetch(`${HTTP_BASE}/rooms/new?sport=tennis`);
  assert.equal(response.status, 400);
  const legacy = await fetch(`${HTTP_BASE}/rooms/new`);
  assert.equal(legacy.status, 200);
  assert.equal((await legacy.json()).sport, "basketball");
  const invalidCompetition = await fetch(`${HTTP_BASE}/rooms/new?sport=soccer&competition=mls`);
  assert.equal(invalidCompetition.status, 400);
}

async function testGuestAccountState() {
  const response = await fetch(`${HTTP_BASE}/auth/me`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: null });
  const protectedResponse = await fetch(`${HTTP_BASE}/account/progress`);
  assert.equal(protectedResponse.status, 401);
  const unconfiguredGoogle = await fetch(`${HTTP_BASE}/auth/google/start`, { redirect: "manual" });
  assert.equal(unconfiguredGoogle.status, 503);
}

async function testRateLimits() {
  const roomClient = crypto.randomUUID();
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await fetch(`${HTTP_BASE}/rooms/new`, { headers: { "X-Your-Five-Client": roomClient } });
    assert.equal(response.status, 200, `room creation attempt ${attempt + 1} should be allowed`);
  }
  const blockedRoom = await fetch(`${HTTP_BASE}/rooms/new`, { headers: { "X-Your-Five-Client": roomClient } });
  assert.equal(blockedRoom.status, 429);
  assert.equal(blockedRoom.headers.get("Retry-After"), "60");

  const matchmakingClient = crypto.randomUUID();
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(`${HTTP_BASE}/matchmaking?client=${matchmakingClient}`);
    assert.equal(response.status, 426, `matchmaking attempt ${attempt + 1} should reach the WebSocket handler`);
  }
  const blockedMatchmaking = await fetch(`${HTTP_BASE}/matchmaking?client=${matchmakingClient}`);
  assert.equal(blockedMatchmaking.status, 429);
  assert.equal(blockedMatchmaking.headers.get("Retry-After"), "60");
}

await testPrivateRoom("basketball");
await testPrivateRoom("soccer");
await testPrivateRoom("soccer", "random");
await testPrivateRoom("soccer", "premier-league-2025-26");
await testMatchmaking("basketball");
await testMatchmaking("soccer");
await testIsolatedQueues();
await testFootballCompetitionQueues();
await testInvalidSport();
await testGuestAccountState();
await testRateLimits();
console.log(`Cloudflare integration checks passed against ${HTTP_BASE}`);
