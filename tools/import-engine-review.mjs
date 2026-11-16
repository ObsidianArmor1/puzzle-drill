// Writes data/engine-review.<hash>.json from the patched-StackRabbit run over the whole bank and records it in
// data/manifest.json as "engineReview". Input: ../engine-lab/reach-audit/sr-plus-12hz.json, from running the patched
// engine with nestris.org's exact query at 30 Hz and at 12 Hz (nestris.org only keeps a puzzle when both agree).
// Included: puzzles where both patched runs agree on a move other than nestris.org's answer, so the move is playable at
// 12 Hz. kind 'answer' = both margins > 3 (it would be the answer under nestris.org's rules), 'close' = within 3.
// Grading is unchanged.
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePuzzle, MoveableTetromino } from '../js/core.js';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || join(root, '../engine-lab/reach-audit/sr-plus-12hz.json');
const { valid } = JSON.parse(readFileSync(src, 'utf8'));
const key = (m) => m.getCurrentBlockSet().blocks.map((b) => `${b.x},${b.y}`).sort().join(' ');
function poseFor(type, cells) {
  for (let r = 0; r < 4; r++) for (let x = -2; x < 12; x++) for (let y = -2; y < 22; y++) {
    if (x + 2 > 31 || y + 2 > 31) continue;
    const m = new MoveableTetromino(type, r, x, y);
    if (key(m) === cells) return m.getInt2();
  }
  throw new Error(`no pose for type ${type} at ${cells}`);
}
const HOW = {
  'T~T': 'a tuck, a drop, then another tuck', 'S~T': 'a spin, a drop, then a tuck', 'TS~T': 'a tuck-spin, a drop, then a tuck',
  'S~TS': 'a spin, a drop, then a tuck-spin', 'TS~TS': 'two tuck-spins with a drop between', 'S|T': 'a spin and a tuck timed on separate fingers',
  eval: null,
};
const same = (a, b) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
const out = {};
for (const r of valid) {
  const { current, next } = decodePuzzle(r.id);
  const storedIdx = r.p30.findIndex((m) => same(m, r.stored));
  out[r.id] = {
    m: [poseFor(current, r.p30[0][0]), poseFor(next, r.p30[0][1]), +r.p30[0][2].toFixed(1)],
    was: storedIdx >= 0 ? +r.p30[storedIdx][2].toFixed(1) : null, // patched score of nestris.org's answer (null: not in its top 5)
    how: HOW[r.code] ?? (r.code === 'eval' ? null : r.code), piece: r.piece,
    kind: r.clear ? 'answer' : 'close',
  };
}
const body = JSON.stringify({ engine: 'StackRabbit with every NES-reachable placement (double-tuck branch ac7ad48); nestris.org query, 30 Hz and 12 Hz agreeing', puzzles: out });
const file = `engine-review.${createHash('sha256').update(body).digest('hex').slice(0, 10)}.json`;
const dataDir = join(root, 'data');
writeFileSync(join(dataDir, file), body);
for (const f of readdirSync(dataDir)) if (f.startsWith('engine-review.') && f !== file) unlinkSync(join(dataDir, f));
const manifest = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8'));
manifest.engineReview = { file, count: Object.keys(out).length };
writeFileSync(join(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
const kinds = Object.values(out).reduce((h, x) => ((h[x.kind] = (h[x.kind] || 0) + 1), h), {});
console.log(`Wrote data/${file} (${Object.keys(out).length} puzzles)`, kinds);
