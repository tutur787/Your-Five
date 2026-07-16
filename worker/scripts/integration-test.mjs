import assert from "node:assert/strict";

const HTTP_BASE = (process.env.WORKER_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const WS_BASE = HTTP_BASE.replace(/^http/, "ws");
const TIMEOUT_MS = 5000;

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

async function createPrivateRoom(sport = "basketball") {
  const response = await fetch(`${HTTP_BASE}/rooms/new?sport=${sport}`);
  assert.equal(response.status, 200);
  const room = await response.json();
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(typeof room.token, "string");
  assert.ok(room.token.length > 0);
  assert.equal(room.sport, sport);
  return room;
}

async function testPrivateRoom(sport = "basketball") {
  const room = await createPrivateRoom(sport);
  const a = await connectRoom(room.code, room.token);
  const b = await connectRoom(room.code);
  assert.equal(a.joined.seat, "A");
  assert.equal(b.joined.seat, "B");
  assert.equal(a.joined.roomKind, "private");
  assert.equal(a.joined.sport, sport);
  assert.equal(b.joined.sport, sport);
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
  const b = await connectRoom(matchB.code, matchB.token);
  assert.equal(a.joined.seat, "A");
  assert.equal(b.joined.seat, "B");
  assert.equal(a.joined.roomKind, "matched");
  assert.equal(a.joined.sport, sport);
  assert.ok(a.joined.state);
  assert.equal(a.joined.state.sport, sport);

  a.socket.send({ type: "action", id: "malformed" });
  const invalidAck = await a.socket.waitFor((message) => message.type === "ack" && message.id === "malformed");
  assert.equal(invalidAck.ok, false);

  const actingSeat = a.joined.state.turn;
  const actor = actingSeat === "A" ? a.socket : b.socket;
  actor.send({ type: "action", id: "valid", action: { type: "openBid", seat: actingSeat, startBid: 1 } });
  const validAck = await actor.waitFor((message) => message.type === "ack" && message.id === "valid");
  assert.equal(validAck.ok, true);

  await Promise.all([a.socket.close(), b.socket.close()]);
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

async function testInvalidSport() {
  const response = await fetch(`${HTTP_BASE}/rooms/new?sport=tennis`);
  assert.equal(response.status, 400);
  const legacy = await fetch(`${HTTP_BASE}/rooms/new`);
  assert.equal(legacy.status, 200);
  assert.equal((await legacy.json()).sport, "basketball");
}

await testPrivateRoom("basketball");
await testPrivateRoom("soccer");
await testMatchmaking("basketball");
await testMatchmaking("soccer");
await testIsolatedQueues();
await testInvalidSport();
console.log(`Cloudflare integration checks passed against ${HTTP_BASE}`);
