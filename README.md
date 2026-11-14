# Puzzle Drill

A static practice site for drilling rated nestris.org puzzles until you've memorized them, styled after the nestris.org puzzle page.
There's no build step and no server, so it runs on GitHub Pages as plain files.

## Modes

- **Learn**: spaced repetition. Puzzles that are due come first, missed puzzles are asked again a few puzzles later, then up to N new puzzles are added (N is set in Settings).
  Correct answers on due puzzles schedule the next review in 1 → 3 → 7 → 16 → 35 days. A miss resets the puzzle.
  A puzzle counts as *mastered* once it reaches the 7-day stage.
  New puzzles come **hardest first** by default, so Learn works its way down the set by difficulty (changeable to easiest first or random in Settings).
- **Perfect Run**: N puzzles in a row, aiming for zero mistakes. Afterwards, *Re-run misses* until the set is clean.
- **Mistakes**: only puzzles you have missed, worst first.
- **Endless**: random puzzles from the set.
- **Browse**: every puzzle as a board thumbnail with your record on it. Click one to play it.

**Difficulty range** (per star rating): limit every mode, the progress numbers and Browse to a slice of the set ranked by global difficulty, i.e. how rarely players solve each puzzle on nestris.org. There are presets (hardest 10% / 25% / 50%, easiest 50%) or a custom range such as "from the 5% to the 20% hardest". Only puzzles with engine details have a difficulty score.

Controls are the same as nestris.org: hover to move, click to place, Z/X to rotate, Q to undo.
After a puzzle: Enter/Space for the next one, R to retry, Esc to exit. Keys can be changed in Settings.
On a phone, tap to preview a placement, tap the preview to place it, and use the on-screen rotate buttons.

Progress is stored per puzzle ID in each player's browser (localStorage), so updating the puzzle data never touches anyone's progress. **Export progress** / **Import progress** on the home page back it up or move it to another device. Import merges: for each puzzle the more recently played copy wins, and settings come along too.

## Updating the puzzles

1. Run the scraper (`../tools/nestris-puzzle-scraper.js`) on nestris.org and click **Download all**.
2. Merge it into the site:
   ```bash
   node tools/import-scrape.mjs ~/Downloads/nestris-puzzles-*.json
   ```
   This keeps every puzzle already in `data/` and adds new ones. A puzzle that now has engine details replaces its old entry.
   Each data file gets a content hash in its name, so players pick up the new data on their next visit.
3. Commit and push. GitHub Pages redeploys within a minute or two.

Puzzles without details only know the best move. Correct/incorrect still works, but the engine table shows a single row.

## Run locally

```bash
python3 -m http.server 8791 --bind 127.0.0.1
```
Then open http://127.0.0.1:8791/. Opening `index.html` directly from disk won't work, because ES modules need http.

## Deploy to GitHub Pages

Push this folder to a GitHub repo, then go to **Settings → Pages → Deploy from a branch → `main` / root**.
Every path is relative, so it works at `https://<user>.github.io/<repo>/`.

## Tests

```bash
npm test
```
Runs `tests/scheduling.test.mjs` with Node's built-in test runner. It covers the spaced-repetition rules, Learn ordering, Perfect Run, the difficulty slices and backup merging. Nothing to install.

## Files

- `js/core.js`: nestris.org's `shared/` puzzle and tetris logic (board, pieces, puzzle ID decoding), bundled with esbuild. Don't edit it by hand.
- `js/board.js`: NES board rendering and the hover/click placement controls, ported from the nestris client.
- `js/session.js`: the drill modes. `js/progress.js`: spaced repetition and storage. `js/data.js`: puzzle loading. `js/app.js`: the screens.
- `assets/`: font, icons and sounds from the nestris.org client.

To rebuild `js/core.js` from a nestris.org checkout, bundle `shared/puzzles/encode-puzzle.ts`, `shared/tetris/{moveable-tetromino,tetris-board,tetromino-type,tetromino-colors,tetrominos}.ts` and `shared/puzzles/puzzle-theme.ts` into one ESM file with esbuild.
