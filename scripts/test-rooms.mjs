// Four-phone online wiring test using the untouched room client and local shim.
import { createRooms } from './rooms-shim.mjs';
import { createInitialState, legalMoves, applyMove, getStatus } from '../js/engine.js';

const GAME = 'stowaway-hearts';
const stores = new Map();
let current = 'A';
globalThis.localStorage = {
  getItem: (key) => stores.get(current)?.get(key) ?? null,
  setItem: (key, value) => stores.get(current).set(key, String(value)),
  removeItem: (key) => stores.get(current).delete(key),
};
function device(id) { if (!stores.has(id)) stores.set(id, new Map()); current = id; }
for (const id of ['A', 'B', 'C', 'D', 'E']) device(id);
device('A');

let passed = 0;
function t(condition, label) {
  if (!condition) { console.error(`FAIL: ${label}`); process.exit(1); }
  passed++; console.log(`  ok — ${label}`);
}
async function expectCode(promise, code, label) {
  try { await promise; t(false, `${label} (no error)`); }
  catch (err) { t(err?.code === code, `${label} (got ${err?.code})`); }
}

const shim = createRooms();
let backendReady = true;
globalThis.BTOWN_ROOMS_URL = 'http://rooms.test';
globalThis.fetch = async (url, options = {}) => {
  if (!backendReady) return new Response('{}', { status: 404 });
  const match = String(url).match(/\/rest\/v1\/rpc\/(\w+)$/);
  if ((options.method || 'GET') !== 'POST' || !match || !shim.rpcs[match[1]]) return new Response('{}', { status: 404 });
  try {
    const body = shim.rpcs[match[1]](JSON.parse(options.body || '{}')) ?? {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ message: err.message }), { status: err.rpc ? 400 : 500, headers: { 'Content-Type': 'application/json' } });
  }
};

const { OnlineMatch, savedSession, RoomsError } = await import('../js/rooms.js');
let rng = 0xdecafbad;
function choice(items) { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return items[rng % items.length]; }
async function sync(phones) {
  for (const phone of phones) { device(phone.device); await phone.match._fetch(); }
  const truth = JSON.stringify(phones[0].match.state);
  return phones.every((phone) => JSON.stringify(phone.match.state) === truth);
}

console.log('STOWAWAY HEARTS ROOMS');

device('A');
const host = await OnlineMatch.create({ game: GAME, name: 'Captain', seats: 4, state: createInitialState({ numPlayers: 4, seed: 808 }) });
t(/^[A-Z2-9]{4}$/.test(host.code) && host.seat === 0 && host.status === 'waiting', 'host creates a four-seat room in player seat 0');
t(savedSession(GAME)?.roomId === host.roomId, 'host session is saved for rejoin');

device('B');
await expectCode(OnlineMatch.join({ game: GAME, code: 'ZZZZ', name: 'Lost' }), 'not_found', 'bad code is rejected');
await expectCode(OnlineMatch.join({ game: 'crazy-eights', code: host.code, name: 'Wrong Dock' }), 'wrong_game', 'wrong game code is rejected');
const b = await OnlineMatch.join({ game: GAME, code: ` ${host.code.toLowerCase()} `, name: 'Deckhand Dot' });
t(b.seat === 1 && b.status === 'waiting', 'seat 1 joins and room keeps waiting');
device('C');
const c = await OnlineMatch.join({ game: GAME, code: host.code, name: 'Old Salt' });
t(c.seat === 2 && c.status === 'waiting', 'seat 2 joins and room keeps waiting');
device('D');
const d = await OnlineMatch.join({ game: GAME, code: host.code, name: 'the Purser' });
t(d.seat === 3 && d.status === 'playing', 'seat 3 fills the ferry and starts play');
device('E');
await expectCode(OnlineMatch.join({ game: GAME, code: host.code, name: 'Stowaway' }), 'room_started', 'a fifth phone cannot board');

const phones = [{ device: 'A', match: host }, { device: 'B', match: b }, { device: 'C', match: c }, { device: 'D', match: d }];
t(await sync(phones), 'all four phones receive the seeded deal');
t(host.seats.length === 4 && host.opponents().length === 3, 'host sees all three rival names');

device('A');
const first = applyMove(host.state, choice(legalMoves(host.state)));
await host.push(first);
t(host.version === 1, 'host publishes the first pass at version 1');
device('B');
await b._fetch();
const stale = applyMove(b.state, choice(legalMoves(b.state)));
await b.push(stale);
device('C');
await c._fetch();
const competing = applyMove(c.state, choice(legalMoves(c.state)));
device('D');
await d._fetch();
const winnerVersionMove = applyMove(d.state, choice(legalMoves(d.state)));
await d.push(winnerVersionMove);
device('C');
await expectCode(c.push(competing), 'version_conflict', 'out-of-turn stale phone is version-conflicted');
t(JSON.stringify(c.state) === JSON.stringify(d.state), 'conflict refetches server truth');
t(new RoomsError('offline').code === 'offline', 'room failures expose stable error codes');

let moves = 3;
let synced = await sync(phones);
while (!getStatus(host.state).over && moves < 2000 && synced) {
  const truth = host.state;
  const mover = phones.find((phone) => phone.match.seat === truth.currentPlayer);
  device(mover.device);
  await mover.match._fetch();
  const next = applyMove(mover.match.state, choice(legalMoves(mover.match.state)));
  await mover.match.push(next, { over: getStatus(next).over });
  moves++;
  synced = await sync(phones);
}
t(synced, 'all four phones stay JSON-identical after every move');
t(getStatus(host.state).over, `full online match reaches 100 points in ${moves} moves`);
t(host.status === 'over', 'room closes when the engine match ends');
t(host.state.numPlayers === 4 && host.state.hands.length === 4, 'engine player seats remain mapped one-to-one to phones');

device('B');
const oldVersion = b.version;
const rematch = createInitialState({ numPlayers: 4, seed: 909 });
await b.push(rematch, {});
t(b.status === 'playing' && b.version === oldVersion + 1, 'any seated phone can deal a rematch');
device('A');
const resumed = await OnlineMatch.resume({ game: GAME });
t(resumed.roomId === host.roomId && resumed.seat === 0 && resumed.status === 'playing', 'host can resume into the same engine seat');
await resumed.leave();
t(savedSession(GAME) === null, 'leaving clears the local session');
device('D');
await d._fetch();
t(d.status === 'over' && d.opponents().some((opp) => opp.left), 'remaining crew sees a departure');

backendReady = false;
const fresh = await import('../js/rooms.js?not-ready');
device('E');
await expectCode(fresh.OnlineMatch.create({ game: GAME, name: 'E', state: {}, seats: 4 }), 'not_ready', 'missing backend reads as not_ready');

console.log(`\nALL ROOMS TESTS PASSED (${passed} checks)`);
process.exit(0);
