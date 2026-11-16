// Puzzle data: the files bundled in data/ (see tools/import-scrape.mjs).
import { decodePuzzle, MoveableTetromino } from './core.js';

// Compact record: { i: id, t: theme|null, m: [[current, next, score|null], ...], g?: guesses[5], a?: attempts, s?: solves }

// ---------- loading ----------
let cache = null; // Promise<{ byId: Map, byRating: Map<number, Puzzle[]> , manifest }>

export function loadAll() {
  if (!cache) cache = (async () => {
    const byId = new Map();
    let manifest = { ratings: {} };
    try {
      manifest = await (await fetch('data/manifest.json', { cache: 'no-cache' })).json();
    } catch { /* no bundled data yet */ }
    await Promise.all(Object.entries(manifest.ratings || {}).map(async ([rating, info]) => {
      try {
        const json = await (await fetch(`data/${info.file}`)).json();
        for (const rec of json.puzzles) add(byId, { ...rec, r: Number(rating) });
      } catch (e) { console.warn('Failed to load', info.file, e); }
    }));
    const byRating = new Map();
    for (const p of byId.values()) {
      if (!byRating.has(p.rating)) byRating.set(p.rating, []);
      byRating.get(p.rating).push(p);
    }
    for (const list of byRating.values()) list.sort((a, b) => a.id.localeCompare(b.id));

    // Patched-StackRabbit answers where it disagrees with the original engine (tools/import-engine-review.mjs)
    if (manifest.engineReview?.file) {
      try {
        const review = await (await fetch(`data/${manifest.engineReview.file}`)).json();
        for (const [id, r] of Object.entries(review.puzzles)) { const p = byId.get(id); if (p) p.review = r; }
      } catch (e) { console.warn('Failed to load', manifest.engineReview.file, e); }
    }

    const rankedByRating = rankByDifficulty(byRating);
    return { byId, byRating, rankedByRating, manifest };
  })();
  return cache;
}

// Difficulty: each puzzle's success rate on nestris.org, smoothed toward its star rating's average as if it
// had PRIOR extra attempts at that average. Puzzles with few or no attempts (common for 1-star) land near the
// middle instead of at a random 0% or 100%; well-attempted puzzles barely move. Every puzzle gets a rank.
const PRIOR = 10;
export function rankByDifficulty(byRating) {
  const rankedByRating = new Map();
  for (const [rating, list] of byRating) {
    let attempts = 0, solves = 0;
    for (const p of list) { attempts += p.attempts || 0; solves += p.solves || 0; }
    const mean = attempts ? solves / attempts : 0.5;
    for (const p of list) {
      p.difficulty = ((p.solves || 0) + PRIOR * mean) / ((p.attempts || 0) + PRIOR);
      if (p.attempts > 0) p.successRate = p.solves / p.attempts; // raw rate, for display and filters
    }
    const ranked = [...list].sort((x, y) => x.difficulty - y.difficulty || (y.attempts || 0) - (x.attempts || 0) || (x.id < y.id ? -1 : 1));
    ranked.forEach((p, i) => { p.hardRank = i + 1; });
    rankedByRating.set(rating, ranked);
  }
  return rankedByRating;
}

function add(byId, rec) {
  const old = byId.get(rec.i);
  if (old && old.moves.length >= rec.m.length) return; // keep the richer record
  byId.set(rec.i, {
    id: rec.i,
    rating: rec.r,
    theme: rec.t ?? null,
    moves: rec.m.map(([c, n, s], k) => ({ current: c, next: n, score: s, guesses: rec.g ? rec.g[k] : null })),
    attempts: rec.a ?? null,
    solves: rec.s ?? null,
  });
}

// ---------- Extreme: generated puzzles, a separate collection ----------
// Never played on nestris.org, so no attempts/solves: `predicted` is a model's 5★ solve rate, `chance` its chance of
// being extreme, `order` the set's selection order (1 = most likely extreme / most varied first).
let extremeCache = null;
export function loadExtreme() {
  if (!extremeCache) extremeCache = (async () => {
    const { manifest } = await loadAll();
    if (!manifest.extreme?.file) return null;
    let json;
    try { json = await (await fetch(`data/${manifest.extreme.file}`)).json(); } catch (e) { console.warn('Failed to load', manifest.extreme.file, e); return null; }
    const byId = new Map(), byRating = new Map(), all = [];
    for (const rec of json.puzzles) {
      const p = {
        id: rec.i, rating: rec.r, theme: rec.t ?? null,
        moves: rec.m.map(([c, n, s]) => ({ current: c, next: n, score: s, guesses: null })),
        attempts: null, solves: null, generated: true, order: rec.o, predicted: rec.p, chance: rec.x, hardRank: rec.o,
      };
      byId.set(p.id, p); all.push(p);
      if (!byRating.has(p.rating)) byRating.set(p.rating, []);
      byRating.get(p.rating).push(p);
    }
    return { byId, byRating, rankedByRating: byRating, all, manifest, generated: true, title: json.title || 'Extreme', notes: json.notes };
  })();
  return extremeCache;
}

// Decode the board/pieces and engine moves for display. Cached per puzzle.
const decoded = new Map();
export function decode(p) {
  let d = decoded.get(p.id);
  if (!d) {
    const { board, current, next } = decodePuzzle(p.id);
    d = {
      board, current, next,
      moves: p.moves.map((m) => ({
        first: MoveableTetromino.fromInt2(m.current),
        second: MoveableTetromino.fromInt2(m.next),
        score: m.score, guesses: m.guesses,
      })),
      // { first, second, score, was, how }: the patched engine's preferred move, shown but not graded
      review: p.review ? {
        first: MoveableTetromino.fromInt2(p.review.m[0]), second: MoveableTetromino.fromInt2(p.review.m[1]),
        score: p.review.m[2], was: p.review.was, how: p.review.how,
      } : null,
    };
    decoded.set(p.id, d);
    if (decoded.size > 300) decoded.delete(decoded.keys().next().value);
  }
  return d;
}

// Which engine move (index) the submission matches, or -1. Pieces may be swapped, as on nestris.org.
export function matchSubmission(moves, first, second) {
  if (!first || !second) return -1;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if ((m.first.equals(first) && m.second.equals(second)) || (m.first.equals(second) && m.second.equals(first))) return i;
  }
  return -1;
}
