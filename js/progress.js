// Per-puzzle progress, settings and daily stats, kept in localStorage.
//
// Spaced repetition (Leitner boxes):
//   box 0 = never solved correctly, box 1 = missed recently (due again right away),
//   box 2..6 = solved; next review after 1, 3, 7, 16, 35 days.
//   A correct answer only promotes a puzzle when it is due (or new), so cramming the same
//   puzzle repeatedly in one sitting does not count as long-term memorization.
//   "Mastered" = box >= 4 (solved correctly on reviews spaced at least 3 days apart).

const KEY = 'pd.progress.v1';
const SETTINGS_KEY = 'pd.settings.v1';
const DAILY_KEY = 'pd.daily.v1';
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
  runSize: 50,         // puzzles per Perfect Run
  level: 18,           // block colors
};
let settings = { ...DEFAULT_SETTINGS, ...safeGet(SETTINGS_KEY, {}) };
export const getSettings = () => settings;
export function setSettings(patch) { settings = { ...settings, ...patch }; safeSet(SETTINGS_KEY, settings); }

// ---------- per-puzzle records ----------
// rec: { n: attempts, c: correct, st: current streak, b: box, d: due ms, l: last ms, ok: last correct, bt: best ms, w: last wrong move index }
let progress = safeGet(KEY, {});
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => safeSet(KEY, progress), 300);
}
window.addEventListener('beforeunload', () => { clearTimeout(saveTimer); safeSet(KEY, progress); });

export const getRec = (id) => progress[id];
export const isDue = (rec, now = Date.now()) => !rec || rec.b <= 1 || rec.d <= now;
export const isMastered = (rec) => !!rec && rec.b >= MASTERED_BOX;

export function record(id, correct, ms, wrongIndex) {
  const now = Date.now();
  const rec = progress[id] || { n: 0, c: 0, st: 0, b: 0, d: 0, l: 0 };
  const wasDue = isDue(rec, now);
  rec.n++;
  rec.l = now;
  rec.ok = correct;
  if (correct) {
    rec.c++;
    rec.st++;
    if (ms && (!rec.bt || ms < rec.bt)) rec.bt = Math.round(ms);
    if (wasDue) {
      rec.b = Math.max(2, Math.min(rec.b + 1, INTERVALS.length - 1));
      rec.d = now + INTERVALS[rec.b];
    }
    delete rec.w;
  } else {
    rec.st = 0;
    rec.b = 1;
    rec.d = now;
    if (wrongIndex !== undefined) rec.w = wrongIndex;
  }
  progress[id] = rec;
  scheduleSave();
  bumpDaily(correct);
  return rec;
}

// ---------- summaries ----------
export function summarize(puzzles, now = Date.now()) {
  let seen = 0, mastered = 0, due = 0, learning = 0, attempts = 0, correct = 0, perfect = 0;
  for (const p of puzzles) {
    const r = progress[p.id];
    if (!r) continue;
    seen++;
    attempts += r.n; correct += r.c;
    if (r.b >= MASTERED_BOX) mastered++;
    if (r.b === 1) learning++;
    if (r.b >= 2 && r.d <= now) due++;
    if (r.n > 0 && r.c === r.n) perfect++;
  }
  return { total: puzzles.length, seen, mastered, due, learning, attempts, correct, perfect };
}

// ---------- daily stats ----------
const today = () => new Date().toISOString().slice(0, 10);
function bumpDaily(correct) {
  const d = safeGet(DAILY_KEY, {});
  const k = today();
  d[k] = d[k] || { n: 0, c: 0 };
  d[k].n++; if (correct) d[k].c++;
  safeSet(DAILY_KEY, d);
}
export function getDaily() {
  const d = safeGet(DAILY_KEY, {});
  const t = d[today()] || { n: 0, c: 0 };
  // consecutive days with at least one puzzle, ending today or yesterday
  let streak = 0;
  const day = new Date();
  if (!d[today()]) day.setDate(day.getDate() - 1);
  while (d[day.toISOString().slice(0, 10)]) { streak++; day.setDate(day.getDate() - 1); }
  return { today: t, streak };
}

// ---------- backup ----------
export function exportProgress() {
  return JSON.stringify({ kind: 'puzzle-drill-progress', version: 1, exportedAt: new Date().toISOString(), progress, settings, daily: safeGet(DAILY_KEY, {}) });
}
export function importProgress(text, { merge = true } = {}) {
  const json = JSON.parse(text);
  if (json.kind !== 'puzzle-drill-progress') throw new Error('Not a puzzle-drill progress file');
  if (merge) {
    for (const [id, rec] of Object.entries(json.progress || {})) {
      const mine = progress[id];
      if (!mine || (rec.l || 0) > (mine.l || 0)) progress[id] = rec;
    }
  } else {
    progress = json.progress || {};
  }
  if (json.daily) {
    const d = safeGet(DAILY_KEY, {});
    for (const [k, v] of Object.entries(json.daily)) if (!d[k] || v.n > d[k].n) d[k] = v;
    safeSet(DAILY_KEY, d);
  }
  safeSet(KEY, progress);
  return Object.keys(json.progress || {}).length;
}
export function resetProgress(ids) {
  if (!ids) progress = {};
  else for (const id of ids) delete progress[id];
  safeSet(KEY, progress);
}
