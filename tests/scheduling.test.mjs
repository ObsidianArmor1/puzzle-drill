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
const { createSession, orderNew, throughStatus } = await import('../js/session.js');
const { rankByDifficulty } = await import('../js/data.js');
const S = await import('../js/sets.js');

const DAY = 86400000;
let now = Date.UTC(2026, 0, 1);
const realNow = Date.now;
Date.now = () => now;
const advance = (ms) => { now += ms; };

beforeEach(() => {
  store.delete('pd.sets.v1');
  store.delete('pd.daily.v1');
  store.delete('pd.history.v1');
  store.delete('pd.through.v1');
  P.resetProgress();
  P.setSettings({ ...P.DEFAULT_SETTINGS });
  now = Date.UTC(2026, 0, 1);
});

// fake puzzles: id p1..pN, hardRank = N (1 = hardest)
const puzzles = (n, ranked = true) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, rating: 4, ...(ranked ? { hardRank: i + 1, successRate: (i + 1) / (n + 1) } : {}) }));

// ---------------- spaced repetition ----------------
test('first correct answer schedules a review for the next review day', () => {
  const r = P.record('a', true, 3000);
  assert.equal(r.b, 2);
  assert.equal(r.d, P.reviewDay(1, now));
  assert.equal(P.isDue(r), false);
  advance(P.reviewDay(1, now) - now);
  assert.equal(P.isDue(r), true);
});

test('reviews step through 1, 3, 7, 16, 35 days when answered on time', () => {
  P.record('a', true);
  for (const [box, days] of [[3, 3], [4, 7], [5, 16], [6, 35], [6, 35]]) {
    advance(P.getRec('a').d - now); // wait until due
    const r = P.record('a', true);
    assert.equal(r.b, box);
    assert.equal(r.d, P.reviewDay(days, now));
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

test('a miss drops one tier: Mastered -> Proficient -> Familiar -> Attempted', () => {
  P.record('a', true); advance(DAY); P.record('a', true); advance(3 * DAY); P.record('a', true);
  assert.equal(P.tierOf(P.getRec('a')).key, 'mastered');
  let r = P.record('a', false, 9000, 2);
  assert.equal(P.tierOf(r).key, 'proficient');
  assert.equal(r.b, 3);
  assert.equal(r.d, P.reviewDay(1, now)); // back for review tomorrow
  assert.equal(r.st, 0);
  assert.equal(r.w, 2);
  assert.equal(P.isMastered(r), false);
  assert.equal(P.isDue(r), false);
  r = P.record('a', false); assert.equal(P.tierOf(r).key, 'familiar');
  r = P.record('a', false); assert.equal(P.tierOf(r).key, 'attempted');
  assert.equal(r.d, now); assert.equal(P.isDue(r), true); // re-asked right away
  r = P.record('a', false); assert.equal(P.tierOf(r).key, 'attempted');
});

test('after a drop, re-answering in the same sitting does not climb back; the next day does', () => {
  P.record('a', true); advance(DAY); P.record('a', true); advance(3 * DAY); P.record('a', true);
  P.record('a', false);                       // Mastered -> Proficient
  P.record('a', true);                        // same sitting: not due, stays Proficient
  assert.equal(P.tierOf(P.getRec('a')).key, 'proficient');
  advance(DAY); P.record('a', true);          // next day: back to Mastered
  assert.equal(P.tierOf(P.getRec('a')).key, 'mastered');
});

test('a first-ever miss is Attempted; never played is Not started', () => {
  assert.equal(P.tierOf(P.getRec('n')).key, 'new');
  assert.equal(P.tierOf(P.record('n', false)).key, 'attempted');
  assert.equal(P.tierOf(P.record('m', true)).key, 'familiar');
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
  assert.deepEqual(s.tiers, [2, 1, 1, 0, 1]); // not started, attempted, familiar, proficient, mastered
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
// ---------------- difficulty ranking ----------------
test('every puzzle is ranked; few attempts are pulled toward the rating average', () => {
  const list = [
    { id: 'a', attempts: 100, solves: 10 },  // reliably hard (10%)
    { id: 'b', attempts: 1, solves: 0 },     // 0% from a single try: not trusted
    { id: 'c', attempts: 0, solves: 0 },     // never tried
    { id: 'd', attempts: 100, solves: 90 },  // reliably easy (90%)
  ];
  const ranked = rankByDifficulty(new Map([[1, list]])).get(1);
  assert.deepEqual(ranked.map((p) => p.id), ['a', 'b', 'c', 'd']);
  assert.ok(ranked.every((p) => p.hardRank >= 1));
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  assert.equal(byId.b.successRate, 0);          // raw rate kept for display
  assert.equal(byId.c.successRate, undefined);  // no attempts, no raw rate
  assert.ok(byId.b.difficulty > 0.3 && byId.b.difficulty < 0.5, 'single-try puzzle lands near the average');
});

// 3 ratings; puzzle i in rating r has successRate i/100, themes rotate; half the 5-star puzzles were never attempted
const mkData = () => {
  const byRating = new Map(), byId = new Map();
  const themes = ['CLEAN', 'OVERHANG', 'BURN', 'DIG', 'SPIRE'];
  for (const r of [3, 4, 5]) {
    const list = Array.from({ length: 100 }, (_, i) => {
      const tried = !(r === 5 && i >= 50);
      const p = { id: `r${r}-${i}`, rating: r, theme: themes[i % 5], attempts: tried ? 101 : 0, solves: tried ? i + 1 : 0 };
      byId.set(p.id, p); return p;
    });
    byRating.set(r, list);
  }
  rankByDifficulty(byRating);
  return { byRating, byId };
};

test('rule: hardest N across the chosen ratings, hardest first', () => {
  const data = mkData();
  const got = S.evaluateRule(data, { ...S.DEFAULT_RULE, ratings: [4], difficulty: { type: 'topN', n: 10 } });
  assert.equal(got.length, 10);
  assert.ok(got.every((p) => p.rating === 4));
  assert.deepEqual(got.slice(0, 2).map((p) => p.id), ['r4-0', 'r4-1']);
  const both = S.evaluateRule(data, { ...S.DEFAULT_RULE, ratings: [3, 4], difficulty: { type: 'topN', n: 10 } });
  assert.equal(new Set(both.map((p) => p.rating)).size, 2); // ties across ratings interleave
});

test('rule: hardest % and range cover every puzzle; never-tried ones rank near the middle', () => {
  const data = mkData();
  const top = S.evaluateRule(data, { ...S.DEFAULT_RULE, ratings: [5], difficulty: { type: 'topPct', pct: 10 } });
  assert.equal(top.length, 10);
  assert.ok(top.every((p) => p.attempts > 0), 'the hardest 10% are puzzles players actually missed');
  const band = S.evaluateRule(data, { ...S.DEFAULT_RULE, ratings: [4], difficulty: { type: 'range', from: 10, to: 20 } });
  assert.equal(band.length, 10);
  assert.equal(band[0].id, 'r4-10');
  assert.equal(S.evaluateRule(data, { ...S.DEFAULT_RULE, ratings: [5], difficulty: { type: 'any' } }).length, 100);
});

test('rule: success band, themes, progress status and limit narrow the list', () => {
  const data = mkData();
  const base = { ...S.DEFAULT_RULE, ratings: [4], difficulty: { type: 'any' } };
  assert.equal(S.evaluateRule(data, { ...base, success: { min: 0, max: 20 } }).length, 20);
  assert.ok(S.evaluateRule(data, { ...base, themes: ['BURN'] }).every((p) => p.theme === 'BURN'));
  assert.equal(S.evaluateRule(data, { ...base, themes: ['BURN'] }).length, 20);
  P.record('r4-0', true); P.record('r4-1', false);
  assert.equal(S.evaluateRule(data, { ...base, status: 'new' }).length, 98);
  assert.deepEqual(S.evaluateRule(data, { ...base, status: 'learning' }).map((p) => p.id), ['r4-1']);
  assert.equal(S.evaluateRule(data, { ...base, status: 'notMastered' }).length, 100);
  assert.deepEqual(S.evaluateRule(data, { ...base, limit: 3 }).map((p) => p.id), ['r4-0', 'r4-1', 'r4-2']);
  assert.equal(S.evaluateRule(data, { ...base, limit: 3, limitOrder: 'random' }).length, 3);
});

test('custom sets: save, resolve, handpick and delete', () => {
  const data = mkData();
  const set = S.saveSet({ name: 'Mine', ids: ['r4-3', 'r3-7', 'gone'] });
  const r = S.resolveSet(data, S.customKey(set.id));
  assert.equal(r.puzzles.length, 2);
  assert.equal(r.missing, 1);
  assert.equal(r.rating, null); // mixed ratings
  assert.equal(S.togglePuzzle(set.id, 'r5-1'), true);
  assert.equal(S.togglePuzzle(set.id, 'r4-3'), false);
  assert.deepEqual(S.getCustomSet(set.id).ids.sort(), ['gone', 'r3-7', 'r5-1']);
  assert.equal(S.resolveSet(data, 'r4').puzzles.length, 100);
  S.deleteSet(set.id);
  assert.equal(S.resolveSet(data, S.customKey(set.id)), null);
});

test('importing sets keeps the more recently updated copy', () => {
  const a = S.saveSet({ name: 'A', ids: ['x'] });
  const backup = S.listSets();
  advance(1000);
  S.saveSet({ ...a, name: 'A renamed' });
  assert.equal(S.importSets(backup), 0);
  assert.equal(S.getCustomSet(a.id).name, 'A renamed');
  S.deleteSet(a.id);
  assert.equal(S.importSets(backup), 1);
  assert.equal(S.getCustomSet(a.id).name, 'A');
});

// ---------------- sharing ----------------
test('rule-based sets share as their rule and rebuild the same puzzles', () => {
  const data = mkData();
  const rule = { ...S.DEFAULT_RULE, ratings: [4], difficulty: { type: 'topN', n: 12 }, themes: ['BURN', 'DIG'] };
  const set = S.saveSet({ name: 'Burns & digs', ids: S.evaluateRule(data, rule).map((p) => p.id), rule });
  const { kind, payload } = S.sharePayload(set);
  assert.equal(kind, 'rule');
  assert.ok(payload.length < 300);
  const got = S.parseShare(payload, data);
  assert.equal(got.name, 'Burns & digs');
  assert.deepEqual(got.ids, set.ids);
  assert.deepEqual(got.rule, rule);
});

test('sets with personal or random rules share their puzzle list instead', () => {
  const data = mkData();
  P.record('r4-0', true);
  const rule = { ...S.DEFAULT_RULE, ratings: [4], difficulty: { type: 'topN', n: 5 }, status: 'new' };
  const set = S.saveSet({ name: 'Mine', ids: S.evaluateRule(data, rule).map((p) => p.id), rule });
  const { kind, payload } = S.sharePayload(set);
  assert.equal(kind, 'codes');
  const got = S.parseShare(payload, data);
  assert.deepEqual(got.ids, set.ids);
  assert.equal(got.rule, undefined);
});

test('handpicked sets round-trip through puzzle codes; unknown and cut-off links are handled', () => {
  const data = mkData();
  const set = S.saveSet({ name: 'Hand', ids: ['r3-5', 'r5-80', 'r4-9'] });
  const { kind, payload } = S.sharePayload(set);
  assert.equal(kind, 'codes');
  assert.deepEqual(S.parseShare(payload, data).ids, set.ids);
  const withUnknown = payload + 'ZZZZZZ';
  assert.equal(S.parseShare(withUnknown, data).unknown, 1);
  assert.throws(() => S.parseShare(payload.slice(0, -2), data), /no valid puzzle list/);
  assert.throws(() => S.parseShare('n=x&r=bm90LWpzb24', data));
});

test('set files round-trip, drop unknown puzzles, and names stay unique', () => {
  const data = mkData();
  const rule = { ...S.DEFAULT_RULE, ratings: [3], difficulty: { type: 'topN', n: 3 } };
  const set = S.saveSet({ name: 'File set', ids: ['r3-0', 'r3-1', 'nope'], rule });
  const got = S.parseSetFile(S.setFile(set), data);
  assert.deepEqual(got.ids, ['r3-0', 'r3-1']);
  assert.equal(got.unknown, 1);
  assert.deepEqual(got.rule, rule);
  assert.throws(() => S.parseSetFile('{"kind":"other"}', data), /Not a Puzzle Drill set file/);
  assert.equal(S.uniqueName('File set'), 'File set (2)');
  assert.equal(S.uniqueName('Fresh'), 'Fresh');
});

test('share links survive apps that re-encode them', () => {
  const data = mkData();
  const rule = { ...S.DEFAULT_RULE, ratings: [4], difficulty: { type: 'any' }, success: { min: 0, max: 49.99 } };
  const set = S.saveSet({ name: '4★ under 50% success', ids: [], rule });
  const { payload } = S.sharePayload(set);
  assert.ok(!payload.includes('%'), 'no percent signs in new links');
  assert.equal(S.parseShare(payload, data).name, '4★ under 50% success');
  // whole fragment percent-encoded by an app
  assert.equal(S.parseShare(encodeURIComponent(payload), data).name, '4★ under 50% success');
  // older link format, double-encoded on the way (what actually happened)
  const legacy = 'n=4%E2%98%85%2520under%252050%2525%2520success&' + payload.split('&')[1];
  assert.equal(S.parseShare(legacy, data).name, '4★ under 50% success');
});

// ---------------- daily tracking ----------------
test('daily stats count new puzzles and time, keyed by local date', () => {
  P.record('a', true, 4000);
  P.record('a', false, 6000);
  P.record('b', true, 500000); // capped at 2 minutes
  const day = P.getDailyAll()[P.dayKey(new Date(now))];
  assert.deepEqual({ n: day.n, c: day.c, f: day.f, t: day.t }, { n: 3, c: 2, f: 2, t: 4000 + 6000 + 120000 });
  const d = new Date(2026, 10, 14, 23, 30); // 11:30 pm local stays on the 14th
  assert.equal(P.dayKey(d), '2026-11-14');
});

test('best streak counts consecutive local days', () => {
  for (const day of [1, 2, 3, 5, 6]) { now = new Date(2026, 0, day, 12).getTime(); P.record('x' + day, true); }
  assert.equal(P.bestStreak(), 3);
});

test('set snapshots keep one entry per day', () => {
  P.snapshotSets([{ key: 'r4', mastered: 1, seen: 5, total: 10 }]);
  P.snapshotSets([{ key: 'r4', mastered: 2, seen: 6, total: 10 }]);
  const h = P.getHistory();
  assert.equal(Object.keys(h).length, 1);
  assert.deepEqual(Object.values(h)[0].r4, [2, 6, 10]);
});

process.on('exit', () => { Date.now = realNow; });

// ---------- Play Through ----------
const playAll = (session, isCorrect = () => true, stopAfter = Infinity) => {
  const order = [];
  for (let p; order.length < stopAfter && (p = session.next()); ) { order.push(p.id); session.result(p, isCorrect(p)); }
  return order;
};
const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${String(i).padStart(3, '0')}`, rating: 4 }));

test('Play Through plays every puzzle once, in the given order', () => {
  const list = mk(87);
  const s = createSession('through', 4, list, { setKey: 'cX' });
  const order = playAll(s);
  assert.deepEqual(order, list.map((p) => p.id));
  assert.equal(s.finished, true);
  assert.deepEqual(throughStatus('cX', list), { seen: 87, correct: 87, total: 87, left: 0 });
});

test('Play Through resumes where it stopped, and counts first-try results only', () => {
  const list = mk(10);
  const s1 = createSession('through', 4, list, { setKey: 'cY' });
  const first = playAll(s1, (p) => p.id !== 't001', 4); // misses t001
  assert.deepEqual(first, ['t000', 't001', 't002', 't003']);
  assert.equal(s1.finished, false);
  const s2 = createSession('through', 4, list, { setKey: 'cY' });
  assert.equal(s2.remaining(), 6);
  const rest = playAll(s2);
  assert.deepEqual(rest, list.slice(4).map((p) => p.id));
  assert.equal(s2.finished, true);
  assert.deepEqual(throughStatus('cY', list), { seen: 10, correct: 9, total: 10, left: 0 });
  assert.equal(s2.progressLines()[0][1], '10 / 10');
});

test('Play Through starts over after a finished pass, and positions are per set', () => {
  const list = mk(3);
  playAll(createSession('through', 4, list, { setKey: 'cZ' }));
  const again = createSession('through', 4, list, { setKey: 'cZ' });
  assert.equal(again.remaining(), 3);
  assert.equal(throughStatus('cOther', list).left, 3);
});

test('set rules can filter by tier', () => {
  const ps = puzzles(4);
  const data = { byRating: new Map([[4, ps]]), rankedByRating: rankByDifficulty(new Map([[4, ps]])), byId: new Map(ps.map((p) => [p.id, p])) };
  P.record('p1', true);                                   // familiar
  P.record('p2', true); advance(DAY); P.record('p2', true); // proficient
  P.record('p3', false);                                  // attempted
  const ids = (status) => S.evaluateRule(data, { ...S.DEFAULT_RULE, ratings: [4], difficulty: { type: 'topPct', pct: 100 }, status }).map((p) => p.id).sort();
  assert.deepEqual(ids('familiar'), ['p1']);
  assert.deepEqual(ids('proficient'), ['p2']);
  assert.deepEqual(ids('learning'), ['p3']);
});

test('reviews go by day: due from the 4am rollover, not 24 hours after you played', () => {
  const evening = new Date(now); evening.setHours(21, 0, 0, 0); now = evening.getTime();
  const r = P.record('late', true);
  const nextDay = new Date(now); nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(3, 59, 0, 0); now = nextDay.getTime();
  assert.equal(P.isDue(r), false);            // 3:59am still counts as the day you played
  nextDay.setHours(19, 0, 0, 0); now = nextDay.getTime();
  assert.equal(P.isDue(r), true);             // 7pm next day: due, though only 22 hours later
  assert.equal(P.daysUntilDue(r), 0);
  assert.equal(P.tierOf(P.record('late', true)).key, 'proficient');
});

test('daily tally counts tiers gained and lost', () => {
  P.record('u1', true);                      // New -> Familiar: up
  P.record('u2', false);                     // first-ever miss: not an up
  P.record('u3', true); advance(DAY); P.record('u3', true); advance(3 * DAY); P.record('u3', true); // ... Mastered
  P.record('u3', false);                     // Mastered -> Solid: down
  const t = P.getDaily().today;
  assert.equal(t.dn, 1);
  assert.ok(t.u >= 1);
});

test('Learn can take a larger batch of new puzzles than the setting', () => {
  const ps = puzzles(30);
  const s = createSession('learn', 4, ps, { newLimit: 25 });
  let n = 0; for (let p; (p = s.next()); ) { s.result(p, true); n++; }
  assert.equal(n, 25);
});
