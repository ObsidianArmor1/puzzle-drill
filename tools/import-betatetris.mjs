#!/usr/bin/env node
// Writes data/betatetris.<hash>.json from a BetaTetris run over the puzzles and records it in data/manifest.json as
// "betatetris". The run (../betatetris/run/bt_puzzles.py) uses BetaTetris v1.0.0 (Normal model), 30 Hz, mid
// aggression, both pieces known up front; the second piece is its choice before seeing what follows.
//   node tools/import-betatetris.mjs ../betatetris/run/all-out-*.jsonl
// Per puzzle: f / s = BetaTetris's first and second placements as int2 poses with its probability (0-1),
// plus up to 2 runner-up first placements; o = odd cell count (approximation, see README).
// When its pair isn't StackRabbit's #1: w = its probability for #1's first placement (and for #1's second
// placement when the first placements match, else null). When its pair isn't in SR's top 5: r = StackRabbit's
// score for it (nestris.org generator query, from ../betatetris/run/bt-srscore.json), n = 1 if StackRabbit's own move
// search can't find that pair.
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePuzzle, MoveableTetromino } from '../js/core.js';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2).filter((f) => !f.endsWith('bt-srscore.json'));
const srScoreFile = process.argv.slice(2).find((f) => f.endsWith('bt-srscore.json')) || join(root, '../betatetris/run/bt-srscore.json');
const srScores = JSON.parse(readFileSync(srScoreFile, 'utf8'));
// StackRabbit's #1 per puzzle (bank and Extreme)
const manifest0 = JSON.parse(readFileSync(join(root, 'data', 'manifest.json'), 'utf8'));
const srFirst = new Map();
for (const info of [...Object.values(manifest0.ratings), ...(manifest0.extreme ? [manifest0.extreme] : [])]) {
  for (const p of JSON.parse(readFileSync(join(root, 'data', info.file), 'utf8')).puzzles) srFirst.set(p.i, p.m[0]);
}
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
  // BetaTetris's weight on StackRabbit's #1 (from the full spreads saved in the run)
  const m0 = srFirst.get(r.id);
  const a0 = key(MoveableTetromino.fromInt2(m0[0])), b0 = key(MoveableTetromino.fromInt2(m0[1]));
  const cellsKey = (cs) => want(cs);
  const isSr1 = cellsKey(r.first) === a0 && cellsKey(r.second) === b0;
  const probOf = (dist, k) => { const e = (dist || []).find(([cs]) => cellsKey(cs) === k); return e ? e[1] : 0; };
  const w = isSr1 ? undefined : [Math.round(probOf(r.first_dist, a0) * 10000) / 10000,
    cellsKey(r.first) === a0 ? Math.round(probOf(r.second_dist, b0) * 10000) / 10000 : null];
  const sr = srScores[r.id];
  out[r.id] = {
    ...(w ? { w } : {}),
    ...(sr !== undefined ? (Array.isArray(sr) ? { r: Math.round(sr[0] * 100) / 100, n: 1 } : { r: Math.round(sr * 100) / 100 }) : {}),
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
