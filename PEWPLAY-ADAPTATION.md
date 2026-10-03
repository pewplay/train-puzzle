# Train Puzzle for PewPlay

This directory contains the original static game adapted for the PewPlay game template. Open `index.html` to play.

`game.json` holds the game page text. `preview.png` and `cover.png` provide the page images. The PewPlay workflow checks pushes to `preview` and `main`. The game remains a draft until you remove `"draft": true` after reviewing it.

Game controls: Select a difficulty and rearrange the track tiles to guide the train to the finish.

## Update (second pass)

- Full-viewport canvas with devicePixelRatio; the isometric board is fitted to the screen in every orientation, with a side panel (landscape) or bottom panel (portrait) holding the level, the spare piece, Finished and Pause.
- Pointer Events: tap/click a tile to swap, or drag the spare piece (or drag across the board) and release on a tile; exact isometric hit test; hover preview on desktop.
- Levels: the train gets faster each level; level, best level and difficulty are saved as `train-puzzle:level`, `train-puzzle:best`, `train-puzzle:difficulty`.
- In-page ticket screens for menu, pause, level complete and derailment; pause on tab hide; frame-rate independent movement.
- Removed external Google Font and the remote ticket SVG (ticket now drawn in CSS). New cover and screenshots.
