#!/usr/bin/env node
// Writes data/betatetris.<hash>.json from a BetaTetris run over the puzzles and records it in data/manifest.json as
// "betatetris". The run (../betatetris/run/bt_puzzles.py) uses BetaTetris v1.0.0 (Normal model), 30 Hz, mid
// aggression, both pieces known up front; the second piece is its choice before seeing what follows.
//   node tools/import-betatetris.mjs ../betatetris/run/all-out-*.jsonl
// Per puzzle: f / s = BetaTetris's first and second placements as int2 poses with its probability (0-1),
// plus up to 2 runner-up first placements; o = odd cell count (approximation, see README).
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePuzzle, MoveableTetromino } from '../js/core.js';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2);
if (!files.length) { console.error('Usage: node tools/import-betatetris.mjs <bt output .jsonl>...'); process.exit(1); }
const key = (m) => m.getCurrentBlockSet().blocks.map((b) => `${b.x},${b.y}`).sort().join(' ');
const want = (cells) => cells.map(([row, col]) => `${col},${row}`).sort().join(' ');
const poseCache = new Map();
function poseFor(type, cells) {
  const w = want(cells), ck = type + '|' + w;
  if (poseCache.has(ck)) return poseCache.get(ck);
  for (let r = 0; r < 4; r++) for (let x = -2; x < 12; x++) for (let y = -2; y < 22; y++) {
    if (x + 2 > 31 || y + 2 > 31) continue;
    const m = new MoveableTetromino(type, r, x, y);
    if (key(m) === w) { poseCache.set(ck, m.getInt2()); return m.getInt2(); }
  }
  throw new Error(`no pose for ${type} at ${w}`);
}
const out = {}; let n = 0, odd = 0;
for (const f of files) for (const line of readFileSync(f, 'utf8').split('\n')) {
  if (!line) continue;
  const r = JSON.parse(line); if (r.error) continue;
  const { current, next } = decodePuzzle(r.id);
  const p = (x) => Math.round(x * 100) / 100;
  out[r.id] = {
    f: [poseFor(current, r.first), p(r.first_top[0]?.[1] ?? 0)],
    s: [poseFor(next, r.second), p(r.second_top[0]?.[1] ?? 0)],
    a: r.first_top.slice(1, 3).filter((t) => t[1] >= 0.05).map((t) => [poseFor(current, t[0]), p(t[1])]),
    ...(r.odd ? { o: 1 } : {}),
  };
  n++; if (r.odd) odd++;
}
const body = JSON.stringify({ engine: 'BetaTetris v1.0.0 (Normal model), 30 Hz, mid aggression, both pieces known', puzzles: out });
const file = `betatetris.${createHash('sha256').update(body).digest('hex').slice(0, 10)}.json`;
const dataDir = join(root, 'data');
writeFileSync(join(dataDir, file), body);
for (const f of readdirSync(dataDir)) if (f.startsWith('betatetris.') && f !== file) unlinkSync(join(dataDir, f));
const manifest = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8'));
manifest.betatetris = { file, count: n };
writeFileSync(join(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Wrote data/${file}: ${n} puzzles (${odd} with an odd cell count), ${(body.length / 1e6).toFixed(2)} MB`);
