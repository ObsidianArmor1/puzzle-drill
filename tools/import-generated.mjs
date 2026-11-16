#!/usr/bin/env node
// Bundles a generated puzzle collection (never played on nestris.org) as the site's separate "Extreme" mode:
//   node tools/import-generated.mjs "<path>/extreme_set_1000.json"
// Input: the scraper-export shape (puzzles[] with id, rating, current/next, detail{current_k,next_k,score_k,theme})
// plus set_order, predicted_solve_rate_5star and chance_extreme_5star. Writes data/extreme.<hash>.json and records it
// in data/manifest.json as "extreme". These puzzles never mix with the main bank: own data, own progress scope.
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('Usage: node tools/import-generated.mjs <generated-set.json>'); process.exit(1); }
const json = JSON.parse(readFileSync(src, 'utf8'));
const puzzles = json.puzzles.map((p) => {
  const d = p.detail || {};
  const m = [];
  for (let k = 1; k <= 5; k++) if (d[`current_${k}`] != null) m.push([d[`current_${k}`], d[`next_${k}`], d[`score_${k}`] == null ? null : Number(d[`score_${k}`])]);
  if (!m.length) m.push([p.current, p.next, null]);
  return { i: p.id, r: p.rating, t: d.theme ?? null, m, o: p.set_order, p: p.predicted_solve_rate_5star, x: p.chance_extreme_5star };
}).sort((a, b) => a.o - b.o);
const body = JSON.stringify({
  title: 'Extreme', source: json.source ?? 'generated', exportedAt: json.exportedAt ?? null, notes: json.notes ?? null, puzzles,
});
const file = `extreme.${createHash('sha256').update(body).digest('hex').slice(0, 10)}.json`;
const dataDir = join(root, 'data');
writeFileSync(join(dataDir, file), body);
for (const f of readdirSync(dataDir)) if (f.startsWith('extreme.') && f !== file) unlinkSync(join(dataDir, f));
const manifest = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8'));
const byRating = {}; for (const p of puzzles) byRating[p.r] = (byRating[p.r] || 0) + 1;
manifest.extreme = { file, count: puzzles.length, byRating };
writeFileSync(join(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Wrote data/${file}: ${puzzles.length} puzzles`, byRating, `(${(body.length / 1e6).toFixed(2)} MB)`);
