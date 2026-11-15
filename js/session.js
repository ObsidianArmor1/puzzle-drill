// Drill sessions. Each session hands out puzzles one at a time and is told the result of each.
import { getRec, isDue, getSettings } from './progress.js';

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const accuracy = (r) => (r && r.n ? r.c / r.n : 1);

// Order in which Learn introduces new puzzles. Ranked puzzles go by global difficulty;
// puzzles without a difficulty score come after them in random order.
export function orderNew(list, order) {
  if (order === 'random') return shuffle([...list]);
  const ranked = list.filter((p) => p.hardRank).sort((a, b) => (order === 'easiest' ? b.hardRank - a.hardRank : a.hardRank - b.hardRank));
  return [...ranked, ...shuffle(list.filter((p) => !p.hardRank))];
}

export const MODES = {
  learn: {
    label: 'Learn',
    icon: 'img/puzzle-mode/normal.svg',
    description: 'Spaced repetition. Reviews puzzles that are due, re-asks misses until you get them, then adds new puzzles.',
  },
  run: {
    label: 'Perfect Run',
    icon: 'img/puzzle-mode/rush.svg',
    description: 'A fixed set of puzzles in a row. Aim for zero mistakes, then re-run your misses until the set is clean.',
  },
  mistakes: {
    label: 'Mistakes',
    icon: 'img/puzzle-mode/battle.svg',
    description: 'Only puzzles you have missed before or never got right, worst first. A puzzle leaves once you solve it.',
  },
  through: {
    label: 'Play Through',
    icon: 'img/puzzle-mode/rush.svg',
    description: 'Every puzzle in the set once, in order. Stop any time: it picks up where you left off.',
  },
  endless: {
    label: 'Endless',
    icon: 'img/puzzle-mode/normal.svg',
    description: 'Random puzzles from the set, forever. Still counts toward your progress.',
  },
};

class Session {
  constructor(mode, rating) { this.mode = mode; this.rating = rating; this.done = 0; this.correct = 0; this.streak = 0; this.bestStreak = 0; this.misses = []; }
  result(puzzle, correct) {
    this.done++;
    if (correct) { this.correct++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); }
    else { this.streak = 0; if (!this.misses.includes(puzzle.id)) this.misses.push(puzzle.id); }
  }
  progressLines() { return []; }
  get title() { return MODES[this.mode]?.label ?? 'Puzzle'; }
}

// ---------- Learn (spaced repetition) ----------
class LearnSession extends Session {
  constructor(rating, puzzles) {
    super('learn', rating);
    const now = Date.now();
    this.newLimit = getSettings().newPerSession;
    this.newUsed = 0;
    this.retries = []; // { p, at }  re-ask a missed puzzle after a few others
    this.learning = shuffle(puzzles.filter((p) => getRec(p.id)?.b === 1));
    this.due = puzzles.filter((p) => { const r = getRec(p.id); return r && r.b >= 2 && r.d <= now; })
      .sort((a, b) => getRec(a.id).d - getRec(b.id).d);
    this.fresh = orderNew(puzzles.filter((p) => !getRec(p.id)), getSettings().newOrder);
    this.unsolvedOld = shuffle(puzzles.filter((p) => { const r = getRec(p.id); return r && r.b === 0; }));
  }
  next() {
    const ready = this.retries.findIndex((r) => r.at <= this.done);
    if (ready >= 0) return this.retries.splice(ready, 1)[0].p;
    if (this.learning.length) return this.learning.shift();
    if (this.due.length) return this.due.shift();
    if (this.newUsed < this.newLimit) {
      const p = this.unsolvedOld.shift() || this.fresh.shift();
      if (p) { this.newUsed++; return p; }
    }
    if (this.retries.length) return this.retries.shift().p;
    return null;
  }
  result(puzzle, correct) {
    super.result(puzzle, correct);
    if (!correct) this.retries.push({ p: puzzle, at: this.done + 3 + Math.floor(Math.random() * 3) });
  }
  remaining() { return this.learning.length + this.due.length + Math.max(0, Math.min(this.newLimit - this.newUsed, this.fresh.length + this.unsolvedOld.length)) + this.retries.length; }
  progressLines() {
    return [
      ['Due reviews', `${this.due.length + this.learning.length}`],
      ['New', `${this.newUsed} / ${this.newLimit}`],
      ['To re-ask', `${this.retries.length}`],
    ];
  }
}

// ---------- Perfect Run ----------
class RunSession extends Session {
  constructor(rating, puzzles, { ids, pick = 'unmastered' } = {}) {
    super('run', rating);
    let set;
    if (ids) set = ids.map((id) => puzzles.find((p) => p.id === id)).filter(Boolean);
    else {
      const size = getSettings().runSize;
      let pool = puzzles;
      if (pick === 'unmastered') {
        const notMastered = puzzles.filter((p) => (getRec(p.id)?.b ?? 0) < 4);
        if (notMastered.length >= Math.min(size, puzzles.length)) pool = notMastered;
      } else if (pick === 'seen') {
        const seen = puzzles.filter((p) => getRec(p.id));
        if (seen.length) pool = seen;
      }
      set = shuffle([...pool]).slice(0, size);
    }
    this.set = set;
    this.queue = shuffle([...set]);
    this.total = set.length;
    this.pick = pick;
  }
  get title() { return this.isRerun ? 'Re-run Misses' : 'Perfect Run'; }
  next() { return this.queue.shift() || null; }
  remaining() { return this.queue.length; }
  progressLines() {
    return [
      ['Progress', `${this.done} / ${this.total}`],
      ['Mistakes', `${this.misses.length}`],
      ['Streak', `${this.streak}`],
    ];
  }
}

// ---------- Mistakes ----------
class MistakesSession extends Session {
  constructor(rating, puzzles) {
    super('mistakes', rating);
    this.queue = puzzles
      .map((p) => ({ p, r: getRec(p.id) }))
      .filter(({ r }) => r && (r.ok === false || r.c < r.n || r.b <= 1))
      .sort((a, b) => (a.r.ok === b.r.ok ? accuracy(a.r) - accuracy(b.r) : a.r.ok ? 1 : -1))
      .map(({ p }) => p);
    this.total = this.queue.length;
    this.retries = [];
  }
  next() {
    const ready = this.retries.findIndex((r) => r.at <= this.done);
    if (ready >= 0) return this.retries.splice(ready, 1)[0].p;
    return this.queue.shift() || (this.retries.length ? this.retries.shift().p : null);
  }
  result(puzzle, correct) {
    super.result(puzzle, correct);
    if (!correct) this.retries.push({ p: puzzle, at: this.done + 3 });
  }
  remaining() { return this.queue.length + this.retries.length; }
  progressLines() {
    return [
      ['Left to fix', `${this.queue.length + this.retries.length}`],
      ['Fixed', `${this.correct}`],
    ];
  }
}

// ---------- Play Through ----------
// Position is kept per set in localStorage: { [setKey]: { seen: [puzzle ids], correct: n } }.
const THROUGH_KEY = 'pd.through.v1';
const readThrough = () => { try { return JSON.parse(localStorage.getItem(THROUGH_KEY)) || {}; } catch { return {}; } };
const writeThrough = (all) => { try { localStorage.setItem(THROUGH_KEY, JSON.stringify(all)); } catch { /* storage full or blocked */ } };
/** { seen, correct, total, left } for a set's play-through (only counting puzzles still in the set). */
export function throughStatus(setKey, puzzles) {
  const t = readThrough()[setKey];
  const ids = new Set(puzzles.map((p) => p.id));
  const seen = (t?.seen || []).filter((id) => ids.has(id)).length;
  return { seen, correct: Math.min(t?.correct || 0, seen), total: puzzles.length, left: puzzles.length - seen };
}
export function resetThrough(setKey) { const all = readThrough(); delete all[setKey]; writeThrough(all); }

class ThroughSession extends Session {
  /** puzzles: in play order. setKey: where the position is stored. A finished play-through starts over. */
  constructor(rating, puzzles, { setKey = 'default' } = {}) {
    super('through', rating);
    this.setKey = setKey;
    if (throughStatus(setKey, puzzles).left === 0) resetThrough(setKey);
    const t = readThrough()[setKey] || { seen: [], correct: 0 };
    const seen = new Set(t.seen);
    this.total = puzzles.length;
    this.seenBefore = puzzles.filter((p) => seen.has(p.id)).length;
    this.correctBefore = Math.min(t.correct, this.seenBefore);
    this.queue = puzzles.filter((p) => !seen.has(p.id));
  }
  next() { return this.queue.shift() || null; }
  result(puzzle, correct) {
    super.result(puzzle, correct);
    const all = readThrough();
    const t = all[this.setKey] || { seen: [], correct: 0 };
    if (!t.seen.includes(puzzle.id)) { t.seen.push(puzzle.id); if (correct) t.correct++; }
    all[this.setKey] = t;
    writeThrough(all);
  }
  remaining() { return this.queue.length; }
  get finished() { return this.queue.length === 0 && this.seenBefore + this.done >= this.total; }
  progressLines() {
    return [
      ['Progress', `${this.seenBefore + this.done} / ${this.total}`],
      ['Correct', `${this.correctBefore + this.correct}`],
      ['Streak', `${this.streak}`],
    ];
  }
}

// ---------- Endless ----------
class EndlessSession extends Session {
  constructor(rating, puzzles) { super('endless', rating); this.puzzles = puzzles; this.recent = []; }
  next() {
    if (!this.puzzles.length) return null;
    let p;
    for (let tries = 0; tries < 20; tries++) {
      p = this.puzzles[Math.floor(Math.random() * this.puzzles.length)];
      if (!this.recent.includes(p.id)) break;
    }
    this.recent.push(p.id); if (this.recent.length > 50) this.recent.shift();
    return p;
  }
  remaining() { return Infinity; }
  progressLines() {
    return [
      ['Solved', `${this.correct} / ${this.done}`],
      ['Streak', `${this.streak}`],
      ['Best streak', `${this.bestStreak}`],
    ];
  }
}

// ---------- Single puzzle (browse / shared link) ----------
class SingleSession extends Session {
  constructor(puzzle) { super('single', puzzle.rating); this.p = puzzle; this.given = false; }
  get title() { return 'Single Puzzle'; }
  next() { if (this.given) return null; this.given = true; return this.p; }
  remaining() { return this.given ? 0 : 1; }
}

export function createSession(mode, rating, puzzles, opts = {}) {
  switch (mode) {
    case 'learn': return new LearnSession(rating, puzzles);
    case 'run': return new RunSession(rating, puzzles, opts);
    case 'mistakes': return new MistakesSession(rating, puzzles);
    case 'through': return new ThroughSession(rating, puzzles, opts);
    case 'endless': return new EndlessSession(rating, puzzles);
    case 'single': return new SingleSession(opts.puzzle);
    default: throw new Error('Unknown mode ' + mode);
  }
}

export { isDue };
