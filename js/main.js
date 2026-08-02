// STOWAWAY HEARTS — interface and room wiring only; all rules live in engine.js.
import { createInitialState, legalMoves, applyMove, getStatus, suitOf, rankValue, FINE } from './engine.js';
import { chooseMove, BOTS } from './bot.js';
import { OnlineMatch, savedSession, clearSession, getName } from './rooms.js';

const GAME = 'stowaway-hearts';
const $ = (id) => document.getElementById(id);
const screens = { menu: $('menu'), handoff: $('handoff'), game: $('game') };
const SUIT = { C: '♣', D: '♦', S: '♠', H: '♥' };
const PASS_COPY = { left: 'PASS LEFT', right: 'PASS RIGHT', across: 'PASS ACROSS', hold: 'HOLD STEADY' };
const BOT_SEATS = [null, ...BOTS];
let G = null;
let online = null;
let selected = new Set();
let handRevealed = true;
let botTimer = 0;
let panelIntent = 'host';
let onlinePushing = false;
let leaveTimer = 0;
let lobbyMatch = null;

const newSeed = () => (Math.random() * 0xffffffff) >>> 0;
const show = (name) => Object.entries(screens).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));

function playerName(player) {
  if (!G) return `Deckhand ${player + 1}`;
  if (G.mode === 'practice') return player === 0 ? 'You' : BOT_SEATS[player].name;
  if (G.mode === 'online') {
    if (online && player === online.myPlayer) return 'You';
    return online?.match.seats.find((seat) => seat.seat === player)?.name || `Deckhand ${player + 1}`;
  }
  return `Deckhand ${player + 1}`;
}

function handOwner() {
  if (G.mode === 'practice') return 0;
  if (G.mode === 'online') return online.myPlayer;
  return G.state.currentPlayer;
}

function canAct() {
  if (!G || !handRevealed || onlinePushing) return false;
  const status = getStatus(G.state);
  if (status.phase !== 'passing' && status.phase !== 'playing') return false;
  if (G.mode === 'practice') return G.state.currentPlayer === 0;
  if (G.mode === 'online') return online.match.status === 'playing' && G.state.currentPlayer === online.myPlayer;
  return true;
}

function cardEl(card, extra = '') {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `card ${suitOf(card) === 'H' || suitOf(card) === 'D' ? 'red' : ''} ${card === FINE ? 'fine' : ''} ${extra}`.trim();
  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = SUIT[suitOf(card)];
  const corner = document.createElement('span');
  corner.className = 'corner';
  corner.textContent = rank + '\n' + suit;
  corner.style.whiteSpace = 'pre-line';
  const pip = document.createElement('span');
  pip.className = 'pip';
  pip.textContent = card === FINE ? '⚓ Q♠' : suit;
  el.append(corner, pip);
  el.setAttribute('aria-label', card === FINE ? "Queen of spades, the Harbormaster's Fine" : `${rank} of ${suit}`);
  return el;
}

function sortedHand(hand) {
  const suitOrder = { C: 0, D: 1, S: 2, H: 3 };
  return hand.slice().sort((a, b) => suitOrder[suitOf(a)] - suitOrder[suitOf(b)] || rankValue(a) - rankValue(b));
}

function renderRivals() {
  const rivals = $('rivals');
  rivals.innerHTML = '';
  const mine = handOwner();
  for (let p = 0; p < 4; p++) {
    if (p === mine) continue;
    const el = document.createElement('div');
    el.className = `rival ${G.state.currentPlayer === p ? 'active' : ''}`;
    const name = document.createElement('span');
    name.className = 'rival-name';
    name.textContent = playerName(p);
    const count = document.createElement('span');
    count.className = 'rival-count';
    count.textContent = `🂠 ${G.state.hands[p].length} · ${G.state.scores[p]} pts`;
    el.append(name, count);
    rivals.appendChild(el);
  }
}

function renderTrick() {
  const trickEl = $('trick');
  trickEl.innerHTML = '';
  const plays = G.state.currentTrick.length ? G.state.currentTrick : (G.state.lastTrick?.plays || []);
  plays.forEach((play) => {
    const wrap = document.createElement('div');
    wrap.className = 'played';
    const card = cardEl(play.card);
    card.classList.add('played');
    wrap.replaceWith(card);
    trickEl.appendChild(card);
  });
  if (G.state.phase === 'passing') $('trickNote').textContent = `${PASS_COPY[G.state.passDirection]} · THREE CARDS`;
  else if (G.state.currentTrick.length) $('trickNote').textContent = `${playerName(G.state.currentPlayer).toUpperCase()} TO THE TABLE`;
  else if (G.state.lastTrick) $('trickNote').textContent = `${playerName(G.state.lastTrick.winner).toUpperCase()} TOOK ${G.state.lastTrick.points ? G.state.lastTrick.points + ' POINTS' : 'THE TRICK'}`;
  else $('trickNote').textContent = '2♣ LEADS THE CROSSING';
}

function renderScores(target) {
  target.innerHTML = '';
  for (let p = 0; p < 4; p++) {
    const row = document.createElement('div');
    row.className = 'score-row';
    const name = document.createElement('span');
    name.textContent = playerName(p);
    const round = document.createElement('span');
    round.textContent = `+${G.state.roundPoints[p]}`;
    const total = document.createElement('b');
    total.textContent = G.state.scores[p];
    row.append(name, round, total);
    target.appendChild(row);
  }
}

function statusCopy() {
  const state = G.state;
  if (state.phase === 'passing') {
    if (!canAct()) return `Waiting for ${playerName(state.currentPlayer)} to choose three…`;
    return `${PASS_COPY[state.passDirection]} · Pick any three cards to send.`;
  }
  if (state.phase === 'playing') {
    if (canAct()) return state.currentTrick.length ? 'Your play, deckhand.' : 'Lead the next trick.';
    return `${playerName(state.currentPlayer)} is weighing the tide…`;
  }
  return 'Crossing complete.';
}

function renderHand() {
  const handEl = $('hand');
  handEl.innerHTML = '';
  const owner = handOwner();
  $('handLabel').textContent = owner === 0 && G.mode === 'practice' ? 'YOUR HAND' : `${playerName(owner).toUpperCase()}'S HAND`;
  $('handCount').textContent = `${G.state.hands[owner].length} CARDS`;
  const legalCards = new Set(legalMoves(G.state).filter((move) => move.type === 'play').map((move) => move.card));
  if (!handRevealed) return;
  const cards = sortedHand(G.state.hands[owner]);
  const mid = (cards.length - 1) / 2;
  cards.forEach((card, index) => {
    const el = cardEl(card);
    el.style.setProperty('--rot', `${(index - mid) * Math.min(2.5, 24 / Math.max(cards.length, 1))}deg`);
    el.style.setProperty('--arc', `${Math.abs(index - mid) * 1.2}px`);
    if (selected.has(card)) el.classList.add('selected');
    if (canAct() && G.state.phase === 'playing' && legalCards.has(card)) el.classList.add('playable');
    el.addEventListener('click', () => onCard(card, el));
    handEl.appendChild(el);
  });
}

function render() {
  if (!G) return;
  const status = getStatus(G.state);
  $('roundLabel').textContent = `ROUND ${status.round} · ${PASS_COPY[status.passDirection]}`;
  $('statusLine').textContent = statusCopy();
  renderRivals();
  renderTrick();
  renderHand();
  const passing = G.state.phase === 'passing' && canAct();
  $('passBar').classList.toggle('hidden', !passing);
  $('passPrompt').textContent = selected.size === 3 ? 'Ready for the handoff.' : `Choose ${3 - selected.size} more card${3 - selected.size === 1 ? '' : 's'}`;
  $('passConfirm').disabled = selected.size !== 3;
  renderScores($('scoreRows'));
}

function onCard(card, el) {
  if (!canAct()) return;
  if (G.state.phase === 'passing') {
    if (selected.has(card)) selected.delete(card);
    else if (selected.size < 3) selected.add(card);
    render();
    return;
  }
  const move = legalMoves(G.state).find((candidate) => candidate.type === 'play' && candidate.card === card);
  if (!move) {
    el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
    $('statusLine').textContent = 'That card stays aboard — follow suit if you can.';
    return;
  }
  doMove(move);
}

$('passConfirm').addEventListener('click', () => {
  if (selected.size === 3 && canAct()) doMove({ type: 'pass', cards: [...selected] });
});

function afterLocalMove(previousPlayer) {
  selected.clear();
  const status = getStatus(G.state);
  if (status.phase === 'roundEnd' || status.over) {
    render();
    setTimeout(showRoundResult, 520);
    return;
  }
  if (G.mode === 'practice') {
    render();
    scheduleBot();
  } else if (G.mode === 'pass' && G.state.currentPlayer !== previousPlayer) {
    handRevealed = false;
    render();
    setTimeout(() => showHandoff(G.state.currentPlayer), 360);
  } else {
    render();
  }
}

function doMove(move) {
  const previousPlayer = G.state.currentPlayer;
  G.state = applyMove(G.state, move);
  if (G.mode === 'online') {
    onlinePushing = true;
    selected.clear();
    render();
    pushOnline(G.state);
  } else afterLocalMove(previousPlayer);
}

function scheduleBot() {
  clearTimeout(botTimer);
  if (!G || G.mode !== 'practice') return;
  const status = getStatus(G.state);
  if ((status.phase !== 'passing' && status.phase !== 'playing') || G.state.currentPlayer === 0) return;
  botTimer = setTimeout(() => {
    if (!G || G.mode !== 'practice' || G.state.currentPlayer === 0) return;
    const previous = G.state.currentPlayer;
    G.state = applyMove(G.state, chooseMove(G.state));
    afterLocalMove(previous);
  }, 420);
}

function startGame(mode) {
  clearTimeout(botTimer);
  online = null;
  selected.clear();
  handRevealed = mode !== 'pass';
  G = { mode, state: createInitialState({ numPlayers: 4, seed: newSeed() }) };
  if (mode === 'pass') showHandoff(G.state.currentPlayer);
  else { show('game'); render(); scheduleBot(); }
}

function showHandoff(player) {
  handRevealed = false;
  $('handoffTitle').textContent = `Pass to ${playerName(player)}`;
  $('handoffSub').textContent = G.state.phase === 'passing' ? `${PASS_COPY[G.state.passDirection]}. Choose three in private.` : 'No peeking. The lake remembers.';
  show('handoff');
}

$('handoffBtn').addEventListener('click', () => { handRevealed = true; selected.clear(); show('game'); render(); });
$('practiceBtn').addEventListener('click', () => startGame('practice'));
$('passBtn').addEventListener('click', () => startGame('pass'));
$('rulesBtn').addEventListener('click', () => $('rules').classList.toggle('hidden'));
$('scoreBtn').addEventListener('click', () => { renderScores($('scoreRows')); $('scorePanel').classList.remove('hidden'); });
$('scoreClose').addEventListener('click', () => $('scorePanel').classList.add('hidden'));

function showRoundResult() {
  const status = getStatus(G.state);
  const shooter = status.moonShooter;
  $('resultIcon').textContent = shooter === null ? '🛟' : '🌕';
  if (status.over) {
    const names = status.winners.map(playerName).join(' & ');
    $('resultTitle').textContent = status.winners.includes(handOwner()) ? 'LOW SCORE, HIGH HONORS!' : `${names.toUpperCase()} WINS THE VOYAGE`;
    $('resultText').textContent = `${names} kept the lightest ledger when the ferry crossed 100.`;
    $('nextBtn').textContent = '↻ NEW VOYAGE';
  } else {
    $('resultTitle').textContent = shooter === null ? 'CROSSING COMPLETE' : `${playerName(shooter).toUpperCase()} SHOT THE MOON!`;
    $('resultText').textContent = shooter === null ? 'The deck is swept. Check the ledger before the next run.' : 'All 26 points went overboard — and everyone else takes the hit.';
    $('nextBtn').textContent = 'DEAL THE NEXT CROSSING';
  }
  renderScores($('resultScores'));
  $('roundPanel').classList.remove('hidden');
}

$('nextBtn').addEventListener('click', () => {
  $('roundPanel').classList.add('hidden');
  if (getStatus(G.state).over) {
    if (G.mode === 'online') onlineRematch(); else startGame(G.mode);
    return;
  }
  doMove({ type: 'nextRound' });
  if (G.mode === 'pass') showHandoff(G.state.currentPlayer);
});

function leaveGame(source) {
  if (online) {
    if (source.dataset.armed !== '1') {
      source.dataset.armed = '1'; source.textContent = 'LEAVE CREW?';
      clearTimeout(leaveTimer); leaveTimer = setTimeout(() => { source.dataset.armed = ''; source.textContent = '⚓ DOCK'; }, 2500);
      return;
    }
    online.match.leave(); online = null;
  }
  clearTimeout(botTimer);
  G = null;
  $('roundPanel').classList.add('hidden'); $('departurePanel').classList.add('hidden');
  show('menu'); refreshRejoin();
}
$('homeBtn').addEventListener('click', () => leaveGame($('homeBtn')));
$('resultHome').addEventListener('click', () => leaveGame($('resultHome')));
$('departureHome').addEventListener('click', () => leaveGame($('departureHome')));

/* ------------------------------------------------------------- online play */
$('hostBtn').addEventListener('click', () => openPanel('host'));
$('joinBtn').addEventListener('click', () => openPanel('join'));
$('opCancel').addEventListener('click', () => $('onlinePanel').classList.add('hidden'));
$('opGo').addEventListener('click', onlineGo);
$('lobbyCancel').addEventListener('click', cancelLobby);
$('rejoinBtn').addEventListener('click', rejoinCrew);
$('opCode').addEventListener('input', () => { $('opCode').value = $('opCode').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
[$('opName'), $('opCode')].forEach((el) => el.addEventListener('keydown', (event) => { if (event.key === 'Enter') onlineGo(); }));

function openPanel(intent) {
  panelIntent = intent;
  $('opTitle').textContent = intent === 'host' ? 'START A CREW' : 'JOIN A CREW';
  $('opGo').textContent = intent === 'host' ? 'GET A CODE' : 'BOARD THE FERRY';
  $('opSeatsWrap').classList.toggle('hidden', intent !== 'host');
  $('opCodeWrap').classList.toggle('hidden', intent === 'host');
  $('opError').classList.add('hidden');
  $('opName').value = $('opName').value || getName();
  $('onlinePanel').classList.remove('hidden');
  (intent === 'join' && $('opName').value ? $('opCode') : $('opName')).focus();
}

const ERRORS = { not_found: 'No ferry has that code.', room_full: 'That ferry already has four aboard.', room_started: 'That crew already left the dock.', not_ready: "Online play isn't switched on yet — check back soon!", offline: "Can't reach the ferry. Check your connection." };
function friendly(err) {
  if (err?.code === 'wrong_game') return `That code belongs to ${String(err.detail || 'another game').replace(/-/g, ' ')}.`;
  return ERRORS[err?.code] || 'The boarding list got wet. Please try again.';
}

async function onlineGo() {
  if ($('opGo').disabled) return;
  const name = $('opName').value.trim();
  if (!name) { $('opError').textContent = 'Every deckhand needs a name.'; $('opError').classList.remove('hidden'); return; }
  $('opGo').disabled = true; $('opError').classList.add('hidden');
  try {
    let match;
    if (panelIntent === 'host') match = await OnlineMatch.create({ game: GAME, name, seats: 4, state: createInitialState({ numPlayers: 4, seed: newSeed() }) });
    else {
      const code = $('opCode').value.trim();
      if (code.length !== 4) throw Object.assign(new Error(), { code: 'bad_code' });
      match = await OnlineMatch.join({ game: GAME, code, name });
    }
    $('onlinePanel').classList.add('hidden');
    if (match.status === 'waiting') openLobby(match); else enterOnline(match);
  } catch (err) {
    $('opError').textContent = err?.code === 'bad_code' ? 'The boarding code is 4 characters.' : friendly(err);
    $('opError').classList.remove('hidden');
  } finally { $('opGo').disabled = false; }
}

function renderLobby(match) {
  $('lobbyCode').textContent = match.code;
  $('lobbyNames').innerHTML = '';
  for (let p = 0; p < 4; p++) {
    const seat = match.seats.find((candidate) => candidate.seat === p);
    const li = document.createElement('li');
    li.textContent = seat ? `✓ ${seat.name} · Deckhand ${p + 1}` : `○ Waiting for Deckhand ${p + 1}…`;
    $('lobbyNames').appendChild(li);
  }
}

function openLobby(match) {
  if (lobbyMatch && lobbyMatch !== match) lobbyMatch.stop();
  lobbyMatch = match; renderLobby(match); $('lobby').classList.remove('hidden');
  match.start({
    onStatus: (status) => { if (status === 'playing') { $('lobby').classList.add('hidden'); enterOnline(match); } },
    onPresence: () => renderLobby(match), onError: () => {},
  });
}

function cancelLobby() { if (lobbyMatch) lobbyMatch.leave(); lobbyMatch = null; $('lobby').classList.add('hidden'); refreshRejoin(); }

function enterOnline(match) {
  lobbyMatch = null; online = { match, myPlayer: match.seat }; G = { mode: 'online', state: match.state };
  selected.clear(); handRevealed = true; onlinePushing = false;
  $('lobby').classList.add('hidden'); $('onlinePanel').classList.add('hidden'); show('game'); render();
  match.start({ onState: onRemoteState, onStatus: onRemoteStatus, onPresence: onPresence, onError: onOnlineError });
  if (getStatus(G.state).phase === 'roundEnd' || getStatus(G.state).over) showRoundResult();
}

function onRemoteState(state) {
  if (!online) return;
  G.state = state; onlinePushing = false; selected.clear(); render();
  const status = getStatus(state);
  if (status.phase === 'roundEnd' || status.over) setTimeout(showRoundResult, 350);
}
function onRemoteStatus(status) { if (status === 'over' && online && !getStatus(G.state).over) showDeparture(); }
function onPresence(opponents) { const gone = opponents.find((opp) => opp.left); if (gone && !getStatus(G.state).over) showDeparture(gone.name); }
function onOnlineError(err) { if (err?.code === 'not_found') { clearSession(GAME); online = null; G = null; show('menu'); refreshRejoin(); } }
function showDeparture(name = 'A deckhand') { $('departureText').textContent = `${name} stepped ashore, so this voyage is over.`; $('departurePanel').classList.remove('hidden'); }

async function pushOnline(state) {
  try { await online.match.push(state, { over: getStatus(state).over }); onlinePushing = false; render(); }
  catch (err) {
    onlinePushing = false;
    if (err?.code === 'version_conflict') G.state = online.match.state;
    else $('statusLine').textContent = 'Choppy connection — holding this card aboard.';
    render();
  }
}

async function onlineRematch() {
  const fresh = createInitialState({ numPlayers: 4, seed: newSeed() });
  $('roundPanel').classList.add('hidden');
  try { await online.match.push(fresh, {}); G.state = fresh; render(); }
  catch (err) { if (err?.code === 'version_conflict') { G.state = online.match.state; render(); } }
}

async function rejoinCrew() {
  $('rejoinBtn').disabled = true;
  try { const match = await OnlineMatch.resume({ game: GAME }); if (match.status === 'waiting') openLobby(match); else enterOnline(match); }
  catch (err) { if (['not_found', 'not_seated', 'room_started'].includes(err?.code)) clearSession(GAME); refreshRejoin(); }
  finally { $('rejoinBtn').disabled = false; }
}
function refreshRejoin() { const saved = savedSession(GAME); $('rejoinBtn').classList.toggle('hidden', !saved); if (saved) $('rejoinBtn').textContent = `↩ REJOIN CREW ${saved.code}`; }

/* -------------------------------------------------------- crew-link invites */
$('inviteBtn').addEventListener('click', async () => {
  const match = lobbyMatch;
  if (!match) return;
  const url = `${location.origin}${location.pathname}?join=${match.code}`;
  const text = `Board my Stowaway Hearts crew! ⛴️ Dodge the Harbormaster's Fine: ${url}`;
  try {
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) await navigator.share({ text });
    else {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else { const area = document.createElement('textarea'); area.value = url; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); }
      $('inviteBtn').textContent = '✓ LINK COPIED';
      setTimeout(() => { $('inviteBtn').textContent = '📲 SEND AN INVITE'; }, 1800);
    }
  } catch { /* dismissed share sheet or denied clipboard */ }
});

refreshRejoin();
(() => {
  const code = new URLSearchParams(location.search).get('join');
  if (!code || !/^[A-Za-z0-9]{4}$/.test(code)) return;
  history.replaceState(null, '', location.pathname);
  openPanel('join'); $('opCode').value = code.toUpperCase();
  if ($('opName').value) $('opCode').focus();
})();
