// Per-puzzle progress, settings and daily stats, kept in localStorage.
//
// Spaced repetition (Leitner boxes):
//   box 0 = never solved correctly, box 1 = missed recently (due again right away),
//   box 2..6 = solved; next review after 1, 3, 7, 16, 35 days.
//   A correct answer only promotes a puzzle when it is due (or new), so cramming the same
//   puzzle repeatedly in one sitting does not count as long-term memorization.
//   "Mastered" = box >= 4 (solved correctly on reviews spaced at least 3 days apart).
//
// Tiers describe how firmly a puzzle is held, so they read the same whether you climbed or fell into one:
//   New -> Learning (box 0-1) -> Familiar (box 2) -> Solid (box 3) -> Mastered (box 4+).
//   A miss drops ONE tier (Mastered -> Solid -> Familiar -> Learning) and brings the puzzle back for review the next
//   day; Learning puzzles are re-asked right away. Keys stay new/attempted/familiar/proficient/mastered.

const SETTINGS_KEY = 'pd.settings.v1';
const BACKUP_KEY = 'pd.lastBackup.v1';
// Progress scopes: the main nestris.org bank ('main') and separate puzzle collections (e.g. 'extreme', the generated
// puzzles) each keep their own per-puzzle records, daily stats and history. Settings are shared.
export const SCOPES = ['main', 'extreme'];
const scopeKeys = (sc) => (sc === 'main'
  ? { KEY: 'pd.progress.v1', DAILY_KEY: 'pd.daily.v1', HISTORY_KEY: 'pd.history.v1' }
  : { KEY: `pd.${sc}.progress.v1`, DAILY_KEY: `pd.${sc}.daily.v1`, HISTORY_KEY: `pd.${sc}.history.v1` });
let scope = 'main';
let K = scopeKeys(scope);
const DAY = 86400000;
export const INTERVALS = [0, 0, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];
export const MASTERED_BOX = 4;

const safeGet = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const safeSet = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.warn('localStorage write failed', e); return false; }
};

// ---------- settings ----------
export const DEFAULT_SETTINGS = {
  timed: false,        // 30-second timer like nestris.org rated puzzles
  sound: true,
  rotLeft: 'z', rotRight: 'x', undo: 'q',
  newPerSession: 20,   // new puzzles introduced per Learn session
  newOrder: 'hardest', // order new Learn puzzles come in: hardest | easiest | random
  runSize: 50,         // puzzles per Perfect Run
  level: 18,           // block colors
};
let settings = { ...DEFAULT_SETTINGS, ...safeGet(SETTINGS_KEY, {}) };
for (const k of ['rotLeft', 'rotRight', 'undo']) if (typeof settings[k] !== 'string' || !settings[k]) settings[k] = DEFAULT_SETTINGS[k];
export const getSettings = () => settings;
export function setSettings(patch) { settings = { ...settings, ...patch }; safeSet(SETTINGS_KEY, settings); }

// ---------- per-puzzle records ----------
// rec: { n: attempts, c: correct, st: current streak, b: box, d: due ms, l: last ms, ok: last correct, bt: best ms, w: last wrong move index }
let progress = safeGet(K.KEY, {});
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => safeSet(K.KEY, progress), 300);
}
window.addEventListener('beforeunload', () => { clearTimeout(saveTimer); safeSet(K.KEY, progress); });

/** Switch which collection's progress record()/getRec()/summaries/daily stats use. */
export function setScope(sc) {
  if (sc === scope) return;
  clearTimeout(saveTimer); safeSet(K.KEY, progress);
  scope = sc; K = scopeKeys(sc);
  progress = safeGet(K.KEY, {});
}
export const getScope = () => scope;

export const TIERS = [
  { key: 'new', label: 'New', tip: 'never played' },
  { key: 'attempted', label: 'Learning', tip: "you don't have it yet: it comes back this session" },
  { key: 'familiar', label: 'Familiar', tip: 'right recently, not proven overnight yet: next review in a day' },
  { key: 'proficient', label: 'Solid', tip: 'held overnight: next review in 3 days' },
  { key: 'mastered', label: 'Mastered', tip: 'held across days: next review in a week or more' },
];
/** 0 new, 1 learning, 2 familiar, 3 solid, 4 mastered */
export const tierIndex = (rec) => (!rec ? 0 : rec.b <= 1 ? 1 : rec.b === 2 ? 2 : rec.b === 3 ? 3 : 4);
export const tierOf = (rec) => TIERS[tierIndex(rec)];

export const getRec = (id) => progress[id];
// Reviews go by day, not by the hour: a review day starts at ROLLOVER_HOUR local time (so a late-night session still
// counts as that day), and a puzzle scheduled for a day is due from the start of that day, however late you played.
export const ROLLOVER_HOUR = 4;
/** Start (ROLLOVER_HOUR local) of the review day containing ts. */
export function dayStart(ts = Date.now()) {
  const d = new Date(ts - ROLLOVER_HOUR * 3600000);
  d.setHours(ROLLOVER_HOUR, 0, 0, 0);
  return d.getTime();
}
const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
/** Start of the review day `days` days after today's. */
export const reviewDay = (days, now = Date.now()) => addDays(dayStart(now), days);
export const isDue = (rec, now = Date.now()) => !rec || rec.b <= 1 || rec.d < addDays(dayStart(now), 1);
/** Whole review days until a puzzle is due (0 = due today). */
export const daysUntilDue = (rec, now = Date.now()) => (isDue(rec, now) ? 0 : Math.round((dayStart(rec.d) - dayStart(now)) / DAY));
export const isMastered = (rec) => !!rec && rec.b >= MASTERED_BOX;

export function record(id, correct, ms, wrongIndex) {
  const now = Date.now();
  const isNew = !progress[id];
  const rec = progress[id] || { n: 0, c: 0, st: 0, b: 0, d: 0, l: 0 };
  const wasDue = isDue(rec, now);
  const tierBefore = isNew ? 0 : tierIndex(rec);
  rec.n++;
  rec.l = now;
  rec.ok = correct;
  if (correct) {
    rec.c++;
    rec.st++;
    if (ms && (!rec.bt || ms < rec.bt)) rec.bt = Math.round(ms);
    if (wasDue) {
      rec.b = Math.max(2, Math.min(rec.b + 1, INTERVALS.length - 1));
      rec.d = reviewDay(Math.round(INTERVALS[rec.b] / DAY), now);
    }
    delete rec.w;
  } else {
    rec.st = 0;
    // Drop one tier: Mastered -> Solid, Solid -> Familiar, Familiar (or new) -> Learning
    rec.b = rec.b >= MASTERED_BOX ? 3 : rec.b === 3 ? 2 : 1;
    rec.d = rec.b === 1 ? now : reviewDay(1, now); // Learning: re-ask now; otherwise review again tomorrow
    if (wrongIndex !== undefined) rec.w = wrongIndex;
  }
  progress[id] = rec;
  scheduleSave();
  // Tier moves for the day's tally (a first-ever miss, New -> Learning, isn't a step up)
  const tierAfter = tierIndex(rec);
  const move = tierAfter > tierBefore && (tierBefore > 0 || correct) ? 1 : tierAfter < tierBefore ? -1 : 0;
  bumpDaily(correct, isNew, ms, move);
  return rec;
}

// ---------- backup reminder ----------
export const lastBackup = () => safeGet(BACKUP_KEY, null);
export const progressCount = () => Object.keys(progress).length;

// ---------- summaries ----------
export function summarize(puzzles, now = Date.now()) {
  let seen = 0, mastered = 0, due = 0, learning = 0, attempts = 0, correct = 0, perfect = 0;
  const tiers = [0, 0, 0, 0, 0];
  for (const p of puzzles) {
    const r = progress[p.id];
    tiers[tierIndex(r)]++;
    if (!r) continue;
    seen++;
    attempts += r.n; correct += r.c;
    if (r.b >= MASTERED_BOX) mastered++;
    if (r.b === 1) learning++;
    if (r.b >= 2 && isDue(r, now)) due++;
    if (r.n > 0 && r.c === r.n) perfect++;
  }
  return { total: puzzles.length, seen, mastered, due, learning, attempts, correct, perfect, tiers };
}

// ---------- daily stats ----------
// Keyed by the player's local date. Per day: n answered, c correct, f first-time puzzles, t ms spent,
// u tiers gained, dn tiers lost.
export const dayKey = (date = Date.now()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const today = () => dayKey();
function bumpDaily(correct, isNew, ms, move = 0) {
  const d = safeGet(K.DAILY_KEY, {});
  const k = today();
  d[k] = d[k] || { n: 0, c: 0 };
  d[k].n++; if (correct) d[k].c++;
  if (isNew) d[k].f = (d[k].f || 0) + 1;
  if (ms) d[k].t = (d[k].t || 0) + Math.min(ms, 120000);
  if (move > 0) d[k].u = (d[k].u || 0) + 1;
  if (move < 0) d[k].dn = (d[k].dn || 0) + 1;
  safeSet(K.DAILY_KEY, d);
}
export const getDailyAll = () => safeGet(K.DAILY_KEY, {});
function streakFrom(d, end = Date.now()) {
  let streak = 0;
  const day = new Date(end);
  if (!d[dayKey(day)]) day.setDate(day.getDate() - 1);
  while (d[dayKey(day)]) { streak++; day.setDate(day.getDate() - 1); }
  return streak;
}
export function getDaily() {
  const d = safeGet(K.DAILY_KEY, {});
  return { today: d[today()] || { n: 0, c: 0 }, streak: streakFrom(d) };
}
export function bestStreak() {
  const days = Object.keys(safeGet(K.DAILY_KEY, {})).sort();
  let best = 0, run = 0, prev = null;
  for (const k of days) {
    const cur = new Date(`${k}T12:00:00`);
    run = prev && Math.round((cur - prev) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = cur;
  }
  return best;
}

// Daily snapshot of how many puzzles are mastered/seen in each set, for "mastered over time"
export function snapshotSets(entries) {
  const h = safeGet(K.HISTORY_KEY, {});
  h[today()] = Object.fromEntries(entries.map((e) => [e.key, [e.mastered, e.seen, e.total]]));
  const keys = Object.keys(h).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete h[k];
  safeSet(K.HISTORY_KEY, h);
}
export const getHistory = () => safeGet(K.HISTORY_KEY, {});

// ---------- backup ----------
export function exportProgress(extra = {}) {
  safeSet(BACKUP_KEY, Date.now());
  clearTimeout(saveTimer); safeSet(K.KEY, progress);
  const main = scopeKeys('main');
  // The other collections' progress travels in the same file
  const scopes = Object.fromEntries(SCOPES.filter((sc) => sc !== 'main').map((sc) => {
    const k = scopeKeys(sc);
    return [sc, { progress: safeGet(k.KEY, {}), daily: safeGet(k.DAILY_KEY, {}), history: safeGet(k.HISTORY_KEY, {}) }];
  }));
  return JSON.stringify({ kind: 'puzzle-drill-progress', version: 1, exportedAt: new Date().toISOString(), progress: safeGet(main.KEY, {}), settings, daily: safeGet(main.DAILY_KEY, {}), history: safeGet(main.HISTORY_KEY, {}), scopes, ...extra });
}
export function importProgress(text, { merge = true } = {}) {
  const json = JSON.parse(text);
  if (json.kind !== 'puzzle-drill-progress') throw new Error('Not a Puzzle Drill progress file');
  let updated = 0;
  if (merge) {
    for (const [id, rec] of Object.entries(json.progress || {})) {
      if (!rec || typeof rec !== 'object' || typeof rec.n !== 'number') continue;
      const mine = progress[id];
      if (!mine || (rec.l || 0) > (mine.l || 0)) { progress[id] = rec; updated++; }
    }
  } else {
    progress = json.progress || {};
  }
  if (json.daily) {
    const d = safeGet(K.DAILY_KEY, {});
    for (const [k, v] of Object.entries(json.daily)) if (!d[k] || v.n > d[k].n) d[k] = v;
    safeSet(K.DAILY_KEY, d);
  }
  if (json.history && typeof json.history === 'object') {
    const h = safeGet(K.HISTORY_KEY, {});
    for (const [k, v] of Object.entries(json.history)) if (!h[k]) h[k] = v;
    safeSet(K.HISTORY_KEY, h);
  }
  if (json.settings && typeof json.settings === 'object') setSettings(json.settings);
  safeSet(K.KEY, progress);
  // Other collections: merge straight into their stores (newest record per puzzle wins)
  for (const [sc, data] of Object.entries(json.scopes || {})) {
    if (!SCOPES.includes(sc) || sc === scope || !data || typeof data !== 'object') continue;
    const k = scopeKeys(sc);
    const recs = merge ? safeGet(k.KEY, {}) : {};
    for (const [id, rec] of Object.entries(data.progress || {})) {
      if (rec && typeof rec.n === 'number' && (!recs[id] || (rec.l || 0) > (recs[id].l || 0))) recs[id] = rec;
    }
    safeSet(k.KEY, recs);
    const d = safeGet(k.DAILY_KEY, {}); for (const [day, v] of Object.entries(data.daily || {})) if (!d[day] || v.n > d[day].n) d[day] = v; safeSet(k.DAILY_KEY, d);
    const h = safeGet(k.HISTORY_KEY, {}); for (const [day, v] of Object.entries(data.history || {})) if (!h[day]) h[day] = v; safeSet(k.HISTORY_KEY, h);
  }
  return { total: Object.keys(json.progress || {}).length, updated, json };
}
export function resetProgress(ids) {
  if (!ids) progress = {};
  else for (const id of ids) delete progress[id];
  safeSet(K.KEY, progress);
}
