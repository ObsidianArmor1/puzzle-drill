#!/usr/bin/env node
// Copies the WebAssembly pair scorer (source: tools/ratepair.cpp, built in engine-lab/ratepair: pinned StackRabbit + a "score this exact pair" wrapper)
// into engine/ with content-hashed names and records them in data/manifest.json as "rater".
//   node tools/import-engine.mjs [../engine-lab/ratepair/out]
// Rebuild it with (from engine-lab/ratepair, after `source <emsdk>/emsdk_env.sh`):
//   em++ -O3 -std=c++17 -DPINNED_SRC='"<StackRabbit@86a4bfc>/src/cpp_modules/src/main.cpp"' ratepair.cpp --bind -g0 -s MODULARIZE=1 -s EXPORT_NAME=RatePairModule \
//     -s ALLOW_MEMORY_GROWTH=1 -s ENVIRONMENT=web,worker,node -o out/ratepair.js
import { readFileSync, writeFileSync, readdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || join(root, '../engine-lab/ratepair/out');
const hash = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 10);
const js = `ratepair.${hash(join(src, 'ratepair.js'))}.js`, wasm = `ratepair.${hash(join(src, 'ratepair.wasm'))}.wasm`;
const dir = join(root, 'engine');
copyFileSync(join(src, 'ratepair.js'), join(dir, js));
copyFileSync(join(src, 'ratepair.wasm'), join(dir, wasm));
for (const f of readdirSync(dir)) if (f.startsWith('ratepair.') && f !== js && f !== wasm) unlinkSync(join(dir, f));
const manifest = JSON.parse(readFileSync(join(root, 'data', 'manifest.json'), 'utf8'));
manifest.rater = { js: `engine/${js}`, wasm: `engine/${wasm}`, query: 'X.|343|3 (nestris.org generator query)' };
writeFileSync(join(root, 'data', 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`engine/${js}, engine/${wasm}`);
