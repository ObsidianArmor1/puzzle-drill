# Puzzle Drill

A static practice site for drilling rated nestris.org puzzles until you've memorized them, styled after the nestris.org puzzle page.
There's no build step and no server, so it runs on GitHub Pages as plain files.

## Modes

- **Learn**: spaced repetition. Puzzles that are due come first, missed puzzles are asked again a few puzzles later, then up to N new puzzles are added (N is set in Settings).
  Correct answers on due puzzles schedule the next review in 1 → 3 → 7 → 16 → 35 days.
  Every puzzle has a **tier** saying how firmly you hold it: *New* → *Learning* → *Familiar* (right recently; next review in a day) → *Solid* (held overnight; 3 days) → *Mastered* (held across days; 7 days and up).
  A miss drops a puzzle **one tier** (Mastered → Solid → Familiar → Learning) and brings it back the next day; Learning puzzles are re-asked in the same session.
  Tiers show on the solution screen (with ▲/▼ when one changes), on Browse tiles, as a bar under each set on the home page, in the session summary, and on the Progress page.
  Reviews go by **day**, not by the hour: a review scheduled for tomorrow is due from 4am tomorrow (local time), however late you played today. Getting a puzzle right before it's due is practice: the solution screen says so, and its tier doesn't move (only a correct answer after time away proves you remember it).
  Practising a lot still shows: each day counts the tiers you gained (home page and the Progress table), and after Learn a **Learn N more new** button starts another batch straight away.
  New puzzles come **hardest first** by default, so Learn works its way down the set by difficulty (changeable to easiest first or random in Settings).
- **Perfect Run**: N puzzles in a row, aiming for zero mistakes. Afterwards, *Re-run misses* until the set is clean.
- **Play Through**: every puzzle in the set exactly once, in order (a star set goes hardest first; a custom or shared set keeps its own order). Stop any time and it resumes where you left off; when you've played them all it shows your score and **Start over** begins a new pass.
- **Mistakes**: only puzzles you have missed, worst first.
- **Endless**: random puzzles from the set.
- **Browse**: every puzzle as a board thumbnail with your record on it. Click one to play it.

**Sets & Library**: everything you drill is a set. The five star ratings come pre-installed as default sets, and you can add your own:
- **From rules** (+ New set): pick star ratings, then *hardest N* / *hardest X%* / a difficulty range (ranked by how rarely players solve each puzzle on nestris.org), and optionally narrow by global success rate, theme (Stacking, Overhangs, Burns, Digging, Spires), your progress (new, not mastered, Familiar/Solid, missed before…) and a size cap. A live preview shows how many puzzles match. The list is saved when you create the set; **Refresh** re-applies the rules later.
- **By hand**: in Browse, choose a set under *Collect into* and click **+** on puzzles; or use *Add this puzzle to a set* on the solution screen while drilling.

**Sharing sets**: *Share* on a custom set gives a link and a downloadable set file. Sets built from rules travel as their rules (a short link that rebuilds the same puzzles, with Edit/Refresh intact). Handpicked sets, or rules that depend on your own progress or randomness, travel as 6-character puzzle codes; the page says if the link is too long for a Discord message, in which case send the file (recipient: *+ New set → Import a set file*). Opening a link or file shows a preview with *Add to library*.

Progress belongs to the puzzle, so a new set immediately shows what you already know about its puzzles. The modes, home stats and Browse all work on the selected set.

**Links to nestris.org:** on a puzzle's solution screen, **Share** opens a small menu: copy the Puzzle Drill link, copy the puzzle's own nestris.org link, or open it on nestris.org. Hovering a Browse tile shows a small ↗ in its corner that opens the puzzle on nestris.org. Extreme puzzles get the same options: they aren't in nestris.org's bank, but the ID encodes the board and pieces, so the link opens there as an unrated shared puzzle, answered by nestris.org's in-browser engine.

Controls are the same as nestris.org: hover to move, click to place, Z/X to rotate, Q to undo.
After a puzzle: Enter/Space for the next one, R to retry, Esc to exit. Keys can be changed in Settings.
On a phone, tap to preview a placement, tap the preview to place it, and use the on-screen rotate buttons.

Progress is stored per puzzle ID in each player's browser (localStorage), so updating the puzzle data never touches anyone's progress. **Export progress** / **Import progress** on the home page back it up or move it to another device. Import merges: for each puzzle the more recently played copy wins, and settings come along too.

## Extreme (generated puzzles)

**Extreme** (the card under the Library, or `#/x/`) is a separate section with 1,000 generated puzzles picked to be as hard as possible for 5★ players (868 rated 4★, 132 rated 5★ by nestris.org's own rating rules). They aren't in nestris.org's puzzle bank and have never been played, so there are no real solve rates or guess counts: the solution screen shows them as **Generated**, with a model's **predicted 5★ solve rate** and the puzzle's place in the set order. Answers and the engine's top 5 come from the same StackRabbit version nestris.org uses.

All the modes and Browse work there (All / 5★ / 4★), in set order (most likely extreme and most varied first). Progress is its own: separate records, tiers, daily stats and Play Through position, none of it counted in the main Library, sets or Progress page. Backups (Export progress) include it.

Data: `data/extreme.<hash>.json`, written by `node tools/import-generated.mjs <generated-set.json>`.

## Getting around

- **Home**: a first-visit intro, a **Continue** card (your last mode on the selected set, with reviews due and today's numbers), the Library, and the modes.
- **Progress** (top right): totals, puzzles and accuracy per day for the last 30 days (also as a table), mastered over time for any set (tracked from your first visit on), and a per-set table.
- **Settings** (top right): keybinds, timer, sound, session sizes, backup (export/import) and reset.
- After a session, **Review your misses** shows each missed puzzle with the correct answer; click one to try it again.

## Puzzle data

`data/` holds the complete nestris.org rated-puzzle bank as of November 2026: 42,480 puzzles (1★ 8,765 · 2★ 7,709 · 3★ 7,242 · 4★ 10,048 · 5★ 8,716), each with the engine's top 5 moves, scores, guess counts, theme and global attempts/solves.

Difficulty is each puzzle's global success rate, smoothed toward its star rating's average (as if it had 10 extra attempts at the average). Most 1★ puzzles have only one or no attempts, so without smoothing their rate would be a random 0% or 100%.

**SR+ (engine review):** a patched StackRabbit that sees every NES-reachable placement (double tucks, spin-tucks and other multi-input moves under overhangs) was run over the whole bank exactly the way nestris.org rates puzzles: its query and settings, at 30 Hz and at 12 Hz, and nestris.org only keeps a puzzle when both speeds agree. On 62 puzzles both patched runs agree on a different move than nestris.org's answer, so the move is playable at 12 Hz. On 32 of them it wins by more than 3 points at both speeds (nestris.org's own cut-off), so under nestris.org's rules it would be the answer. The other 30 are within 3 points, which nestris.org would have thrown out as too close to call. Those puzzles' solution screens show an extra **SR+** row (hover it to see the move) and a note saying which kind it is and what inputs it needs; missed-puzzle reviews show "SR+ disagrees" or "SR+ close call". Of the 62, 38 come from the patch (a multi-input tuck or spin no unpatched StackRabbit finds); the other 24 the current public StackRabbit already picks unpatched. That's a gap between StackRabbit versions: nestris.org runs an older one (commit 86a4bfc) that can reach the same placements but scores the result lower, and the note says so. Moves that only a faster (30 Hz) player could make aren't flagged, since nestris.org puzzles only use moves playable at 12 Hz. Grading is unchanged: nestris.org's #1 is still the answer. The data is `data/engine-review.<hash>.json`, written by `node tools/import-engine-review.mjs` from the engine run in `../engine-lab/reach-audit/`.

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
