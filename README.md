# Puzzle Drill

A static practice site for drilling rated nestris.org puzzles until you've memorized them, styled after the nestris.org puzzle page.
There's no build step and no server, so it runs on GitHub Pages as plain files.

## Modes

- **Learn**: spaced repetition. Puzzles that are due come first, missed puzzles are asked again a few puzzles later, then up to N new puzzles are added (N is set in Settings).
  Correct answers on due puzzles schedule the next review in 1 → 3 → 7 → 16 → 35 days. A miss resets the puzzle.
  A puzzle counts as *mastered* once it reaches the 7-day stage.
  New puzzles come **hardest first** by default, so Learn works its way down the set by difficulty (changeable to easiest first or random in Settings).
- **Perfect Run**: N puzzles in a row, aiming for zero mistakes. Afterwards, *Re-run misses* until the set is clean.
- **Play Through**: every puzzle in the set exactly once, in order (a star set goes hardest first; a custom or shared set keeps its own order). Stop any time and it resumes where you left off; when you've played them all it shows your score and **Start over** begins a new pass.
- **Mistakes**: only puzzles you have missed, worst first.
- **Endless**: random puzzles from the set.
- **Browse**: every puzzle as a board thumbnail with your record on it. Click one to play it.

**Sets & Library**: everything you drill is a set. The five star ratings come pre-installed as default sets, and you can add your own:
- **From rules** (+ New set): pick star ratings, then *hardest N* / *hardest X%* / a difficulty range (ranked by how rarely players solve each puzzle on nestris.org), and optionally narrow by global success rate, theme (Stacking, Overhangs, Burns, Digging, Spires), your progress (new, not mastered, missed before…) and a size cap. A live preview shows how many puzzles match. The list is saved when you create the set; **Refresh** re-applies the rules later.
- **By hand**: in Browse, choose a set under *Collect into* and click **+** on puzzles; or use *Add this puzzle to a set* on the solution screen while drilling.

**Sharing sets**: *Share* on a custom set gives a link and a downloadable set file. Sets built from rules travel as their rules (a short link that rebuilds the same puzzles, with Edit/Refresh intact). Handpicked sets, or rules that depend on your own progress or randomness, travel as 6-character puzzle codes; the page says if the link is too long for a Discord message, in which case send the file (recipient: *+ New set → Import a set file*). Opening a link or file shows a preview with *Add to library*.

Progress belongs to the puzzle, so a new set immediately shows what you already know about its puzzles. The modes, home stats and Browse all work on the selected set.

Controls are the same as nestris.org: hover to move, click to place, Z/X to rotate, Q to undo.
After a puzzle: Enter/Space for the next one, R to retry, Esc to exit. Keys can be changed in Settings.
On a phone, tap to preview a placement, tap the preview to place it, and use the on-screen rotate buttons.

Progress is stored per puzzle ID in each player's browser (localStorage), so updating the puzzle data never touches anyone's progress. **Export progress** / **Import progress** on the home page back it up or move it to another device. Import merges: for each puzzle the more recently played copy wins, and settings come along too.

## Getting around

- **Home**: a first-visit intro, a **Continue** card (your last mode on the selected set, with reviews due and today's numbers), the Library, and the modes.
- **Progress** (top right): totals, puzzles and accuracy per day for the last 30 days (also as a table), mastered over time for any set (tracked from your first visit on), and a per-set table.
- **Settings** (top right): keybinds, timer, sound, session sizes, backup (export/import) and reset.
- After a session, **Review your misses** shows each missed puzzle with the correct answer; click one to try it again.

## Puzzle data

`data/` holds the complete nestris.org rated-puzzle bank as of November 2026: 42,480 puzzles (1★ 8,765 · 2★ 7,709 · 3★ 7,242 · 4★ 10,048 · 5★ 8,716), each with the engine's top 5 moves, scores, guess counts, theme and global attempts/solves.

Difficulty is each puzzle's global success rate, smoothed toward its star rating's average (as if it had 10 extra attempts at the average). Most 1★ puzzles have only one or no attempts, so without smoothing their rate would be a random 0% or 100%.

**SR+ (engine review):** for 87 puzzles, a patched StackRabbit that sees every NES-reachable placement (double tucks, spin-tucks and other multi-input moves under overhangs) prefers a different move than nestris.org's engine. On those puzzles the solution screen shows an extra **SR+** row (hover it to see the move) and a note saying what inputs it needs; missed-puzzle reviews show "SR+ disagrees". Grading is unchanged: nestris.org's #1 is still the answer. The data is `data/engine-review.<hash>.json`, written by `node tools/import-engine-review.mjs` from the engine run in `../engine-lab/reach-audit/`.

If the bank ever changes, export again with the scraper (`../tools/nestris-puzzle-scraper.js`, **Download all**) and run `node tools/import-scrape.mjs <export.json>`. It merges into `data/` and renames the files by content hash so browsers pick up the change. Players' progress is untouched.

## Run locally

```bash
python3 -m http.server 8791 --bind 127.0.0.1
```
Then open http://127.0.0.1:8791/. Opening `index.html` directly from disk won't work, because ES modules need http.

## Deploy to GitHub Pages

Push this folder to a GitHub repo, then go to **Settings → Pages → Deploy from a branch → `main` / root**.
Every path is relative, so it works at `https://<user>.github.io/<repo>/`.

## Deploying changes

GitHub Pages caches each file for up to 10 minutes, so `index.html` pins every script and the stylesheet to a content hash (an import map). After changing anything in `js/` or `css/`, run `npm run stamp` before committing; `npm test` fails if you forget.

## Tests

```bash
npm test
```
Runs the tests in `tests/` with Node's built-in test runner. They cover the spaced-repetition rules, Learn ordering, Perfect Run, Play Through, the difficulty slices, backup merging, and that `index.html`'s versions are current. Nothing to install.

## Files

- `js/core.js`: nestris.org's `shared/` puzzle and tetris logic (board, pieces, puzzle ID decoding), bundled with esbuild. Don't edit it by hand.
- `js/board.js`: NES board rendering and the hover/click placement controls, ported from the nestris client.
- `js/sets.js`: the Library, set rules and sharing. `js/session.js`: the drill modes. `js/progress.js`: spaced repetition and storage. `js/data.js`: puzzle loading. `js/app.js`: the screens.
- `assets/`: font, icons and sounds from the nestris.org client.

To rebuild `js/core.js` from a nestris.org checkout, bundle `shared/puzzles/encode-puzzle.ts`, `shared/tetris/{moveable-tetromino,tetris-board,tetromino-type,tetromino-colors,tetrominos}.ts` and `shared/puzzles/puzzle-theme.ts` into one ESM file with esbuild.
