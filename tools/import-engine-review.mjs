// Writes data/engine-review.<hash>.json from the patched-StackRabbit run over the whole bank
// (../engine-lab/reach-audit/changed-puzzles.json) and records it in data/manifest.json as "engineReview".
// Only puzzles where the patched engine's #1 differs from the original engine's are included. Grading is unchanged.
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePuzzle, MoveableTetromino } from '../js/core.js';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || join(root, '../engine-lab/reach-audit/changed-puzzles.json');
const changed = JSON.parse(readFileSync(src, 'utf8'));
const key = (m) => m.getCurrentBlockSet().blocks.map((b) => `${b.x},${b.y}`).sort().join(' ');
function poseFor(type, cells) {
  for (let r = 0; r < 4; r++) for (let x = -2; x < 12; x++) for (let y = -2; y < 22; y++) {
    if (x + 2 > 31 || y + 2 > 31) continue;
    const m = new MoveableTetromino(type, r, x, y);
    if (key(m) === cells) return m.getInt2();
  }
  throw new Error(`no pose for type ${type} at ${cells}`);
}
const HOW = { 'T>T': 'a double tuck', 'T~T': 'a tuck, a drop, then another tuck', 'S>T': 'a spin then a tuck', 'S~T': 'a spin, a drop, then a tuck',
  'TS>T': 'a tuck-spin then a tuck', 'TS~T': 'a tuck-spin, a drop, then a tuck', 'TS>S': 'a tuck-spin then a spin', 'S>TS': 'a spin then a tuck-spin',
  'S~TS': 'a spin, a drop, then a tuck-spin', 'TS>TS': 'two tuck-spins in a row', 'eval change only': 'no new input, just the vertical-I-tuck scoring fix' };
const out = {};
for (const c of changed) {
  const { current, next } = decodePuzzle(c.id);
  const [piece, code] = c.what === 'eval change only' ? [null, c.what] : c.what.split(' ');
  out[c.id] = {
    m: [poseFor(current, c.patched[0]), poseFor(next, c.patched[1]), +c.patched[2].toFixed(1)],
    was: +c.orig[2].toFixed(1),
    how: HOW[code] ?? code, piece,
  };
}
const body = JSON.stringify({ engine: 'StackRabbit with every NES-reachable placement (double-tuck branch ac7ad48), level 18, 30 Hz, 343 playouts, depth 3', puzzles: out });
const file = `engine-review.${createHash('sha256').update(body).digest('hex').slice(0, 10)}.json`;
const dataDir = join(root, 'data');
writeFileSync(join(dataDir, file), body);
for (const f of readdirSync(dataDir)) if (f.startsWith('engine-review.') && f !== file) unlinkSync(join(dataDir, f));
const manifest = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8'));
manifest.engineReview = { file, count: Object.keys(out).length };
writeFileSync(join(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Wrote data/${file} (${Object.keys(out).length} puzzles)`);
