import assert from 'node:assert/strict';
import { createInitialState, legalMoves, applyMove, getStatus, TWO_CLUBS, FINE } from '../js/engine.js';
import { chooseMove } from '../js/bot.js';

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`  ok — ${name}`); }
const clone = (value) => JSON.parse(JSON.stringify(value));
const play = (state, card) => applyMove(state, { type: 'play', card });

console.log('STOWAWAY HEARTS ENGINE');

test('same seed deals the same JSON state', () => {
  assert.deepEqual(createInitialState({ numPlayers: 4, seed: 440 }), createInitialState({ numPlayers: 4, seed: 440 }));
});
test('different seeds deal differently', () => {
  assert.notDeepEqual(createInitialState({ numPlayers: 4, seed: 440 }).hands, createInitialState({ numPlayers: 4, seed: 441 }).hands);
});
test('exactly four players are supported', () => {
  assert.throws(() => createInitialState({ numPlayers: 3, seed: 1 }), /exactly 4/);
  assert.equal(createInitialState({ numPlayers: 4, seed: 1 }).hands.length, 4);
});
test('deal contains 52 unique cards in four 13-card hands', () => {
  const state = createInitialState({ numPlayers: 4, seed: 2 });
  assert.deepEqual(state.hands.map((hand) => hand.length), [13, 13, 13, 13]);
  assert.equal(new Set(state.hands.flat()).size, 52);
});
test('applyMove is immutable and survives JSON round-trip', () => {
  const state = createInitialState({ numPlayers: 4, seed: 3 });
  const before = JSON.stringify(state);
  const next = applyMove(state, legalMoves(state)[0]);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(JSON.parse(JSON.stringify(next)), next);
});
test('pass rotation is left, right, across, hold', () => {
  let state = createInitialState({ numPlayers: 4, seed: 4 });
  assert.equal(state.passDirection, 'left');
  for (const direction of ['right', 'across', 'hold']) {
    state.phase = 'roundEnd';
    state = applyMove(state, { type: 'nextRound' });
    assert.equal(state.passDirection, direction);
  }
  assert.equal(state.phase, 'playing');
});
test('all four passing turns rotate and transfer three cards', () => {
  let state = createInitialState({ numPlayers: 4, seed: 5 });
  const chosen = [];
  for (let p = 0; p < 4; p++) {
    assert.equal(state.currentPlayer, p);
    const move = legalMoves(state)[0]; chosen.push(move.cards);
    state = applyMove(state, move);
  }
  assert.equal(state.phase, 'playing');
  assert.deepEqual(state.hands.map((hand) => hand.length), [13, 13, 13, 13]);
  for (let p = 0; p < 4; p++) for (const card of chosen[p]) assert(state.hands[(p + 1) % 4].includes(card));
});
test('2 of clubs is the only opening lead', () => {
  let state = createInitialState({ numPlayers: 4, seed: 6 });
  while (state.phase === 'passing') state = applyMove(state, legalMoves(state)[0]);
  assert.deepEqual(legalMoves(state), [{ type: 'play', card: TWO_CLUBS }]);
});
test('turn rotates through all four seats within a trick', () => {
  let state = createInitialState({ numPlayers: 4, seed: 7 });
  while (state.phase === 'passing') state = applyMove(state, legalMoves(state)[0]);
  const leader = state.currentPlayer;
  state = applyMove(state, legalMoves(state)[0]);
  assert.equal(state.currentPlayer, (leader + 1) % 4);
  state = applyMove(state, legalMoves(state)[0]);
  assert.equal(state.currentPlayer, (leader + 2) % 4);
  state = applyMove(state, legalMoves(state)[0]);
  assert.equal(state.currentPlayer, (leader + 3) % 4);
});
test('players must follow the led suit when able', () => {
  const state = createInitialState({ numPlayers: 4, seed: 8 });
  state.phase = 'playing'; state.trickNumber = 2; state.currentPlayer = 1;
  state.currentTrick = [{ player: 0, card: '9D' }];
  state.hands[1] = ['2D', 'AH', 'KS'];
  assert.deepEqual(legalMoves(state), [{ type: 'play', card: '2D' }]);
});
test('hearts cannot lead before they are broken unless only hearts remain', () => {
  const state = createInitialState({ numPlayers: 4, seed: 9 });
  state.phase = 'playing'; state.trickNumber = 3; state.currentPlayer = 0; state.currentTrick = []; state.heartsBroken = false;
  state.hands[0] = ['2H', 'AH', '7C'];
  assert.deepEqual(legalMoves(state), [{ type: 'play', card: '7C' }]);
  state.hands[0] = ['2H', 'AH'];
  assert.equal(legalMoves(state).length, 2);
});
test('points and the Fine cannot be dumped on trick one when a clean discard exists', () => {
  const state = createInitialState({ numPlayers: 4, seed: 10 });
  state.phase = 'playing'; state.trickNumber = 0; state.currentPlayer = 2;
  state.currentTrick = [{ player: 0, card: '2C' }, { player: 1, card: '7C' }];
  state.hands[2] = ['2H', FINE, '9D'];
  assert.deepEqual(legalMoves(state), [{ type: 'play', card: '9D' }]);
});
test('a completed trick awards hearts and the 13-point Fine to its winner', () => {
  const state = createInitialState({ numPlayers: 4, seed: 11 });
  state.phase = 'playing'; state.trickNumber = 5; state.currentPlayer = 3;
  state.currentTrick = [{ player: 0, card: '2S' }, { player: 1, card: FINE }, { player: 2, card: 'AH' }];
  state.hands[3] = ['AS']; state.roundPoints = [0, 0, 0, 0];
  const next = play(state, 'AS');
  assert.equal(next.lastTrick.winner, 3);
  assert.equal(next.roundPoints[3], 14);
});
test('shooting the moon gives all three rivals 26 points', () => {
  const state = createInitialState({ numPlayers: 4, seed: 12 });
  state.phase = 'playing'; state.trickNumber = 12; state.currentPlayer = 3;
  state.currentTrick = [{ player: 0, card: 'AH' }, { player: 1, card: '2H' }, { player: 2, card: '3H' }];
  state.hands = [[], [], [], ['4H']]; state.roundPoints = [22, 0, 0, 0]; state.scores = [10, 20, 30, 40];
  const next = play(state, '4H');
  assert.equal(next.moonShooter, 0);
  assert.deepEqual(next.scores, [10, 46, 56, 66]);
});
test('game ends at 100 and the lowest cumulative score wins', () => {
  const state = createInitialState({ numPlayers: 4, seed: 13 });
  state.phase = 'playing'; state.trickNumber = 12; state.currentPlayer = 3;
  state.currentTrick = [{ player: 0, card: '2H' }, { player: 1, card: '3H' }, { player: 2, card: '4H' }];
  state.hands = [[], [], [], ['AH']]; state.roundPoints = [0, 0, 0, 10]; state.scores = [72, 85, 94, 88];
  const next = play(state, 'AH');
  const status = getStatus(next);
  assert.equal(status.over, true);
  assert.deepEqual(status.winners, [0]);
  assert.equal(next.scores[3], 102);
});
test('bot returns a legal move quickly', () => {
  const state = createInitialState({ numPlayers: 4, seed: 14 });
  const started = performance.now();
  const move = chooseMove(state);
  const elapsed = performance.now() - started;
  assert(legalMoves(state).some((candidate) => JSON.stringify(candidate) === JSON.stringify(move)));
  assert(elapsed < 300);
  console.log(`       bot move: ${elapsed.toFixed(2)}ms`);
});

let random = 0x51a7f00d;
function choice(items) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return items[random % items.length]; }
for (let game = 0; game < 200; game++) {
  let state = createInitialState({ numPlayers: 4, seed: game + 1000 });
  let moves = 0;
  while (!getStatus(state).over && moves < 2000) {
    const legal = legalMoves(state);
    assert(legal.length > 0);
    const before = JSON.stringify(state);
    state = applyMove(state, choice(legal));
    assert.equal(JSON.stringify(JSON.parse(before)), before);
    assert.equal(state.hands.length, 4);
    assert(state.currentPlayer >= 0 && state.currentPlayer < 4);
    if (state.phase === 'playing') {
      const remaining = state.hands.reduce((sum, hand) => sum + hand.length, 0);
      assert.equal(remaining, 52 - state.trickNumber * 4 - state.currentTrick.length);
    }
    moves++;
  }
  assert(getStatus(state).over, `soak game ${game} exceeded cap`);
}
passed++;
console.log('  ok — 200 random-legal complete games preserve invariants');
console.log(`\nALL ENGINE TESTS PASSED (${passed} checks)`);
