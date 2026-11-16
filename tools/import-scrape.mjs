#!/usr/bin/env node
// Merge one or more nestris-puzzle-scraper JSON exports into the site's bundled data.
//
//   node tools/import-scrape.mjs ~/Downloads/nestris-puzzles-*.json
//   node tools/import-scrape.mjs --replace export.json     (start from scratch instead of merging)
//
// By default the puzzles already in data/ are kept and the new exports are merged on top
// (a record with engine details wins over one without), so a later, fuller export only adds
// or enriches puzzles. Players' progress is stored by puzzle ID in their browsers, so it is
// never affected by updating these files.
//
// Writes data/puzzles-<rating>.<hash>.json per rating and data/manifest.json, and deletes
// stale puzzle files. The hash in the filename makes browsers fetch new data after an update.
// No dependencies.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const args = process.argv.slice(2);
const replace = args.includes('--replace');
const files = args.filter((a) => a !== '--replace');
if (!files.length) {
  console.error('Usage: node tools/import-scrape.mjs [--replace] <scraper-export.json> [...more]');
  process.exit(1);
}

// Convert one scraped record into the compact site format
function compact(p) {
  const d = p.detail;
  if (d && typeof d === 'object') {
    const moves = [];
    for (let i = 1; i <= 5; i++) {
      if (d[`current_${i}`] === undefined || d[`current_${i}`] === null) continue;
      moves.push([d[`current_${i}`], d[`next_${i}`], d[`score_${i}`] === null ? null : Number(d[`score_${i}`])]);
    }
    return {
      i: p.id, r: d.rating ?? p.rating, t: d.theme ?? null, m: moves,
      g: [1, 2, 3, 4, 5].map((i) => d[`guesses_${i}`] ?? 0),
      a: d.num_attempts ?? null, s: d.num_solves ?? null,
    };
  }
  return { i: p.id, r: p.rating, t: null, m: [[p.current, p.next, null]] };
}
const hasDetails = (rec) => rec.a !== undefined;
const richer = (a, b) => (hasDetails(a) && !hasDetails(b)) || (hasDetails(a) === hasDetails(b) && a.m.length > b.m.length);

const byId = new Map();
let kept = 0;
if (!replace && existsSync(join(dataDir, 'manifest.json'))) {
  const manifest = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8'));
  for (const [rating, info] of Object.entries(manifest.ratings || {})) {
    const json = JSON.parse(readFileSync(join(dataDir, info.file), 'utf8'));
    for (const rec of json.puzzles) { byId.set(rec.i, { ...rec, r: Number(rating) }); kept++; }
  }
  console.log(`Existing bundled data: ${kept} puzzles`);
}

let added = 0, enriched = 0;
for (const f of files) {
  const json = JSON.parse(readFileSync(f, 'utf8'));
  const list = Array.isArray(json) ? json : json.puzzles;
  if (!Array.isArray(list)) throw new Error(`${f}: no puzzles array`);
  let n = 0;
  for (const p of list) {
    if (!p?.id || !p.rating) continue;
    const rec = compact(p);
    const old = byId.get(rec.i);
    if (!old) { byId.set(rec.i, rec); added++; }
    else if (richer(rec, old)) { byId.set(rec.i, rec); enriched++; }
    n++;
  }
  console.log(`${f}: ${n} puzzles`);
}
console.log(`New puzzles: ${added}, gained details: ${enriched}`);

mkdirSync(dataDir, { recursive: true });
const previousManifest = existsSync(join(dataDir, 'manifest.json')) ? JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8')) : {};
const manifest = { generatedAt: new Date().toISOString(), ratings: {} };
if (previousManifest.engineReview) manifest.engineReview = previousManifest.engineReview; // see tools/import-engine-review.mjs
if (previousManifest.extreme) manifest.extreme = previousManifest.extreme; // see tools/import-generated.mjs
const byRating = new Map();
for (const rec of byId.values()) {
  if (!byRating.has(rec.r)) byRating.set(rec.r, []);
  byRating.get(rec.r).push(rec);
}
const written = new Set(['manifest.json']);
for (const [rating, list] of [...byRating].sort((a, b) => a[0] - b[0])) {
  list.sort((a, b) => (a.i < b.i ? -1 : a.i > b.i ? 1 : 0));
  const body = JSON.stringify({ rating, puzzles: list.map(({ r, ...rest }) => rest) });
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 10);
  const file = `puzzles-${rating}.${hash}.json`;
  writeFileSync(join(dataDir, file), body);
  written.add(file);
  manifest.ratings[rating] = { file, count: list.length, withDetails: list.filter(hasDetails).length };
  console.log(`  ${rating}★: ${list.length} puzzles (${manifest.ratings[rating].withDetails} with details) -> data/${file} (${(body.length / 1e6).toFixed(2)} MB)`);
}
writeFileSync(join(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
for (const f of readdirSync(dataDir)) {
  if (f.startsWith('puzzles-') && f.endsWith('.json') && !written.has(f)) { unlinkSync(join(dataDir, f)); console.log(`  removed stale ${f}`); }
}
console.log('Wrote data/manifest.json');
