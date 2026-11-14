// Tests for spaced repetition, sessions and difficulty slicing.  Run:  node --test tests/
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- minimal browser shims (progress.js uses localStorage and window) ---
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { addEventListener() {} };

const P = await import('../js/progress.js');
const { createSession, orderNew } = await import('../js/session.js');
const { difficultySlice } = await import('../js/data.js');

const DAY = 86400000;
let now = Date.UTC(2026, 0, 1);
const realNow = Date.now;
Date.now = () => now;
const advance = (ms) => { now += ms; };

beforeEach(() => {
  P.resetProgress();
  P.setSettings({ ...P.DEFAULT_SETTINGS });
  now = Date.UTC(2026, 0, 1);
});

// fake puzzles: id p1..pN, hardRank = N (1 = hardest)
const puzzles = (n, ranked = true) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, rating: 4, ...(ranked ? { hardRank: i + 1, successRate: (i + 1) / (n + 1) } : {}) }));

// ---------------- spaced repetition ----------------
test('first correct answer schedules a review in 1 day', () => {
  const r = P.record('a', true, 3000);
  assert.equal(r.b, 2);
  assert.equal(r.d, now + DAY);
  assert.equal(P.isDue(r), false);
});

test('reviews step through 1, 3, 7, 16, 35 days when answered on time', () => {
  P.record('a', true);
  for (const [box, days] of [[3, 3], [4, 7], [5, 16], [6, 35], [6, 35]]) {
    advance(P.getRec('a').d - now); // wait until due
    const r = P.record('a', true);
    assert.equal(r.b, box);
    assert.equal(r.d, now + days * DAY);
  }
});

test('mastered once the 7-day stage is reached', () => {
  P.record('a', true); assert.equal(P.isMastered(P.getRec('a')), false); // 1d
  advance(DAY); P.record('a', true); assert.equal(P.isMastered(P.getRec('a')), false); // 3d
  advance(3 * DAY); P.record('a', true); assert.equal(P.isMastered(P.getRec('a')), true); // 7d
});

test('cramming a puzzle before it is due does not promote it', () => {
  P.record('a', true);
  const before = P.getRec('a');
  const box = before.b, due = before.d;
  P.record('a', true); P.record('a', true);
  assert.equal(P.getRec('a').b, box);
  assert.equal(P.getRec('a').d, due);
  assert.equal(P.getRec('a').c, 3); // still counted as correct answers
});

test('a miss sends the puzzle back to the start, due immediately', () => {
  P.record('a', true); advance(DAY); P.record('a', true); advance(3 * DAY); P.record('a', true);
  assert.equal(P.isMastered(P.getRec('a')), true);
  const r = P.record('a', false, 9000, 2);
  assert.equal(r.b, 1);
  assert.equal(r.d, now);
  assert.equal(r.st, 0);
  assert.equal(r.w, 2);
  assert.equal(P.isMastered(r), false);
  assert.equal(P.isDue(r), true);
});

test('summarize counts seen, mastered, due and learning', () => {
  const ps = puzzles(5);
  P.record('p1', true); advance(DAY); P.record('p1', true); advance(3 * DAY); P.record('p1', true); // mastered
  P.record('p2', false);              // learning
  P.record('p3', true);               // seen, due after 1 day
  advance(2 * DAY);                   // p3 now due
  const s = P.summarize(ps, now);
  assert.equal(s.total, 5);
  assert.equal(s.seen, 3);
  assert.equal(s.mastered, 1);
  assert.equal(s.learning, 1);
  assert.equal(s.due, 1);
});

// ---------------- backup ----------------
test('import merges: the more recently played copy of each puzzle wins', () => {
  P.record('a', true);
  P.record('b', true);
  const backup = P.exportProgress();
  advance(DAY);
  P.record('a', false); // newer local play on 'a'
  const res = P.importProgress(backup);
  assert.equal(res.total, 2);
  assert.equal(res.updated, 0);
  assert.equal(P.getRec('a').ok, false); // newer local record kept
  P.resetProgress();
  assert.equal(P.importProgress(backup).updated, 2);
  assert.equal(P.getRec('b').c, 1);
});

test('import rejects files that are not progress backups', () => {
  assert.throws(() => P.importProgress('{"hello":1}'), /not a puzzle drill progress file/i);
});

// ---------------- sessions ----------------
test('Learn introduces new puzzles hardest first, and easiest first when set', () => {
  const ps = puzzles(30);
  P.setSettings({ newPerSession: 5, newOrder: 'hardest' });
  const s = createSession('learn', 4, ps);
  assert.deepEqual([1, 2, 3, 4, 5].map(() => s.next().id), ['p1', 'p2', 'p3', 'p4', 'p5']);
  assert.equal(s.next(), null); // new-puzzle limit reached

  P.setSettings({ newOrder: 'easiest' });
  assert.equal(createSession('learn', 4, ps).next().id, 'p30');
});

test('Learn puts missed puzzles and due reviews before new ones', () => {
  const ps = puzzles(10);
  P.record('p7', false);                // learning
  P.record('p9', true); advance(2 * DAY); // p9 due
  P.setSettings({ newPerSession: 1 });
  const s = createSession('learn', 4, ps);
  assert.deepEqual([s.next().id, s.next().id, s.next().id], ['p7', 'p9', 'p1']);
});

test('Learn re-asks a missed puzzle a few puzzles later', () => {
  const ps = puzzles(20);
  P.setSettings({ newPerSession: 15 });
  const s = createSession('learn', 4, ps);
  const first = s.next();
  s.result(first, false);
  const order = [];
  for (let i = 0; i < 8; i++) { const p = s.next(); order.push(p.id); s.result(p, true); }
  const idx = order.indexOf(first.id);
  assert.ok(idx >= 2 && idx <= 6, `re-asked at position ${idx}`);
});

test('unranked puzzles come after ranked ones in difficulty order', () => {
  const ordered = orderNew([...puzzles(3, false).map((p) => ({ ...p, id: 'u' + p.id })), ...puzzles(3)], 'hardest');
  assert.deepEqual(ordered.slice(0, 3).map((p) => p.id), ['p1', 'p2', 'p3']);
  assert.ok(ordered.slice(3).every((p) => p.id.startsWith('u')));
});

test('Perfect Run uses the configured size and reports misses', () => {
  P.setSettings({ runSize: 10, runPick: 'random' });
  const s = createSession('run', 4, puzzles(50), { pick: 'random' });
  let p, n = 0;
  while ((p = s.next())) { s.result(p, n !== 3); n++; }
  assert.equal(n, 10);
  assert.equal(s.misses.length, 1);
  assert.equal(s.correct, 9);
});

// ---------------- difficulty slices ----------------
test('difficulty slice picks the hardest X% of ranked puzzles', () => {
  const all = puzzles(200);
  const data = { byRating: new Map([[4, all]]), rankedByRating: new Map([[4, all]]) };
  const top10 = difficultySlice(data, 4, { from: 0, to: 10 });
  assert.equal(top10.puzzles.length, 20);
  assert.equal(top10.puzzles[0].id, 'p1');
  assert.equal(top10.puzzles.at(-1).id, 'p20');
  const band = difficultySlice(data, 4, { from: 5, to: 20 });
  assert.equal(band.puzzles.length, 30);
  assert.equal(band.puzzles[0].id, 'p11');
  const whole = difficultySlice(data, 4, { from: 0, to: 100 });
  assert.equal(whole.all, true);
  assert.equal(whole.puzzles.length, 200);
});

test('difficulty slice leaves out unranked puzzles and says how many', () => {
  const ranked = puzzles(90);
  const unranked = puzzles(10, false).map((p) => ({ ...p, id: 'u' + p.id }));
  const data = { byRating: new Map([[4, [...ranked, ...unranked]]]), rankedByRating: new Map([[4, ranked]]) };
  const s = difficultySlice(data, 4, { from: 0, to: 50 });
  assert.equal(s.puzzles.length, 45);
  assert.equal(s.unranked, 10);
});

process.on('exit', () => { Date.now = realNow; });
