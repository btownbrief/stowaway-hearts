# STOWAWAY HEARTS ♥

Classic four-player Hearts on the Lake Champlain ferry. Dodge the heart cards and the Queen of Spades — rebranded aboard ship as **the Harbormaster's Fine** — in practice, four-human pass-and-play, or four-phone online play.

## Rules

- Pass three cards left, right, across, then hold on a four-round rotation.
- The 2♣ leads. Follow suit when possible. Hearts cannot lead until broken.
- No heart or Q♠ may be discarded on the first trick unless there is no alternative.
- Hearts cost 1 point; the Q♠ costs 13. Taking all 26 makes the other three players score 26.
- When any score reaches 100, the lowest total wins.

## Structure

- `js/engine.js`: pure deterministic rules and cumulative scoring
- `js/bot.js`: Deckhand Dot, Old Salt, and the Purser
- `js/main.js`: interface, hidden-hand handoffs, and online rooms
- `js/rooms.js`: untouched fleet room client
- `scripts/test-engine.mjs`: rules and 200-game soak suite
- `scripts/test-rooms.mjs`: four-phone synchronization suite

Open `index.html` through any static web server. There is no install or build step.

Live home: https://play.btownbrief.com/stowaway-hearts/
