// STOWAWAY HEARTS — pure deterministic rules engine.

export const NUM_PLAYERS = 4;
export const FINE = 'QS';
export const TWO_CLUBS = '2C';
export const SUITS = ['C', 'D', 'S', 'H'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const PASS_DIRECTIONS = ['left', 'right', 'across', 'hold'];

const rankValue = (card) => RANKS.indexOf(card[0]);
const suitOf = (card) => card[1];
const isPoint = (card) => suitOf(card) === 'H' || card === FINE;
const clone = (value) => JSON.parse(JSON.stringify(value));

function normalizeSeed(seed) {
  const n = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1;
  return n || 0x6d2b79f5;
}

function nextRandom(seed) {
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return { seed: x >>> 0, value: (x >>> 0) / 4294967296 };
}

function shuffledDeck(seed) {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(rank + suit);
  let rng = seed;
  for (let i = deck.length - 1; i > 0; i--) {
    const next = nextRandom(rng);
    rng = next.seed;
    const j = Math.floor(next.value * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return { deck, rng };
}

function dealRound(base, roundIndex) {
  const shuffled = shuffledDeck(base.rng);
  const hands = Array.from({ length: NUM_PLAYERS }, () => []);
  shuffled.deck.forEach((card, i) => hands[i % NUM_PLAYERS].push(card));
  const passDirection = PASS_DIRECTIONS[roundIndex % PASS_DIRECTIONS.length];
  const twoClubsPlayer = hands.findIndex((hand) => hand.includes(TWO_CLUBS));
  return {
    ...base,
    rng: shuffled.rng,
    roundIndex,
    passDirection,
    phase: passDirection === 'hold' ? 'playing' : 'passing',
    currentPlayer: passDirection === 'hold' ? twoClubsPlayer : 0,
    hands,
    passSelections: Array(NUM_PLAYERS).fill(null),
    currentTrick: [],
    lastTrick: null,
    trickNumber: 0,
    heartsBroken: false,
    roundPoints: Array(NUM_PLAYERS).fill(0),
    lastAction: null,
    moonShooter: null,
  };
}

export function createInitialState(options = {}) {
  const opts = typeof options === 'object' && options !== null ? options : {};
  const numPlayers = opts.numPlayers ?? NUM_PLAYERS;
  if (numPlayers !== NUM_PLAYERS) throw new Error('Stowaway Hearts requires exactly 4 players');
  const base = {
    version: 1,
    numPlayers: NUM_PLAYERS,
    rng: normalizeSeed(opts.seed ?? 1),
    scores: Array(NUM_PLAYERS).fill(0),
  };
  return dealRound(base, 0);
}

function combinationsOfThree(hand) {
  const moves = [];
  for (let a = 0; a < hand.length - 2; a++) {
    for (let b = a + 1; b < hand.length - 1; b++) {
      for (let c = b + 1; c < hand.length; c++) {
        moves.push({ type: 'pass', cards: [hand[a], hand[b], hand[c]] });
      }
    }
  }
  return moves;
}

function playableCards(state) {
  const hand = state.hands[state.currentPlayer];
  if (state.trickNumber === 0 && state.currentTrick.length === 0) return [TWO_CLUBS];
  if (state.currentTrick.length) {
    const led = suitOf(state.currentTrick[0].card);
    const following = hand.filter((card) => suitOf(card) === led);
    if (following.length) return following;
    if (state.trickNumber === 0) {
      const clean = hand.filter((card) => !isPoint(card));
      if (clean.length) return clean;
    }
    return hand.slice();
  }
  if (!state.heartsBroken) {
    const nonHearts = hand.filter((card) => suitOf(card) !== 'H');
    if (nonHearts.length) return nonHearts;
  }
  return hand.slice();
}

export function legalMoves(state) {
  if (!state || state.numPlayers !== NUM_PLAYERS) return [];
  if (state.phase === 'passing') return combinationsOfThree(state.hands[state.currentPlayer]);
  if (state.phase === 'playing') return playableCards(state).map((card) => ({ type: 'play', card }));
  if (state.phase === 'roundEnd') return [{ type: 'nextRound' }];
  return [];
}

function sameMove(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === 'play') return a.card === b.card;
  if (a.type === 'nextRound') return true;
  if (a.type === 'pass') {
    const ac = [...(a.cards || [])].sort().join(',');
    const bc = [...(b.cards || [])].sort().join(',');
    return ac === bc;
  }
  return false;
}

function passRecipient(player, direction) {
  if (direction === 'left') return (player + 1) % NUM_PLAYERS;
  if (direction === 'right') return (player + NUM_PLAYERS - 1) % NUM_PLAYERS;
  return (player + 2) % NUM_PLAYERS;
}

function finishPassing(state) {
  const hands = state.hands.map((hand, player) =>
    hand.filter((card) => !state.passSelections[player].includes(card)));
  state.passSelections.forEach((cards, player) => {
    hands[passRecipient(player, state.passDirection)].push(...cards);
  });
  state.hands = hands;
  state.phase = 'playing';
  state.currentPlayer = hands.findIndex((hand) => hand.includes(TWO_CLUBS));
}

function trickWinner(trick) {
  const led = suitOf(trick[0].card);
  return trick.filter((play) => suitOf(play.card) === led)
    .reduce((best, play) => rankValue(play.card) > rankValue(best.card) ? play : best).player;
}

function finishRound(state) {
  const raw = state.roundPoints.slice();
  const shooter = raw.findIndex((points) => points === 26);
  const scored = shooter >= 0
    ? raw.map((_, player) => player === shooter ? 0 : 26)
    : raw;
  state.moonShooter = shooter >= 0 ? shooter : null;
  state.scores = state.scores.map((score, player) => score + scored[player]);
  state.phase = state.scores.some((score) => score >= 100) ? 'gameOver' : 'roundEnd';
}

export function applyMove(state, move) {
  const legal = legalMoves(state);
  if (!legal.some((candidate) => sameMove(candidate, move))) throw new Error('Illegal move');
  if (move.type === 'nextRound') return dealRound({ ...clone(state), rng: state.rng }, state.roundIndex + 1);

  const next = clone(state);
  const player = next.currentPlayer;
  if (move.type === 'pass') {
    next.passSelections[player] = move.cards.slice();
    next.lastAction = { type: 'pass', player };
    const waiting = next.passSelections.findIndex((cards) => cards === null);
    if (waiting >= 0) next.currentPlayer = waiting;
    else finishPassing(next);
    return next;
  }

  next.hands[player] = next.hands[player].filter((card) => card !== move.card);
  next.currentTrick.push({ player, card: move.card });
  if (suitOf(move.card) === 'H') next.heartsBroken = true;
  next.lastAction = { type: 'play', player, card: move.card };
  if (next.currentTrick.length < NUM_PLAYERS) {
    next.currentPlayer = (player + 1) % NUM_PLAYERS;
    return next;
  }

  const winner = trickWinner(next.currentTrick);
  const points = next.currentTrick.reduce((sum, play) =>
    sum + (suitOf(play.card) === 'H' ? 1 : play.card === FINE ? 13 : 0), 0);
  next.roundPoints[winner] += points;
  next.lastTrick = { plays: next.currentTrick, winner, points };
  next.currentTrick = [];
  next.trickNumber += 1;
  next.currentPlayer = winner;
  if (next.trickNumber === 13) finishRound(next);
  return next;
}

export function getStatus(state) {
  const over = state.phase === 'gameOver';
  const low = over ? Math.min(...state.scores) : null;
  return {
    status: over ? 'over' : state.phase,
    over,
    phase: state.phase,
    turn: state.currentPlayer,
    round: state.roundIndex + 1,
    passDirection: state.passDirection,
    winners: over ? state.scores.map((score, player) => score === low ? player : -1).filter((p) => p >= 0) : [],
    moonShooter: state.moonShooter,
  };
}

export { suitOf, rankValue, isPoint };
