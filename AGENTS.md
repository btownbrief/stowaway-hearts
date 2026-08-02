# Stowaway Hearts — agent instructions

Shared brain for AI agents working in this repo. Read `README.md` first. Stephen is non-technical, so explain consequential changes in plain language.

## What this is

Classic four-player Hearts aboard the Champlain ferry. Plain static site: `index.html`, `style.css`, and ES modules in `js/`. No build step, accounts, analytics, or ads.

## The one non-negotiable

Every game rule lives in `js/engine.js` as pure functions over one plain JSON-serializable state object. The engine imports nothing and never touches the DOM, timers, `Date`, or `Math.random`; its seeded shuffle state travels inside the game state. `applyMove` always returns a new state. `js/bot.js` may only use the engine's public API, and `js/main.js` is UI only.

## Online play (the rooms layer)

`js/rooms.js` is the fleet's vendored online client; its canonical copy lives in `four-in-a-rowboat` and must remain verbatim. The room stores the complete engine state plus a version. Seat index equals player index; the host is seat 0, and Stowaway Hearts rooms always require exactly four phones. `scripts/rooms-shim.mjs` is the verbatim local backend stand-in. Hidden hands are present in shared state for deterministic play, but the honest UI renders only this phone's hand.

## Before you finish

Run `node scripts/test-engine.mjs`, `node scripts/test-rooms.mjs`, and `node --check` on every authored JavaScript file. Keep bot choices under 300ms. If the UI changes, inspect it at phone width and report what was verified.
