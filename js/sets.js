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
//                                                   ranked by difficulty (smoothed global success rate, lowest = hardest)
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

/** Puzzles matching a rule, hardest first. Pure apart from reading progress. */
export function evaluateRule(data, rule) {
  const ratings = (rule.ratings || []).filter((r) => data.byRating.get(r)?.length);
  const pool = ratings.flatMap((r) => data.byRating.get(r));
  const hardness = (p) => p.difficulty ?? p.successRate ?? 0.5;
  const ranked = [...pool].sort((a, b) => hardness(a) - hardness(b) || (b.attempts || 0) - (a.attempts || 0) || (a.id < b.id ? -1 : 1));
  const d = rule.difficulty || { type: 'any' };
  let list;
  if (d.type === 'topN') list = ranked.slice(0, Math.max(0, Math.floor(d.n || 0)));
  else if (d.type === 'topPct') list = ranked.slice(0, Math.ceil(((d.pct || 0) / 100) * ranked.length));
  else if (d.type === 'range') {
    const from = Math.max(0, Math.min(100, d.from || 0)), to = Math.max(from, Math.min(100, d.to ?? 100));
    list = ranked.slice(Math.floor((from / 100) * ranked.length), Math.ceil((to / 100) * ranked.length));
  } else list = ranked;

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

// ---------- sharing ----------
// Links: rule-based sets travel as their rule ("r="), everything else as 6-character puzzle codes ("h=").
// Files: { kind: 'puzzle-drill-set', version: 1, name, rule?, ids } with full puzzle IDs.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// cyrb53 string hash (53 bits); the low 36 bits become a 6-character URL-safe code
function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export function puzzleCode(id) {
  let n = cyrb53(id) % 2 ** 36, s = '';
  for (let i = 0; i < 6; i++) { s += B64[n % 64]; n = Math.floor(n / 64); }
  return s;
}
let codeIndex = null; // Map code -> id, built once per data load
function codeMap(data) {
  if (!codeIndex || codeIndex.data !== data) {
    const map = new Map();
    for (const id of data.byId.keys()) map.set(puzzleCode(id), id);
    codeIndex = { data, map };
  }
  return codeIndex.map;
}

const toB64url = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
// Undo extra layers of percent-encoding added by apps that re-encode links ("%2520" -> "%20" -> " ")
function decodeRepeatedly(s) {
  for (let i = 0; i < 3 && /%[0-9A-Fa-f]{2}/.test(s); i++) {
    const d = safeDecode(s);
    if (d === s) break;
    s = d;
  }
  return s;
}

/** A rule can be shared as-is if it gives everyone the same puzzles (no personal progress filter, no randomness). */
export const ruleIsPortable = (rule) => !!rule && (!rule.status || rule.status === 'any') && !(rule.limit && rule.limitOrder === 'random');

/** Payload for the part of a share link after "#/shared/". */
export function sharePayload(set) {
  // The name is base64url too, so the link has no '%' signs for chat apps to re-encode
  const name = `t=${toB64url(set.name)}`;
  if (ruleIsPortable(set.rule)) {
    // leave out values that match the defaults to keep links short
    const r = Object.fromEntries(Object.entries(set.rule).filter(([k, v]) =>
      v !== null && v !== undefined && !(k === 'status' && v === 'any') && !(k === 'limitOrder' && v === 'hardest')));
    return { kind: 'rule', payload: `${name}&r=${toB64url(JSON.stringify(r))}` };
  }
  return { kind: 'codes', payload: `${name}&h=${set.ids.map(puzzleCode).join('')}` };
}

/** Parse a share payload into { name, rule?, ids, unknown }. Throws on malformed input. */
export function parseShare(payload, data) {
  // Some apps percent-encode the whole fragment ("n%3D...%26r%3D..."); undo that first
  if (!/[=&]/.test(payload) && /%3D/i.test(payload)) payload = safeDecode(payload);
  const params = new URLSearchParams(payload);
  let name = 'Shared set';
  try {
    if (params.has('t')) name = fromB64url(params.get('t'));
    else if (params.has('n')) name = decodeRepeatedly(params.get('n')); // older links
  } catch { /* keep the default name */ }
  name = name.slice(0, 80) || 'Shared set';
  if (params.has('r')) {
    const raw = JSON.parse(fromB64url(params.get('r')));
    if (!raw || !Array.isArray(raw.ratings) || !raw.difficulty) throw new Error('This link has no valid set rules');
    const rule = { ...DEFAULT_RULE, ...raw };
    return { name, rule, ids: evaluateRule(data, rule).map((p) => p.id), unknown: 0 };
  }
  const h = params.get('h') || '';
  if (!h || h.length % 6 || /[^A-Za-z0-9_-]/.test(h)) throw new Error('This link has no valid puzzle list');
  const map = codeMap(data);
  const ids = [];
  let unknown = 0;
  for (let i = 0; i < h.length; i += 6) { const id = map.get(h.slice(i, i + 6)); if (id) ids.push(id); else unknown++; }
  return { name, ids: [...new Set(ids)], unknown };
}

export function setFile(set) {
  return JSON.stringify({ kind: 'puzzle-drill-set', version: 1, name: set.name, ...(set.rule ? { rule: set.rule } : {}), ids: set.ids }, null, 1);
}
/** Parse a set file into { name, rule?, ids, unknown }. */
export function parseSetFile(text, data) {
  const json = JSON.parse(text);
  if (json.kind !== 'puzzle-drill-set' || !Array.isArray(json.ids)) throw new Error('Not a Puzzle Drill set file');
  const ids = [...new Set(json.ids.filter((id) => typeof id === 'string'))];
  const known = ids.filter((id) => data.byId.has(id));
  return { name: String(json.name || 'Imported set').slice(0, 80), rule: json.rule && typeof json.rule === 'object' ? json.rule : undefined, ids: known, unknown: ids.length - known.length };
}

/** A name not already used in the library ("Name", "Name (2)", ...). */
export function uniqueName(name) {
  const taken = new Set(read().map((s) => s.name));
  if (!taken.has(name)) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} (${i})`)) return `${name} (${i})`;
}
