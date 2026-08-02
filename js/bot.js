// Bots only consult the public engine API.
import { legalMoves, suitOf, rankValue, isPoint, FINE } from './engine.js';

export const BOTS = [
  { name: 'Deckhand Dot', blurb: 'quick hands, light pockets' },
  { name: 'Old Salt', blurb: 'knows when to duck a wave' },
  { name: 'the Purser', blurb: 'very eager to lose that Fine' },
];

const highness = (card) => rankValue(card) + (card === FINE ? 40 : 0) + (suitOf(card) === 'H' ? 16 : 0);

function choosePass(state, moves) {
  const hand = state.hands[state.currentPlayer];
  const dangerous = hand.slice().sort((a, b) => highness(b) - highness(a)).slice(0, 3).sort();
  return moves.find((move) => move.cards.slice().sort().join() === dangerous.join()) || moves[0];
}

function choosePlay(state, moves) {
  const cards = moves.map((move) => move.card);
  const trick = state.currentTrick;
  if (!trick.length) {
    const nonPoints = cards.filter((card) => !isPoint(card));
    const pool = nonPoints.length ? nonPoints : cards;
    return { type: 'play', card: pool.sort((a, b) => rankValue(a) - rankValue(b))[0] };
  }
  const led = suitOf(trick[0].card);
  const follows = cards.every((card) => suitOf(card) === led);
  if (!follows) {
    if (cards.includes(FINE)) return { type: 'play', card: FINE };
    return { type: 'play', card: cards.sort((a, b) => highness(b) - highness(a))[0] };
  }
  const winningRank = Math.max(...trick.filter((play) => suitOf(play.card) === led).map((play) => rankValue(play.card)));
  const ducks = cards.filter((card) => rankValue(card) < winningRank).sort((a, b) => rankValue(b) - rankValue(a));
  return { type: 'play', card: ducks[0] || cards.slice().sort((a, b) => rankValue(a) - rankValue(b))[0] };
}

export function chooseMove(state) {
  const moves = legalMoves(state);
  if (!moves.length) throw new Error('Bot has no legal move');
  if (moves[0].type === 'pass') return choosePass(state, moves);
  if (moves[0].type === 'play') return choosePlay(state, moves);
  return moves[0];
}
