// Puzzle sets: the built-in star-rating sets ("r4") and custom sets ("c<id>") the player creates.
// A custom set is a saved list of puzzle IDs. Sets made from rules keep the rule so they can be refreshed.
// Progress is stored per puzzle ID, so any set shows what the player already knows about its puzzles.
import { getRec, MASTERED_BOX } from './progress.js';

const SETS_KEY = 'pd.sets.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(SETS_KEY) || '[]'); } catch { return []; } };
const write = (sets) => { try { localStorage.setItem(SETS_KEY, JSON.stringify(sets)); } catch (e) { console.warn('Saving sets failed', e); } };

export const THEMES = ['CLEAN', 'OVERHANG', 'BURN', 'DIG', 'SPIRE'];
export const STATUS_OPTIONS = [
  ['any', 'Any'], ['notMastered', 'Not mastered yet'], ['new', 'Never seen'],
  ['missed', 'Missed at least once'], ['learning', 'Missed last time'], ['mastered', 'Mastered'],
];

// ---------- storage ----------
export const listSets = () => read();
export const getCustomSet = (id) => read().find((s) => s.id === id) || null;
export function saveSet(set) {
  const sets = read();
  const now = Date.now();
  const s = { ...set, id: set.id || `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, updated: now, created: set.created || now };
  const i = sets.findIndex((x) => x.id === s.id);
  if (i >= 0) sets[i] = s; else sets.push(s);
  write(sets);
  return s;
}
export function deleteSet(id) { write(read().filter((s) => s.id !== id)); }
export function togglePuzzle(setId, puzzleId) {
  const s = getCustomSet(setId);
  if (!s) return false;
  const has = s.ids.includes(puzzleId);
  saveSet({ ...s, ids: has ? s.ids.filter((x) => x !== puzzleId) : [...s.ids, puzzleId] });
  return !has;
}
// Merge sets from a backup: a set from the file replaces the local one only if it was updated more recently
export function importSets(sets) {
  if (!Array.isArray(sets)) return 0;
  const mine = read();
  let n = 0;
  for (const s of sets) {
    if (!s || typeof s.id !== 'string' || !Array.isArray(s.ids)) continue;
    const i = mine.findIndex((x) => x.id === s.id);
    if (i < 0) { mine.push(s); n++; } else if ((s.updated || 0) > (mine[i].updated || 0)) { mine[i] = s; n++; }
  }
  write(mine);
  return n;
}

// ---------- lookup ----------
export const ratingKey = (r) => `r${r}`;
export const customKey = (id) => `c${id}`;

/** Resolve a set key to { key, kind, name, rating?, puzzles, missing, set? } (null if unknown). */
export function resolveSet(data, key) {
  if (!key) return null;
  if (key[0] === 'r') {
    const rating = Number(key.slice(1));
    const puzzles = data.byRating.get(rating);
    if (!puzzles?.length) return null;
    return { key, kind: 'rating', rating, name: `${rating}★`, puzzles, missing: 0 };
  }
  if (key[0] === 'c') {
    const set = getCustomSet(key.slice(1));
    if (!set) return null;
    const puzzles = [];
    let missing = 0;
    for (const id of set.ids) { const p = data.byId.get(id); if (p) puzzles.push(p); else missing++; }
    const ratings = new Set(puzzles.map((p) => p.rating));
    return { key, kind: 'custom', name: set.name, rating: ratings.size === 1 ? [...ratings][0] : null, puzzles, missing, set };
  }
  return null;
}

// ---------- rules ----------
// rule = {
//   ratings: [4],                                   star ratings to draw from
//   difficulty: { type: 'any' | 'topN' | 'topPct' | 'range', n, pct, from, to },
//                                                   applied to the chosen star ratings as a whole,
//                                                   ranked by global success rate (lowest = hardest)
//   success: { min, max } | null                    global success rate band, in percent
//   themes: ['CLEAN', ...] | null                   null = any theme
//   status: 'any' | 'notMastered' | 'new' | 'missed' | 'learning' | 'mastered'
//   limit: number | null, limitOrder: 'hardest' | 'random'
// }
export const DEFAULT_RULE = { ratings: [4], difficulty: { type: 'topN', n: 100 }, success: null, themes: null, status: 'any', limit: null, limitOrder: 'hardest' };

const statusTest = {
  any: () => true,
  notMastered: (r) => !r || r.b < MASTERED_BOX,
  new: (r) => !r,
  missed: (r) => !!r && r.c < r.n,
  learning: (r) => !!r && r.b <= 1,
  mastered: (r) => !!r && r.b >= MASTERED_BOX,
};

/** Puzzles matching a rule, hardest first where ranked. Pure apart from reading progress. */
export function evaluateRule(data, rule) {
  const ratings = (rule.ratings || []).filter((r) => data.byRating.get(r)?.length);
  const pool = ratings.flatMap((r) => data.byRating.get(r));
  const ranked = pool.filter((p) => p.successRate !== undefined)
    .sort((a, b) => a.successRate - b.successRate || b.attempts - a.attempts || (a.id < b.id ? -1 : 1));
  const d = rule.difficulty || { type: 'any' };
  let list;
  if (d.type === 'topN') list = ranked.slice(0, Math.max(0, Math.floor(d.n || 0)));
  else if (d.type === 'topPct') list = ranked.slice(0, Math.ceil(((d.pct || 0) / 100) * ranked.length));
  else if (d.type === 'range') {
    const from = Math.max(0, Math.min(100, d.from || 0)), to = Math.max(from, Math.min(100, d.to ?? 100));
    list = ranked.slice(Math.floor((from / 100) * ranked.length), Math.ceil((to / 100) * ranked.length));
  } else list = [...ranked, ...pool.filter((p) => p.successRate === undefined)];

  if (rule.success && (rule.success.min > 0 || rule.success.max < 100)) {
    const lo = (rule.success.min ?? 0) / 100, hi = (rule.success.max ?? 100) / 100;
    list = list.filter((p) => p.successRate !== undefined && p.successRate >= lo && p.successRate <= hi);
  }
  if (rule.themes && rule.themes.length && rule.themes.length < THEMES.length) {
    const t = new Set(rule.themes);
    list = list.filter((p) => t.has(p.theme));
  }
  const st = statusTest[rule.status] || statusTest.any;
  if (rule.status && rule.status !== 'any') list = list.filter((p) => st(getRec(p.id)));
  if (rule.limit && rule.limit > 0 && list.length > rule.limit) {
    if (rule.limitOrder === 'random') {
      const a = [...list];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      list = a.slice(0, rule.limit);
    } else list = list.slice(0, rule.limit);
  }
  return list;
}

/** Short human description of a rule, e.g. "Hardest 100 of 4★ · Overhangs · not mastered yet". */
export function describeRule(rule, themeText = {}) {
  const stars = (rule.ratings || []).sort().map((r) => `${r}★`).join('+') || 'no ratings';
  const d = rule.difficulty || {};
  const parts = [
    d.type === 'topN' ? `Hardest ${Number(d.n || 0).toLocaleString()} of ${stars}`
      : d.type === 'topPct' ? `Hardest ${d.pct}% of ${stars}`
      : d.type === 'range' && !(d.from > 0) ? `Hardest ${d.to}% of ${stars}`
      : d.type === 'range' ? `${d.from}–${d.to}% hardest of ${stars}`
      : `All ${stars}`,
  ];
  if (rule.success && (rule.success.min > 0 || rule.success.max < 100)) parts.push(`solved by ${rule.success.min}–${rule.success.max}%`);
  if (rule.themes && rule.themes.length && rule.themes.length < THEMES.length) parts.push(rule.themes.map((t) => themeText[t] || t).join('/'));
  if (rule.status && rule.status !== 'any') parts.push((STATUS_OPTIONS.find(([k]) => k === rule.status)?.[1] || rule.status).toLowerCase());
  if (rule.limit) parts.push(`max ${rule.limit}${rule.limitOrder === 'random' ? ' random' : ''}`);
  return parts.join(' · ');
}
