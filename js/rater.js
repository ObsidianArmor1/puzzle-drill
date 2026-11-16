// Rates a player's own (first, second) placement with StackRabbit, scored exactly like the engine's top 5
// (pinned nestris.org StackRabbit compiled to WebAssembly; see tools/import-engine.mjs). Runs in a background worker
// that's only created (and the ~6.6 MB engine only downloaded) the first time a rating is needed.
let worker = null, nextId = 1;
const pending = new Map(), cache = new Map();

function getWorker(manifest) {
  if (worker || !manifest?.rater) return worker;
  const js = new URL(manifest.rater.js, location.href).href, wasm = new URL(manifest.rater.wasm, location.href).href;
  const code = `importScripts(${JSON.stringify(js)});
const ready = RatePairModule({ locateFile: () => ${JSON.stringify(wasm)} });
onmessage = async (e) => {
  const { id, req, a, b } = e.data;
  let r;
  try { r = JSON.parse((await ready).scorePair(req, a, b)); } catch (err) { r = { error: String(err) }; }
  postMessage({ id, r });
};`;
  worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data.r); } };
  worker.onerror = () => { for (const p of pending.values()) p({ error: 'engine failed to load' }); pending.clear(); worker = null; };
  return worker;
}

const cellsOf = (m) => m.getCurrentBlockSet().blocks.map((b) => `${b.x},${b.y}`).sort().join(' ');

/** Promise of { score, reachable } or { error }. dec: decoded puzzle (board, current, next); first/second: placements. */
export function ratePair(manifest, puzzleId, dec, first, second) {
  const key = `${puzzleId}|${cellsOf(first)}|${cellsOf(second)}`;
  if (cache.has(key)) return cache.get(key);
  const w = getWorker(manifest);
  if (!w) return Promise.resolve({ error: 'no engine' });
  let board = '';
  for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) board += dec.board.exists(x, y) ? '1' : '0';
  // nestris.org's generator query exactly (no trailing '|', so playout length stays at the engine's default)
  const req = `${board}|18|0|${dec.current}|${dec.next}|X.|343|3`;
  const p = new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    w.postMessage({ id, req, a: cellsOf(first), b: cellsOf(second) });
  });
  cache.set(key, p);
  p.then((r) => { if (r.error) cache.delete(key); });
  return p;
}
