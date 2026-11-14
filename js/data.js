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

    // Difficulty ranking per rating: lowest global success rate first (hardest = rank 1).
    // Only puzzles with engine details have attempt/solve counts, so only those are ranked.
    const rankedByRating = new Map();
    for (const [rating, list] of byRating) {
      const ranked = list.filter((p) => p.attempts > 0)
        .sort((a, b) => (a.solves / a.attempts) - (b.solves / b.attempts) || b.attempts - a.attempts || (a.id < b.id ? -1 : 1));
      ranked.forEach((p, i) => { p.hardRank = i + 1; p.successRate = p.solves / p.attempts; });
      rankedByRating.set(rating, ranked);
    }
    return { byId, byRating, rankedByRating, manifest };
  })();
  return cache;
}

/**
 * The puzzles of a rating inside a difficulty range.
 * range = { from, to } in percent of the ranked list, hardest first (e.g. {from: 0, to: 10} = hardest 10%).
 * No range, or 0–100, means the whole set (including puzzles without a difficulty score).
 */
export function difficultySlice(data, rating, range) {
  const all = data.byRating.get(rating) || [];
  if (!range || (range.from <= 0 && range.to >= 100)) return { puzzles: all, all: true, ranked: (data.rankedByRating.get(rating) || []).length, unranked: 0 };
  const ranked = data.rankedByRating.get(rating) || [];
  const n = ranked.length;
  const start = Math.max(0, Math.floor((range.from / 100) * n));
  const end = Math.min(n, Math.max(start + (n ? 1 : 0), Math.ceil((range.to / 100) * n)));
  const puzzles = ranked.slice(start, end);
  return {
    puzzles, all: false, ranked: n, unranked: all.length - n,
    hardest: puzzles.length ? puzzles[0].successRate : null,
    easiest: puzzles.length ? puzzles[puzzles.length - 1].successRate : null,
  };
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
    hasDetails: rec.a !== undefined,
  });
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
