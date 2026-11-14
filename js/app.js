import { loadAll, decode, matchSubmission } from './data.js';
import {
  listSets, getCustomSet, saveSet, deleteSet, togglePuzzle, importSets, resolveSet, evaluateRule, describeRule,
  ratingKey, customKey, DEFAULT_RULE, THEMES, STATUS_OPTIONS,
  sharePayload, parseShare, setFile, parseSetFile, ruleIsPortable, uniqueName,
} from './sets.js';
import { NesBoard, PuzzleBoard, pieceSVG } from './board.js';
import { createSession, MODES, orderNew } from './session.js';
import {
  getSettings, setSettings, getRec, record, summarize, getDaily, isMastered, resetProgress, MASTERED_BOX,
  exportProgress, importProgress, lastBackup, progressCount,
  getDailyAll, bestStreak, snapshotSets, getHistory, dayKey,
} from './progress.js';
import { PUZZLE_THEME_TEXT } from './core.js';

const app = document.getElementById('app');
const PUZZLE_TIME_LIMIT = 30;

const RIGHT_ANSWER_COMMENTS = [
  'You got it!', 'Stack-tastic!', 'Superb solving!', 'Bullseye!', 'Sharp as a tack!',
  'Nailed it with style!', 'Right on the money!', 'You cracked the code!',
];
const WRONG_ANSWER_COMMENTS = [
  "Good try! This puzzle's a toughie.", 'Not quite, but you got the next one!', 'Back to the drawing board!',
  'A valiant effort, but not the right move!', "You're circling the right answer… just not there yet!",
  'Almost! Give it another go!', 'That was a creative take - try again!', 'Oops! That one slipped by. Try again!',
  'So close, I could almost high-five you!', 'Not quite, but I love the enthusiasm!',
  "You gave it a shot - let's go again!", 'Every wrong answer is a step to the right one!',
  'The right answer is playing hide-and-seek. Try again!', "Keep at it - you're getting warmer!",
  "You've got the spirit! Try one more time!", 'One step closer to cracking the puzzle!',
  "Wrong turn, but you'll find the right path soon!", 'Almost there! I believe in you!',
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- small UI helpers ----------
function solidButton({ label, icon, color = '#3C5EB7', stretch = false, id, disabled = false, paddingVertical }) {
  const pv = paddingVertical ? ` style="margin-block:${paddingVertical}px"` : '';
  return `<span class="solid-button prevent-select${stretch ? ' stretch' : ''}${disabled ? ' disabled' : ''}"${id ? ` id="${id}"` : ''}>
    <button class="button" style="background-color:${color}">
      ${icon ? `<img class="icon" src="${icon}" height="18">` : ''}
      ${label ? `<span class="label"${pv}>${esc(label)}</span>` : ''}
    </button></span>`;
}
const outlineButton = (label, cls = '', id = '') => `<button class="outline-button prevent-select ${cls}"${id ? ` id="${id}"` : ''}><span class="label">${esc(label)}</span></button>`;
const stars = (rating, width = 75) => `<img src="assets/img/rating-icons/star-${rating >= 1 && rating <= 6 ? rating : 'none'}.svg" width="${rating === 6 ? width * 1.198 : width}">`;

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2500);
}

const sounds = {};
function play(name) {
  if (!getSettings().sound) return;
  try {
    const a = (sounds[name] ||= new Audio(`assets/sounds/${name}.wav`));
    a.currentTime = 0; a.play().catch(() => {});
  } catch { /* ignore */ }
}

function fmtInterval(ms) {
  if (ms <= 0) return 'now';
  const days = ms / 86400000;
  if (days >= 0.95) return `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`;
  const h = ms / 3600000;
  if (h >= 1) return `${Math.round(h)} h`;
  return `${Math.max(1, Math.round(ms / 60000))} min`;
}

// ---------- view lifecycle ----------
let cleanups = [];
function setView(html, cls = '') {
  cleanups.forEach((f) => f()); cleanups = [];
  app.innerHTML = `<div class="root ${cls}">${html}</div>`;
  return app.firstElementChild;
}
function onKey(handler) {
  const f = (e) => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return; handler(e); };
  window.addEventListener('keydown', f);
  cleanups.push(() => window.removeEventListener('keydown', f));
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

// ---------- routing ----------
let migrated = false;
async function route() {
  if (location.hash.startsWith('#/shared/')) {
    const data = await loadAll();
    const payload = location.hash.slice('#/shared/'.length);
    return receiveView(data, () => parseShare(payload, data));
  }
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const data = await loadAll();
  if (!migrated) { migrated = true; migrateSettings(data); }
  const legacy = (k) => (k && /^\d+$/.test(k) ? ratingKey(k) : k); // old links used bare ratings
  if (parts[0] === 'play') return playView(data, parts[1], legacy(parts[2]));
  if (parts[0] === 'puzzle') return puzzleView(data, parts[1]);
  if (parts[0] === 'browse') return browseView(data, legacy(parts[1]) || currentSet(data)?.key);
  if (parts[0] === 'share') return shareView(data, parts[1]);
  if (parts[0] === 'settings') return settingsView(data);
  if (parts[0] === 'stats') return statsView(data);
  if (parts[0] === 'summary') return lastSummary ? renderSummary(data, lastSummary) : homeView(data);
  if (parts[0] === 'sets' && parts[1] === 'new') return builderView(data, null, parts[2]);
  if (parts[0] === 'sets' && parts[1] === 'edit') return builderView(data, parts[2]);
  return homeView(data);
}
window.addEventListener('hashchange', route);

// =====================================================================================
// HOME
// =====================================================================================
function homeView(data) {
  const s = getSettings();
  const daily = getDaily();
  const sel = currentSet(data);
  const lib = libraryKeys(data);
  snapshotLibrary(data);

  const card = (key) => {
    const set = resolveSet(data, key);
    if (!set) return '';
    const sum = summarize(set.puzzles);
    const m = sum.total ? (sum.mastered / sum.total) * 100 : 0, seen = sum.total ? (sum.seen / sum.total) * 100 : 0;
    const head = set.kind === 'rating'
      ? `${stars(set.rating, 80)}<span class="lib-tag">Default</span>`
      : `<span class="lib-name">${esc(set.name)}</span>`;
    return `<button class="rating-card lib-card${key === sel?.key ? ' selected' : ''}" data-key="${esc(key)}">
      ${head}
      <div class="count">${set.puzzles.length.toLocaleString()}</div>
      <div class="bar"><div class="m" style="width:${m}%"></div><div class="s" style="width:${Math.max(0, seen - m)}%"></div></div>
      <div class="small">${sum.mastered.toLocaleString()} mastered · ${sum.seen.toLocaleString()} seen</div>
    </button>`;
  };

  const list = sel ? sel.puzzles : [];
  const sum = list.length ? summarize(list) : null;
  const mistakes = list.filter((p) => { const r = getRec(p.id); return r && (r.ok === false || r.c < r.n || r.b <= 1); }).length;
  const newOrder = s.newOrder || 'hardest';
  const nextNew = newOrder === 'random' ? null : orderNew(list.filter((p) => !getRec(p.id)), newOrder)[0];
  const learnNext = !sel ? '' : newOrder === 'random' ? ', in random order'
    : nextNew?.hardRank ? `, ${newOrder} first (next up: hardness rank <b>#${nextNew.hardRank.toLocaleString()}</b>)`
    : `, ${newOrder} first`;
  const rates = list.filter((p) => p.successRate !== undefined).map((p) => p.successRate);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const selInfo = !sel ? '' : [
    sel.kind === 'custom' ? (sel.set.rule ? esc(describeRule(sel.set.rule, PUZZLE_THEME_TEXT)) : 'Handpicked') : `All ${sel.rating}★ puzzles`,
    `${list.length.toLocaleString()} puzzles`,
    rates.length && !(sel.set?.rule?.success && (sel.set.rule.success.min > 0 || sel.set.rule.success.max < 100)) ? `solved by ${pct(Math.min(...rates))}–${pct(Math.max(...rates))} of players` : '',
    sel.missing ? `${sel.missing} no longer in the data` : '',
  ].filter(Boolean).join(' · ');

  // "Continue" card: the last mode you used on the selected set, with what's waiting
  const unseen = list.filter((p) => !getRec(p.id)).length;
  const dueNow = sum ? sum.due + sum.learning : 0;
  const newNext = Math.min(s.newPerSession, unseen);
  let contMode = MODES[s.lastMode] ? s.lastMode : 'learn';
  if (contMode === 'mistakes' && !mistakes) contMode = 'learn';
  if (contMode === 'learn' && dueNow + newNext === 0 && list.length) contMode = 'run';
  const contText = {
    learn: dueNow ? `${dueNow.toLocaleString()} review${dueNow === 1 ? '' : 's'} due${newNext ? ` · ${newNext.toLocaleString()} new` : ''}` : `${newNext.toLocaleString()} new puzzle${newNext === 1 ? '' : 's'}`,
    run: dueNow + newNext === 0 && s.lastMode !== 'run' ? `Nothing due right now: a Perfect Run of ${Math.min(s.runSize, list.length)} keeps it sharp` : `${Math.min(s.runSize, list.length)} puzzles in a row, aiming for zero mistakes`,
    mistakes: `${mistakes.toLocaleString()} puzzle${mistakes === 1 ? '' : 's'} to fix`,
    endless: 'Random puzzles from this set',
  }[contMode];
  const t = daily.today;
  const todayLine = t.n
    ? `Today: <b>${t.n}</b> puzzle${t.n === 1 ? '' : 's'} · ${Math.round((t.c / t.n) * 100)}% correct${t.f ? ` · ${t.f} new` : ''}${t.t ? ` · ${fmtMinutes(t.t)}` : ''}${daily.streak > 1 ? ` · ${daily.streak}-day streak` : ''}`
    : `Nothing yet today${daily.streak ? ` · keep your ${daily.streak}-day streak going` : ''}`;
  const showIntro = !s.introDone && progressCount() === 0;

  const modeHints = {
    learn: `${MODES.learn.description} ${sum ? `${sum.due + sum.learning} due, up to ${s.newPerSession} new${learnNext}.` : ''}`,
    run: `${MODES.run.description} Picks ${Math.min(s.runSize, list.length)} from: ${{ unmastered: 'not yet mastered', random: 'the whole set', seen: 'puzzles you have seen' }[s.runPick || 'unmastered']}.`,
    mistakes: MODES.mistakes.description,
    endless: MODES.endless.description,
  };
  const modeBtn = (mode, badge) => `
    <button class="mode-btn${list.length ? '' : ' locked'}" data-mode="${mode}">
      <img class="prevent-select" src="assets/${MODES[mode].icon}" width="30" height="30">
      <span class="prevent-select">${MODES[mode].label}</span>${badge !== undefined && badge !== '' ? `<span class="badge">${badge}</span>` : ''}
    </button>`;

  const root = setView(`
    ${topNav()}
    <div class="home">
      <header><h1 class="title">PUZZLES</h1></header>
      <p class="subtitle">Drill rated nestris.org puzzles until every one is automatic.</p>

      ${showIntro ? `<div class="panel intro">
        <h3>New here?</h3>
        <p>Puzzle Drill helps you memorize rated NES Tetris puzzles from nestris.org: find the best place for the two pieces, just like on the site.</p>
        <ol>
          <li><b>Pick a set</b> from the Library below. 4★ is a good start.</li>
          <li><b>Press Start.</b> Learn shows the puzzles you're due to review, then new ones.</li>
          <li><b>Come back daily.</b> Each correct answer pushes a puzzle's next review further out (1, 3, 7, 16, 35 days) until it's <b>mastered</b>.</li>
        </ol>
        <p class="muted">Controls work like nestris.org: hover to move, click to place, Z/X to rotate.</p>
        ${solidButton({ label: 'Got it', color: '#2F3033', id: 'intro-done' })}
      </div>` : ''}

      ${sel && list.length ? `<div class="panel continue">
        <div class="continue-text">
          <span class="continue-kicker">${t.n ? 'Continue' : 'Start'}</span>
          <h3>${MODES[contMode].label} · ${esc(sel.kind === 'rating' ? `${sel.rating}★ puzzles` : sel.name)}</h3>
          <p>${contText}</p>
          <p class="muted">${todayLine}</p>
        </div>
        ${solidButton({ label: t.n ? 'Continue' : 'Start', icon: 'assets/img/button-icons/new-puzzle.svg', color: '#54A165', id: 'continue' })}
      </div>` : ''}

      ${data.byId.size ? '' : `<div class="panel"><p><b>No puzzles loaded.</b> The puzzle data failed to load; try refreshing the page.</p></div>`}

      ${sel ? `<div class="panel set-panel">
        <div class="row set-head"><h3>${sel.kind === 'rating' ? `${sel.rating}★ puzzles` : esc(sel.name)}</h3>
          <div class="row set-actions">
            ${solidButton({ label: 'Browse', color: '#2F3033', id: 'set-browse' })}
            ${solidButton({ label: 'Share', color: '#2F3033', id: 'set-share' })}
            ${sel.kind === 'rating' ? solidButton({ label: 'Customize', color: '#2F3033', id: 'set-customize' }) : ''}
            ${sel.kind === 'custom' ? solidButton({ label: sel.set.rule ? 'Edit' : 'Rename', color: '#2F3033', id: 'set-edit' }) : ''}
            ${sel.kind === 'custom' && sel.set.rule ? solidButton({ label: 'Refresh', color: '#2F3033', id: 'set-refresh' }) : ''}
            ${sel.kind === 'custom' ? solidButton({ label: 'Duplicate', color: '#2F3033', id: 'set-dup' }) : ''}
            ${sel.kind === 'custom' ? solidButton({ label: 'Delete', color: '#B73C3C', id: 'set-delete' }) : ''}
          </div></div>
        <p>${selInfo}</p>
        ${sel.kind === 'custom' && !list.length ? '<p>This set is empty. Open <b>Browse</b> on any set and use "Collect into" to handpick puzzles for it.</p>' : ''}
        ${sum ? `<div class="summary-row">
          <div class="summary-chip"><span class="v">${Math.round((sum.mastered / sum.total) * 1000) / 10}%</span><span class="k">mastered</span></div>
          <div class="summary-chip"><span class="v">${sum.due + sum.learning}</span><span class="k">due now</span></div>
          <div class="summary-chip"><span class="v">${(sum.total - sum.seen).toLocaleString()}</span><span class="k">never seen</span></div>
          <div class="summary-chip"><span class="v">${sum.attempts ? Math.round((sum.correct / sum.attempts) * 100) + '%' : '–'}</span><span class="k">accuracy</span></div>
        </div>` : ''}
        <div class="mode-row">
          ${modeBtn('learn', sum ? (sum.due + sum.learning || '') : '')}
          ${modeBtn('run', Math.min(s.runSize, list.length) || '')}
          ${modeBtn('mistakes', mistakes || '')}
          ${modeBtn('endless', '')}
        </div>
        <p class="mode-hint" id="mode-hint">${modeHints.learn}</p>
      </div>` : ''}

      <h2 class="section">Library</h2>
      <div class="rating-row library">
        ${lib.map(card).join('')}
        <button class="rating-card lib-card new-set" id="new-set"><span class="plus">+</span><div class="small">New set</div></button>
      </div>
    </div>`, 'scroll');

  root.querySelectorAll('.lib-card[data-key]').forEach((b) => (b.onclick = () => {
    setSettings({ setKey: b.dataset.key });
    homeView(data);
    app.firstElementChild?.querySelector('.set-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  root.querySelector('#new-set').onclick = () => go('#/sets/new');
  root.querySelector('#continue')?.addEventListener('click', () => go(`#/play/${contMode}/${sel.key}`));
  root.querySelector('#intro-done')?.addEventListener('click', () => { setSettings({ introDone: true }); homeView(data); });
  const hint = root.querySelector('#mode-hint');
  root.querySelectorAll('.mode-btn[data-mode]').forEach((b) => {
    b.onclick = () => go(`#/play/${b.dataset.mode}/${sel.key}`);
    b.onmouseenter = () => { hint.textContent = ''; hint.innerHTML = modeHints[b.dataset.mode]; };
  });
  root.querySelector('.mode-row')?.addEventListener('mouseleave', () => { hint.innerHTML = modeHints.learn; });
  root.querySelector('#set-browse')?.addEventListener('click', () => go(`#/browse/${sel.key}`));
  root.querySelector('#set-edit')?.addEventListener('click', () => go(`#/sets/edit/${sel.set.id}`));
  root.querySelector('#set-share')?.addEventListener('click', () => go(`#/share/${sel.kind === 'custom' ? sel.set.id : sel.key}`));
  root.querySelector('#set-customize')?.addEventListener('click', () => go(`#/sets/new/${sel.key}`));
  root.querySelector('#set-dup')?.addEventListener('click', () => {
    const copy = saveSet({ name: uniqueName(`${sel.set.name} copy`), ids: [...sel.set.ids], ...(sel.set.rule ? { rule: structuredClone(sel.set.rule) } : {}) });
    setSettings({ setKey: customKey(copy.id) }); toast(`Created "${copy.name}"`); homeView(data);
  });
  root.querySelector('#set-refresh')?.addEventListener('click', () => {
    const ids = evaluateRule(data, sel.set.rule).map((p) => p.id);
    const added = ids.filter((id) => !sel.set.ids.includes(id)).length, removed = sel.set.ids.filter((id) => !ids.includes(id)).length;
    if (!added && !removed) return toast('Already up to date');
    if (!confirm(`Re-apply the rules to "${sel.set.name}"? ${added} puzzle(s) would be added and ${removed} removed. Your progress on every puzzle is kept.`)) return;
    saveSet({ ...sel.set, ids }); toast('Set refreshed'); homeView(data);
  });
  root.querySelector('#set-delete')?.addEventListener('click', () => {
    if (!confirm(`Delete the set "${sel.set.name}"? Your progress on its puzzles is kept.`)) return;
    deleteSet(sel.set.id); setSettings({ setKey: null }); toast('Set deleted'); homeView(data);
  });

}

// Library order: default star sets, then custom sets oldest first
function libraryKeys(data) {
  const builtIn = [1, 2, 3, 4, 5, 6].filter((r) => data.byRating.get(r)?.length).map(ratingKey);
  return [...builtIn, ...listSets().map((x) => customKey(x.id))];
}
function currentSet(data) {
  const s = getSettings();
  return resolveSet(data, s.setKey) || resolveSet(data, ratingKey(s.rating || 4)) || resolveSet(data, libraryKeys(data)[0]);
}

// One-time migration from the old per-rating Difficulty ranges to custom sets
function migrateSettings(data) {
  const s = getSettings();
  if (s.diff && typeof s.diff === 'object') {
    for (const [r, range] of Object.entries(s.diff)) {
      if (!range || (range.from <= 0 && range.to >= 100)) continue;
      const rule = { ...DEFAULT_RULE, ratings: [Number(r)], difficulty: { type: 'range', from: range.from, to: range.to } };
      const set = saveSet({ name: describeRule(rule, PUZZLE_THEME_TEXT), ids: evaluateRule(data, rule).map((p) => p.id), rule });
      if (Number(r) === (s.rating || 4) && !s.setKey) setSettings({ setKey: customKey(set.id) });
    }
    setSettings({ diff: null });
  }
  if (!getSettings().setKey && s.rating) setSettings({ setKey: ratingKey(s.rating) });
}

// =====================================================================================
// SET BUILDER
// =====================================================================================
function builderView(data, editId, fromKey) {
  const existing = editId ? getCustomSet(editId) : null;
  if (editId && !existing) return go('#/');
  const handpicked = existing && !existing.rule;
  // "Customize" on a default set starts from all of that star rating
  const fromRating = fromKey && /^r\d$/.test(fromKey) ? Number(fromKey.slice(1)) : null;
  let rule = structuredClone(existing?.rule || (fromRating ? { ...DEFAULT_RULE, ratings: [fromRating], difficulty: { type: 'any' } } : DEFAULT_RULE));
  let name = existing?.name || '';
  let nameTouched = !!existing;
  const ratings = [1, 2, 3, 4, 5, 6].filter((r) => data.byRating.get(r)?.length);

  const root = setView(`
    ${outlineButton('Exit', 'leave-fullscreen-button', 'exit')}
    <div class="home builder">
      <header><h1 class="title">${existing ? 'EDIT SET' : 'NEW SET'}</h1></header>
      <div class="panel">
        <label class="wide">Name <input type="text" id="b-name" class="name-input" maxlength="60" placeholder="e.g. Hardest 100 4-star"></label>
      </div>
      ${handpicked ? `<div class="panel"><p>This set was handpicked (${existing.ids.length.toLocaleString()} puzzles). Add or remove puzzles from Browse with "Collect into".</p></div>` : `
      <div class="panel">
        <h4>1 · Star ratings</h4>
        <div class="row pills" id="b-ratings">${ratings.map((r) => `<button class="pill" data-r="${r}">${r}★ <small>${data.byRating.get(r).length.toLocaleString()}</small></button>`).join('')}</div>
      </div>
      <div class="panel">
        <h4>2 · Difficulty</h4>
        <div class="row pills" id="b-dtype">
          <button class="pill" data-t="any">Any</button><button class="pill" data-t="topN">Hardest N</button>
          <button class="pill" data-t="topPct">Hardest %</button><button class="pill" data-t="range">Range</button>
        </div>
        <div class="row" id="b-dparams"></div>
        <p>Ranked by how rarely players solve each puzzle on nestris.org, across the star ratings chosen above. Puzzles with only a few attempts are ranked closer to average.</p>
      </div>
      <div class="panel">
        <h4>3 · Narrow it down <small>(optional)</small></h4>
        <div class="row"><label>Global success rate from <input type="number" id="b-smin" min="0" max="100" step="any">% to <input type="number" id="b-smax" min="0" max="100" step="any">%</label></div>
        <div class="row pills" id="b-themes">${THEMES.map((t) => `<button class="pill" data-theme="${t}">${esc(PUZZLE_THEME_TEXT[t] || t)}</button>`).join('')}</div>
        <div class="row"><label>Your progress <select id="b-status" class="dark-select">${STATUS_OPTIONS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label></div>
        <div class="row"><label>At most <input type="number" id="b-limit" min="1" step="1" placeholder="no limit"> puzzles, picking <select id="b-lorder" class="dark-select"><option value="hardest">the hardest</option><option value="random">at random</option></select></label></div>
      </div>`}
      <div class="panel preview" id="b-preview"></div>
      <div class="row builder-buttons">
        ${solidButton({ label: existing ? 'Save set' : 'Create set', color: '#54A165', id: 'b-save' })}
        ${!existing ? solidButton({ label: 'Start an empty set to handpick', color: '#2F3033', id: 'b-empty' }) : ''}
        ${!existing ? `<label class="solid-button" style="cursor:pointer"><span class="button" style="background-color:#2F3033"><span class="label">Import a set file</span></span><input type="file" id="b-import" accept=".json,application/json" hidden></label>` : ''}
      </div>
    </div>`, 'scroll');

  const $ = (q) => root.querySelector(q);
  const nameEl = $('#b-name');
  nameEl.value = name;
  nameEl.oninput = () => { name = nameEl.value; nameTouched = true; };
  $('#exit').onclick = () => go('#/');

  let result = handpicked ? existing.ids.map((id) => data.byId.get(id)).filter(Boolean) : [];

  const refresh = () => {
    if (!handpicked) {
      $('#b-ratings').querySelectorAll('.pill').forEach((b) => b.classList.toggle('active', rule.ratings.includes(Number(b.dataset.r))));
      $('#b-dtype').querySelectorAll('.pill').forEach((b) => b.classList.toggle('active', b.dataset.t === rule.difficulty.type));
      $('#b-themes').querySelectorAll('.pill').forEach((b) => b.classList.toggle('active', !rule.themes || rule.themes.includes(b.dataset.theme)));
      result = evaluateRule(data, rule);
      if (!nameTouched) { name = describeRule(rule, PUZZLE_THEME_TEXT); nameEl.value = name; }
    }
    const sum = summarize(result);
    const rates = result.filter((p) => p.successRate !== undefined).map((p) => p.successRate);
    const pc = (x) => `${Math.round(x * 100)}%`;
    $('#b-preview').innerHTML = `<p class="big-count"><b>${result.length.toLocaleString()}</b> puzzles</p>
      <p>${rates.length ? `Solved by ${pc(Math.min(...rates))}–${pc(Math.max(...rates))} of players on nestris.org. ` : ''}You've seen ${sum.seen.toLocaleString()} of them and mastered ${sum.mastered.toLocaleString()}; that progress carries over.</p>
      ${!handpicked ? '<p>The puzzle list is saved when you create the set. Use <b>Refresh</b> later to re-apply these rules.</p>' : ''}`;
  };

  const renderDParams = () => {
    const d = rule.difficulty;
    const box = $('#b-dparams');
    if (d.type === 'topN') box.innerHTML = `<label>The <input type="number" id="b-n" min="1" step="1" value="${d.n ?? 100}"> hardest puzzles</label>`;
    else if (d.type === 'topPct') box.innerHTML = `<label>The hardest <input type="number" id="b-pct" min="0.1" max="100" step="any" value="${d.pct ?? 10}">%</label>`;
    else if (d.type === 'range') box.innerHTML = `<label>From the <input type="number" id="b-from" min="0" max="100" step="any" value="${d.from ?? 0}">% to the <input type="number" id="b-to" min="0" max="100" step="any" value="${d.to ?? 10}">% hardest</label>`;
    else box.innerHTML = '';
    box.querySelectorAll('input').forEach((inp) => (inp.oninput = () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      if (inp.id === 'b-n') d.n = Math.max(1, Math.floor(v));
      if (inp.id === 'b-pct') d.pct = Math.max(0.1, Math.min(100, v));
      if (inp.id === 'b-from') d.from = Math.max(0, Math.min(100, v));
      if (inp.id === 'b-to') d.to = Math.max(0, Math.min(100, v));
      refresh();
    }));
  };

  if (!handpicked) {
    $('#b-ratings').querySelectorAll('.pill').forEach((b) => (b.onclick = () => {
      const r = Number(b.dataset.r);
      rule.ratings = rule.ratings.includes(r) ? rule.ratings.filter((x) => x !== r) : [...rule.ratings, r].sort();
      refresh();
    }));
    $('#b-dtype').querySelectorAll('.pill').forEach((b) => (b.onclick = () => {
      const t = b.dataset.t;
      rule.difficulty = { type: t, n: rule.difficulty.n ?? 100, pct: rule.difficulty.pct ?? 10, from: rule.difficulty.from ?? 0, to: rule.difficulty.to ?? 10 };
      renderDParams(); refresh();
    }));
    $('#b-themes').querySelectorAll('.pill').forEach((b) => (b.onclick = () => {
      const t = b.dataset.theme;
      // From "any theme", a click picks just that theme; after that, clicks toggle themes in and out
      let next = !rule.themes ? [t] : rule.themes.includes(t) ? rule.themes.filter((x) => x !== t) : [...rule.themes, t];
      if (!next.length || next.length === THEMES.length) next = null;
      rule.themes = next;
      refresh();
    }));
    const sv = (x, dflt) => (x === undefined || x === null ? dflt : x);
    $('#b-smin').value = sv(rule.success?.min, 0); $('#b-smax').value = sv(rule.success?.max, 100);
    const onSuccess = () => {
      const min = Number($('#b-smin').value), max = Number($('#b-smax').value);
      rule.success = Number.isFinite(min) && Number.isFinite(max) ? { min: Math.max(0, min), max: Math.min(100, max) } : null;
      refresh();
    };
    $('#b-smin').oninput = onSuccess; $('#b-smax').oninput = onSuccess;
    $('#b-status').value = rule.status || 'any';
    $('#b-status').onchange = (e) => { rule.status = e.target.value; refresh(); };
    $('#b-limit').value = rule.limit || '';
    $('#b-limit').oninput = (e) => { const v = Math.floor(Number(e.target.value)); rule.limit = v > 0 ? v : null; refresh(); };
    $('#b-lorder').value = rule.limitOrder || 'hardest';
    $('#b-lorder').onchange = (e) => { rule.limitOrder = e.target.value; refresh(); };
    renderDParams();
  }
  refresh();

  $('#b-save').onclick = () => {
    const finalName = (nameEl.value || '').trim() || (handpicked ? 'My set' : describeRule(rule, PUZZLE_THEME_TEXT));
    if (!handpicked && !result.length && !confirm('No puzzles match these rules. Create an empty set anyway?')) return;
    const set = saveSet(handpicked ? { ...existing, name: finalName } : { ...(existing || {}), name: finalName, ids: result.map((p) => p.id), rule });
    setSettings({ setKey: customKey(set.id) });
    toast(existing ? 'Set saved' : `Created "${finalName}"`);
    go('#/');
  };
  $('#b-import')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    receiveView(data, () => {
      try { return parseSetFile(text, data); } catch (err) { throw new Error(err instanceof SyntaxError ? 'That file is not valid JSON' : err.message); }
    }, 'file');
  });
  $('#b-empty')?.addEventListener('click', () => {
    const finalName = nameTouched && nameEl.value.trim() ? nameEl.value.trim() : 'My set';
    const set = saveSet({ name: finalName, ids: [] });
    setSettings({ setKey: customKey(set.id) });
    browseState.collect = set.id;
    toast(`Created "${finalName}". Pick puzzles with the + on each tile.`);
    go(`#/browse/${ratingKey(currentRatingGuess(data))}`);
  });
  onKey((e) => { if (e.key === 'Escape') go('#/'); });
}
const currentRatingGuess = (data) => (data.byRating.get(4)?.length ? 4 : [...data.byRating.keys()][0]);

// =====================================================================================
// SHARE / RECEIVE SETS
// =====================================================================================
const DISCORD_LIMIT = 2000;
const downloadText = (text, filename) => {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
const fileSafe = (name) => name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'set';

function shareView(data, setId) {
  // Default sets share as the rule "all puzzles of this star rating"
  const builtIn = /^r\d$/.test(setId) ? resolveSet(data, setId) : null;
  const set = builtIn
    ? { name: `All ${builtIn.rating}★ puzzles`, ids: builtIn.puzzles.map((p) => p.id), rule: { ...DEFAULT_RULE, ratings: [builtIn.rating], difficulty: { type: 'any' } } }
    : getCustomSet(setId);
  if (!set) return go('#/');
  const { kind, payload } = sharePayload(set);
  const link = `${location.origin}${location.pathname}#/shared/${payload}`;
  const fits = link.length <= DISCORD_LIMIT;
  const how = kind === 'rule'
    ? 'This link carries the set\'s rules, so it stays short and the recipient gets exactly the same puzzles, plus Edit and Refresh.'
    : `This link lists the ${set.ids.length.toLocaleString()} puzzles by short codes.${set.rule && !ruleIsPortable(set.rule) ? ' (Its rules depend on your own progress or randomness, so the puzzle list is shared instead.)' : ''}`;
  const root = setView(`
    ${outlineButton('Exit', 'leave-fullscreen-button', 'exit')}
    <div class="home builder">
      <header><h1 class="title">SHARE</h1></header>
      <div class="panel">
        <h3 class="share-name">${esc(set.name)}</h3>
        <p>${set.ids.length.toLocaleString()} puzzles. ${how}</p>
      </div>
      <div class="panel">
        <h4>Link</h4>
        <textarea id="share-link" class="share-link" readonly rows="${Math.min(6, Math.ceil(link.length / 90))}">${esc(link)}</textarea>
        <div class="row">
          ${solidButton({ label: 'Copy link', color: '#54A165', id: 'copy-link' })}
          <span class="${fits ? '' : 'warn-text'}">${link.length.toLocaleString()} characters${fits ? ' · fits in a Discord message' : ' · too long for a Discord message (2,000 max): send the file instead'}</span>
        </div>
      </div>
      <div class="panel">
        <h4>File</h4>
        <p>Works for any set, however big. The recipient opens <b>+ New set → Import a set file</b>.</p>
        <div class="row">${solidButton({ label: 'Download set file', color: '#2F3033', id: 'dl-file' })}</div>
      </div>
    </div>`, 'scroll');
  const ta = root.querySelector('#share-link');
  ta.onclick = () => ta.select();
  root.querySelector('#copy-link').onclick = () => navigator.clipboard?.writeText(link).then(() => toast('Link copied'), () => { ta.select(); toast('Press Cmd+C to copy'); });
  root.querySelector('#dl-file').onclick = () => downloadText(setFile(set), `${fileSafe(set.name)}.puzzle-set.json`);
  root.querySelector('#exit').onclick = () => go('#/');
  onKey((e) => { if (e.key === 'Escape') go('#/'); });
}

// Preview of a set arriving by link or file, with "Add to library"
function receiveView(data, parse, source = 'link') {
  let shared, error = null;
  try { shared = parse(); } catch (e) { error = e.message || 'Could not read this set'; }
  const puzzles = shared ? shared.ids.map((id) => data.byId.get(id)).filter(Boolean) : [];
  const sum = summarize(puzzles);
  const rates = puzzles.filter((p) => p.successRate !== undefined).map((p) => p.successRate);
  const pc = (x) => `${Math.round(x * 100)}%`;
  const byRating = [1, 2, 3, 4, 5, 6].map((r) => [r, puzzles.filter((p) => p.rating === r).length]).filter(([, n]) => n);
  const root = setView(`
    ${outlineButton('Exit', 'leave-fullscreen-button', 'exit')}
    <div class="home builder">
      <header><h1 class="title">SHARED SET</h1></header>
      ${error ? `<div class="panel"><p class="warn-text"><b>${esc(error)}.</b> ${source === 'file' ? 'Check that this is a set file downloaded from a Share page.' : 'The link may have been cut off when it was copied.'}</p></div>` : `
      <div class="panel preview">
        <h3 class="share-name">${esc(shared.name)}</h3>
        <p class="big-count"><b>${puzzles.length.toLocaleString()}</b> puzzles${byRating.length ? ` · ${byRating.map(([r, n]) => `${n.toLocaleString()} × ${r}★`).join(', ')}` : ''}</p>
        ${shared.rule ? `<p>Rules: ${esc(describeRule(shared.rule, PUZZLE_THEME_TEXT))}</p>` : ''}
        ${rates.length ? `<p>Solved by ${pc(Math.min(...rates))}–${pc(Math.max(...rates))} of players on nestris.org.</p>` : ''}
        <p>You've already seen ${sum.seen.toLocaleString()} of these and mastered ${sum.mastered.toLocaleString()}; that progress carries over.</p>
        ${shared.unknown ? `<p class="warn-text">${shared.unknown.toLocaleString()} puzzle(s) in this set aren't in the site's puzzle data and will be left out.</p>` : ''}
      </div>
      <div class="row builder-buttons">
        ${solidButton({ label: 'Add & start learning', icon: 'assets/img/button-icons/new-puzzle.svg', color: '#54A165', id: 'add-start' })}
        ${solidButton({ label: 'Just add to library', color: '#2F3033', id: 'add-shared' })}
        ${solidButton({ label: 'Cancel', color: '#2F3033', id: 'cancel' })}
      </div>`}
    </div>`, 'scroll');
  root.querySelector('#exit').onclick = () => go('#/');
  root.querySelector('#cancel')?.addEventListener('click', () => go('#/'));
  const addShared = (start) => {
    const set = saveSet({ name: uniqueName(shared.name), ids: puzzles.map((p) => p.id), ...(shared.rule ? { rule: shared.rule } : {}) });
    setSettings({ setKey: customKey(set.id) });
    toast(`Added "${set.name}" to your library`);
    go(start && puzzles.length ? `#/play/learn/${customKey(set.id)}` : '#/');
  };
  root.querySelector('#add-start')?.addEventListener('click', () => addShared(true));
  root.querySelector('#add-shared')?.addEventListener('click', () => addShared(false));
  onKey((e) => { if (e.key === 'Escape') go('#/'); });
}

// Global success rate for tiles; puzzles with very few attempts say so instead of showing a noisy %
const globalLabel = (p) => !p.attempts ? 'never tried on nestris' : p.attempts < 5 ? `${p.solves}/${p.attempts} solved globally` : `${Math.round(p.successRate * 100)}% global`;

// ---------- keybinds ----------
const KEY_NAMES = {
  ' ': 'Space', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', shift: 'Shift', control: 'Ctrl',
  alt: 'Alt', meta: 'Cmd', capslock: 'Caps Lock', tab: 'Tab', backspace: 'Backspace', enter: 'Enter',
};
function keyName(k) {
  const l = String(k ?? '').toLowerCase();
  return KEY_NAMES[l] ?? (l.length === 1 ? l.toUpperCase() : l.charAt(0).toUpperCase() + l.slice(1));
}
const BIND_LABELS = { rotLeft: 'Rotate left', rotRight: 'Rotate right', undo: 'Undo' };

// Click a key button, then press any key to bind it. Esc or clicking elsewhere cancels.
let activeCapture = null;
function captureKey(btn, done) {
  activeCapture?.();
  const setting = btn.dataset.setting;
  const old = btn.textContent;
  btn.textContent = 'Press a key…';
  btn.classList.add('listening');
  const finish = () => {
    window.removeEventListener('keydown', onDown, true);
    window.removeEventListener('pointerdown', onAway, true);
    btn.classList.remove('listening');
    activeCapture = null;
  };
  const cancel = () => { finish(); btn.textContent = old; };
  const onAway = (e) => { if (e.target !== btn) cancel(); };
  const onDown = (e) => {
    e.preventDefault(); e.stopPropagation();
    const key = e.key.toLowerCase();
    if (key === 'escape') return cancel();
    if (!key || key === 'dead' || key === 'unidentified') return; // keep listening
    const s = getSettings();
    const clash = Object.keys(BIND_LABELS).find((k) => k !== setting && String(s[k]).toLowerCase() === key);
    if (clash) { toast(`${keyName(key)} is already used for ${BIND_LABELS[clash]}`); return cancel(); }
    finish();
    setSettings({ [setting]: key });
    toast(`${BIND_LABELS[setting]}: ${keyName(key)}`);
    done();
  };
  window.addEventListener('keydown', onDown, true);
  window.addEventListener('pointerdown', onAway, true);
  activeCapture = cancel;
}

// =====================================================================================
// PLAY
// =====================================================================================
function playView(data, mode, key, opts = {}) {
  const set = resolveSet(data, key);
  if (!MODES[mode] || !set?.puzzles.length) return go('#/');
  const session = createSession(mode, set.rating, set.puzzles, { pick: getSettings().runPick || 'unmastered', ...opts });
  session.set = set;
  setSettings({ lastMode: mode });
  runSession(data, session);
}

function puzzleView(data, id) {
  const p = data.byId.get(id);
  if (!p) {
    const root = setView(`<div class="content" style="justify-content:center;gap:16px">
      ${outlineButton('Exit', 'leave-fullscreen-button', 'exit')}
      <div class="end-card"><h1>Puzzle not found</h1><p class="engine-note" style="font-size:13px">This puzzle isn't in the data loaded in this browser.</p>${solidButton({ label: 'Home', color: '#3C5EB7', stretch: true, id: 'home' })}</div></div>`);
    root.querySelector('#exit').onclick = root.querySelector('#home').onclick = () => go('#/');
    return;
  }
  const exitTo = singleReturn || '#/browse/' + (browseState.key || ratingKey(p.rating));
  singleReturn = null;
  runSession(data, createSession('single', p.rating, null, { puzzle: p }), { exitTo });
}

function runSession(data, session, { exitTo = '#/' } = {}) {
  const s = getSettings();
  const timed = s.timed && session.mode !== 'single';
  let state; // { phase, p, dec, isRetry, start, submission, idx, comment, recRes }
  let timerInterval = null;
  let puzzleBoard = null;

  const next = () => {
    const p = session.next();
    if (!p) return summary();
    state = { phase: 'solving', p, dec: decode(p), isRetry: false, start: performance.now() };
    render();
  };

  const submit = (sub) => {
    if (state.phase !== 'solving') return;
    clearInterval(timerInterval);
    const ms = performance.now() - state.start;
    const idx = matchSubmission(state.dec.moves, sub?.first, sub?.second);
    const correct = idx === 0;
    if (!state.isRetry) {
      state.recRes = record(state.p.id, correct, ms, correct ? undefined : idx);
      session.result(state.p, correct);
      (session.log ||= []).push({
        id: state.p.id, correct, idx,
        you: sub?.first && sub?.second ? `${sub.first.getTetrisNotation()} · ${sub.second.getTetrisNotation()}` : null,
      });
    }
    play(correct ? 'notes-up-high' : 'incorrect');
    Object.assign(state, {
      phase: 'solution', submission: sub, idx, ms,
      comment: correct ? pick(RIGHT_ANSWER_COMMENTS) : pick(WRONG_ANSWER_COMMENTS),
    });
    render();
  };

  const retry = () => { state = { ...state, phase: 'solving', isRetry: true, start: performance.now(), submission: undefined, idx: undefined }; render(); };

  const exit = () => { clearInterval(timerInterval); go(exitTo); };

  function render() {
    puzzleBoard?.destroy(); puzzleBoard = null;
    clearInterval(timerInterval);
    const { p, dec, phase } = state;
    const solved = phase === 'solution';
    const cls = solved ? (state.idx === 0 ? 'correct' : 'incorrect') : '';
    const rec = getRec(p.id);
    const lines = session.progressLines();

    const header = phase === 'solving'
      ? `<h1>${state.isRetry ? 'Retry Puzzle' : esc(session.title)}</h1>`
      : `<img class="puzzle-header-icon" src="assets/img/display-icons/${state.idx === 0 ? 'correct' : 'incorrect'}.svg"><h1>${state.idx === 0 ? 'Correct' : 'Incorrect'}</h1>`;

    const successRate = p.attempts ? p.solves / p.attempts : null;
    const statsHTML = `
      <div class="puzzle-stats">
        <div class="stat"><h1>Puzzle Rating</h1>${stars(p.rating, 75)}</div>
        ${p.hardRank ? `<div class="stat"><h1>Hardness rank</h1><p>#${p.hardRank.toLocaleString()} of ${(data.rankedByRating.get(p.rating)?.length ?? 0).toLocaleString()}</p></div>` : ''}
        ${successRate !== null ? `<div class="stat"><h1>Success Rate</h1><p>${(successRate * 100).toFixed(0)}%</p></div>` : ''}
        ${p.attempts ? `<div class="stat"><h1>Attempts</h1><p>${p.attempts.toLocaleString()}</p></div>` : ''}
        ${p.theme ? `<div class="stat"><h1>Theme</h1><p>${esc(PUZZLE_THEME_TEXT[p.theme] ?? p.theme)}</p></div>` : ''}
        <hr>
        <div class="stat"><h1>Your record</h1><p>${rec ? `${rec.c} / ${rec.n}` : '–'}</p></div>
        ${rec?.bt ? `<div class="stat"><h1>Your best time</h1><p>${(rec.bt / 1000).toFixed(1)}s</p></div>` : ''}
        <div class="stat"><h1>Next review</h1><p>${!rec ? '–' : rec.b <= 1 ? 'this session' : `in ${fmtInterval(rec.d - Date.now())}${isMastered(rec) ? ' · mastered' : ''}`}</p></div>
      </div>`;

    const engineRows = dec.moves.map((m, i) => `
      <div class="row-container">
        <div class="guesses"><p>${(m.guesses ?? 0).toLocaleString()}</p></div><div></div>
        <div class="engine-move table-rows${i === 0 ? ' first-move' : ''}${i === state.idx ? ' player-move' : ''}" data-move="${i}">
          <p><b>#${i + 1}</b></p>
          <p>${m.score === null || m.score === undefined ? '–' : m.score > 0 ? '+' + m.score : m.score}</p>
          <p>${esc(m.first.getTetrisNotation())}</p>
          <p>${esc(m.second.getTetrisNotation())}</p>
        </div>
      </div>`).join('');

    const yourMoveRow = solved && state.idx === -1 && state.submission?.first && state.submission?.second ? `
      <div class="row-container">
        <div class="guesses"><p></p></div><div></div>
        <div class="engine-move table-rows player-move" data-move="you">
          <p><b>You</b></p><p>–</p>
          <p>${esc(state.submission.first.getTetrisNotation())}</p>
          <p>${esc(state.submission.second.getTetrisNotation())}</p>
        </div>
      </div>` : '';

    const last = session.remaining() === 0;
    const root = setView(`
      ${outlineButton('Exit', 'leave-fullscreen-button', 'exit')}
      <div class="content">
        <header><h1 class="title">PUZZLES</h1></header>
        <p class="instructions">${phase === 'solving' ? "Find the best place to put the given two pieces. There's only one right answer!" : esc(state.comment)}</p>
        <div class="main-row">
          <span style="visibility:hidden" id="undo-wrap">${outlineButton('Undo', 'undo-button', 'undo')}</span>
          <div class="board" id="board"></div>
          <div class="puzzle-details">
            <div class="puzzle-details-top">
              <div class="puzzle-header-container">
                <div class="puzzle-header">${header}</div>
                ${lines.length ? `<div class="session-strip">${lines.map(([k, v]) => `<div class="item"><span class="v">${esc(v)}</span><span class="k">${esc(k)}</span></div>`).join('')}</div>` : ''}
              </div>
              ${phase === 'solving' ? `
                <div class="next-box-container" id="next-box">${pieceSVG(dec.next, s.level, 3)}</div>
                <p class="instructions narrow">Hover your mouse on the board to move the piece! Rotate with ${esc(keyName(s.rotLeft))} and ${esc(keyName(s.rotRight))}.</p>
                <div class="touch-controls">${solidButton({ label: '⟲ Rotate', color: '#2F3033', id: 'rot-l' })}${solidButton({ label: 'Rotate ⟳', color: '#2F3033', id: 'rot-r' })}</div>
                <div class="view-solution-button">${solidButton({ label: 'View Solution', icon: 'assets/img/button-icons/eye.svg', color: '#B73C3C', id: 'view-solution', paddingVertical: 10 })}</div>
              ` : `
                <div class="padding-above-puzzle-stats"></div>
                ${statsHTML}
                <div class="engine-div">
                  <h2 class="prevent-select">Engine Evaluation</h2>
                  <div class="engine-container">
                    <div class="row-container"><div class="labels"><p>Guesses</p></div><div></div>
                      <div class="labels table-rows"><p>Rank</p><p>Score</p><p>Current</p><p>Next</p></div></div>
                    ${engineRows}${yourMoveRow}
                  </div>
                </div>
              `}
            </div>
            <div class="puzzle-details-bottom">
              ${solved ? `
                <select id="add-to-set" class="dark-select add-to-set"></select>
                <div class="two-button-container">
                  ${solidButton({ label: 'Share', icon: 'assets/img/button-icons/link.svg', color: '#2F3033', stretch: true, id: 'share' })}
                  ${solidButton({ label: 'Retry', icon: 'assets/img/button-icons/retry.svg', color: '#2F3033', stretch: true, id: 'retry' })}
                </div>
                ${last ? solidButton({ label: session.mode === 'single' ? 'Done' : 'Finish', color: '#3C5EB7', stretch: true, id: 'next' })
                       : solidButton({ label: 'Next Puzzle', icon: 'assets/img/button-icons/new-puzzle.svg', color: '#54A165', stretch: true, id: 'next' })}
              ` : ''}
            </div>
          </div>
          <span style="visibility:hidden">${outlineButton('Undo', 'undo-button')}</span>
        </div>
        <div class="timer" style="visibility:${phase === 'solving' && timed ? 'visible' : 'hidden'}">
          <div class="border" id="timer-border"><div class="fill" id="timer-fill" style="width:0%"></div><p class="label" id="timer-label">${PUZZLE_TIME_LIMIT}</p></div>
        </div>
      </div>`, `play ${cls}`);

    root.querySelector('#exit').onclick = exit;
    const boardEl = root.querySelector('#board');

    if (phase === 'solving') {
      const undoWrap = root.querySelector('#undo-wrap');
      const nextBox = root.querySelector('#next-box');
      puzzleBoard = new PuzzleBoard(boardEl, {
        puzzle: dec, level: s.level, scale: 3.3,
        keys: { rotLeft: s.rotLeft, rotRight: s.rotRight, undo: s.undo },
        onSubmit: submit,
        onCanUndo: (can) => {
          undoWrap.style.visibility = can ? 'visible' : 'hidden';
          nextBox.innerHTML = can ? '' : pieceSVG(dec.next, s.level, 3);
        },
      });
      root.querySelector('#undo').onclick = () => puzzleBoard.undo();
      root.querySelector('#view-solution').onclick = () => submit(undefined);
      root.querySelector('#rot-l').onclick = () => puzzleBoard.rotate(3);
      root.querySelector('#rot-r').onclick = () => puzzleBoard.rotate(1);
      onKey((e) => { if (e.key === 'Escape') exit(); });

      if (timed) {
        const fill = root.querySelector('#timer-fill'), label = root.querySelector('#timer-label'), border = root.querySelector('#timer-border');
        const t0 = state.start;
        timerInterval = setInterval(() => {
          const t = (performance.now() - t0) / 1000;
          fill.style.width = Math.min(100, (t / PUZZLE_TIME_LIMIT) * 100) + '%';
          label.textContent = Math.max(0, PUZZLE_TIME_LIMIT - t).toFixed(0);
          border.classList.toggle('red', PUZZLE_TIME_LIMIT - t < 10.5);
          if (t >= PUZZLE_TIME_LIMIT) submit(puzzleBoard?.first ? { first: puzzleBoard.first, second: undefined } : undefined);
        }, 20);
        cleanups.push(() => clearInterval(timerInterval));
      }
      cleanups.push(() => { puzzleBoard?.destroy(); puzzleBoard = null; });
    } else {
      // Solution board, as on nestris.org: the player's move (or a hovered engine move) in color on the dimmed board
      const view = new NesBoard(boardEl, { scale: 3.3 });
      const sub = state.submission;
      const show = (move) => {
        const first = move ? move.first : sub?.first;
        const second = move ? move.second : sub?.second;
        view.update({
          board: dec.board, level: s.level,
          activePiece: first, nextPiece: second, activePieceOpacity: 1, nextPieceOpacity: 1, defaultOpacity: 0.6,
          enginePieces: [],
          gold: p.rating === 6,
        });
      };
      show(undefined);
      root.querySelectorAll('.engine-move[data-move]').forEach((row) => {
        row.onmouseenter = () => show(row.dataset.move === 'you' ? undefined : dec.moves[Number(row.dataset.move)]);
        row.onmouseleave = () => show(undefined);
      });
      root.querySelector('#retry').onclick = retry;
      const ats = root.querySelector('#add-to-set');
      const fillSets = () => {
        const cs = listSets();
        ats.innerHTML = `<option value="">＋ Add this puzzle to a set…</option>` +
          cs.map((c) => `<option value="${esc(c.id)}">${c.ids.includes(p.id) ? '✓ ' : ''}${esc(c.name)}</option>`).join('') +
          `<option value="__new">New set…</option>`;
      };
      fillSets();
      ats.onchange = () => {
        let id = ats.value;
        if (id === '__new') {
          const name = (prompt('Name for the new set:', 'Tricky ones') || '').trim();
          if (!name) { fillSets(); return; }
          id = saveSet({ name, ids: [] }).id;
        }
        if (id) { const added = togglePuzzle(id, p.id); toast(`${added ? 'Added to' : 'Removed from'} "${getCustomSet(id).name}"`); }
        fillSets();
      };
      root.querySelector('#share').onclick = () => {
        const url = `${location.origin}${location.pathname}#/puzzle/${encodeURIComponent(p.id)}`;
        navigator.clipboard?.writeText(url).then(() => toast('Puzzle link copied to clipboard!'), () => toast(url));
      };
      root.querySelector('#next').onclick = () => (session.mode === 'single' && last ? exit() : next());
      onKey((e) => {
        const k = e.key.toLowerCase();
        if (k === 'enter' || k === ' ' || k === 'n') { e.preventDefault(); root.querySelector('#next').click(); }
        else if (k === 'r') retry();
        else if (k === 'escape') exit();
      });
    }
  }

  function summary() {
    clearInterval(timerInterval);
    if (session.mode === 'single') return go(exitTo);
    renderSummary(data, session);
  }

  next();
}

// =====================================================================================
// BROWSE
// =====================================================================================
const PAGE = 48;
let browseState = { filter: 'all', sort: 'global', page: 0, q: '' };

function browseView(data, key) {
  const set = resolveSet(data, key);
  if (!set) return go('#/');
  browseState.key = set.key;
  const all = set.puzzles;
  const mixed = new Set(all.map((p) => p.rating)).size > 1;
  const customs = listSets();
  if (browseState.collect && !customs.some((c) => c.id === browseState.collect)) browseState.collect = null;
  const target = browseState.collect ? getCustomSet(browseState.collect) : null;
  const inTarget = new Set(target?.ids || []);
  const now = Date.now();
  // mastered: reached the 7-day stage · progress: answered correctly, not mastered yet
  // learning: missed last time · new: never seen
  const statusOf = (r) => (!r ? 'new' : r.b <= 1 ? 'learning' : r.b >= MASTERED_BOX ? 'mastered' : 'progress');
  const withRec = all.map((p) => ({ p, r: getRec(p.id) }));
  const tests = {
    all: () => true,
    mastered: (x) => statusOf(x.r) === 'mastered',
    progress: (x) => statusOf(x.r) === 'progress',
    learning: (x) => statusOf(x.r) === 'learning',
    new: (x) => !x.r,
    due: (x) => x.r && x.r.b >= 2 && x.r.d <= now,
    missed: (x) => x.r && x.r.c < x.r.n,
  };
  const counts = Object.fromEntries(Object.entries(tests).map(([k, t]) => [k, withRec.filter(t).length]));
  if (browseState.filter === 'unseen') browseState.filter = 'new';
  const f = tests[browseState.filter] ? browseState.filter : 'all';
  let list = withRec.filter(tests[f]);
  if (browseState.q) {
    const q = browseState.q.toLowerCase();
    list = list.filter((x) => x.p.id.includes(browseState.q) || (x.p.theme || '').toLowerCase().includes(q) || (PUZZLE_THEME_TEXT[x.p.theme] || '').toLowerCase().includes(q));
  }
  const acc = (r) => (r && r.n ? r.c / r.n : 2);
  const sorters = {
    id: (a, b) => a.p.id.localeCompare(b.p.id),
    accuracy: (a, b) => acc(a.r) - acc(b.r),
    recent: (a, b) => (b.r?.l || 0) - (a.r?.l || 0),
    global: (a, b) => (a.p.successRate ?? 2) - (b.p.successRate ?? 2),
    easiest: (a, b) => (b.p.successRate ?? -1) - (a.p.successRate ?? -1),
  };
  list.sort(sorters[browseState.sort] || sorters.id);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  browseState.page = Math.min(browseState.page, pages - 1);
  const slice = list.slice(browseState.page * PAGE, (browseState.page + 1) * PAGE);

  const root = setView(`
    ${outlineButton('Exit', 'leave-fullscreen-button', 'exit')}
    <div class="browse">
      <header><h1 class="title">BROWSE</h1></header>
      <div class="controls">
        <select id="b-set">${libraryKeys(data).map((k) => { const x = resolveSet(data, k); return x ? `<option value="${esc(k)}"${k === set.key ? ' selected' : ''}>${esc(x.kind === 'rating' ? `${x.rating}★ (default)` : x.name)} (${x.puzzles.length.toLocaleString()})</option>` : ''; }).join('')}</select>
        <select id="b-filter">${[['all', 'All'], ['mastered', 'Mastered'], ['progress', 'In progress'], ['learning', 'Learning (missed last time)'], ['new', 'New (never seen)'], ['due', 'Due for review'], ['missed', 'Ever missed']].map(([v, l]) => `<option value="${v}"${v === f ? ' selected' : ''}>${l} (${counts[v].toLocaleString()})</option>`).join('')}</select>
        <select id="b-sort">${[['global', 'Sort: hardest first'], ['easiest', 'Sort: easiest first'], ['accuracy', 'Sort: your worst first'], ['recent', 'Sort: recently played'], ['id', 'Sort: puzzle ID']].map(([v, l]) => `<option value="${v}"${v === browseState.sort ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input id="b-q" placeholder="Search ID or theme" value="${esc(browseState.q)}" size="16">
        <span>${list.length.toLocaleString()} puzzles</span>
      </div>
      <div class="controls collect">
        <label>Collect into <select id="b-collect"><option value="">— off —</option>${customs.map((c) => `<option value="${esc(c.id)}"${c.id === browseState.collect ? ' selected' : ''}>${esc(c.name)} (${c.ids.length.toLocaleString()})</option>`).join('')}<option value="__new">+ New empty set…</option></select></label>
        ${target ? `<span>Click <b>+</b> on a puzzle to add it to "${esc(target.name)}", <b>✓</b> to remove it.${list.length ? ` ${solidButton({ label: `Add all ${list.length.toLocaleString()} shown`, color: '#2F3033', id: 'b-addall' })}` : ''}</span>` : '<span class="muted">Pick a custom set to handpick puzzles into it.</span>'}
      </div>
      <div class="legend">${[['mastered', 'Mastered', 'reached the 7-day review stage'], ['progress', 'In progress', 'answered correctly, not mastered yet'], ['learning', 'Learning', 'missed last time'], ['new', 'New', 'never seen']].map(([k, label, tip]) => `<button class="legend-item${f === k ? ' active' : ''}" data-filter="${k}" title="${tip}"><span class="st-badge st-${k}">${label}</span><b>${counts[k].toLocaleString()}</b></button>`).join('')}
        ${f !== 'all' ? '<button class="legend-item" data-filter="all">Show all</button>' : ''}</div>
      <div class="grid" id="grid"></div>
      <div class="pager">
        ${solidButton({ label: '‹ Prev', color: '#2F3033', id: 'prev', disabled: browseState.page === 0 })}
        <span>Page ${browseState.page + 1} / ${pages}</span>
        ${solidButton({ label: 'Next ›', color: '#2F3033', id: 'nextp', disabled: browseState.page >= pages - 1 })}
      </div>
    </div>`, 'scroll');

  const grid = root.querySelector('#grid');
  const s = getSettings();
  for (const { p, r } of slice) {
    const d = decode(p);
    const tile = document.createElement('a');
    tile.href = `#/puzzle/${encodeURIComponent(p.id)}`;
    const st = statusOf(r);
    const label = { mastered: 'Mastered', progress: 'In progress', learning: 'Learning', new: 'New' }[st];
    const review = !r ? '' : r.b <= 1 ? 'retry now' : r.d <= now ? 'review due' : `review in ${fmtInterval(r.d - now)}`;
    tile.className = `tile st-${st}`;
    tile.innerHTML = `${target ? `<button class="collect-btn${inTarget.has(p.id) ? ' in' : ''}" title="${inTarget.has(p.id) ? 'Remove from' : 'Add to'} ${esc(target.name)}">${inTarget.has(p.id) ? '✓' : '+'}</button>` : ''}<div class="b"></div>
      <div class="pieces">${pieceSVG(d.current, s.level, 1.3)}${pieceSVG(d.next, s.level, 1.3)}</div>
      <div class="meta"><span class="st-badge st-${st}">${label}</span><span title="Hardness rank within ${p.rating}★">${mixed ? `${p.rating}★ ` : ''}${p.hardRank ? `#${p.hardRank.toLocaleString()}` : ''}</span></div>
      <div class="meta"><span>${r ? `you ${r.c}/${r.n}` : ''}${review ? ` · ${review}` : ''}</span><span>${globalLabel(p)}</span></div>`;
    new NesBoard(tile.querySelector('.b'), { scale: 1.3 }).update({ board: d.board, level: s.level });
    tile.querySelector('.collect-btn')?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const added = togglePuzzle(target.id, p.id);
      e.currentTarget.classList.toggle('in', added);
      e.currentTarget.textContent = added ? '✓' : '+';
      toast(`${added ? 'Added to' : 'Removed from'} "${target.name}"`);
      if (set.key === customKey(target.id) && !added) rerender();
    });
    grid.appendChild(tile);
  }

  root.querySelector('#exit').onclick = () => go('#/');
  const rerender = () => browseView(data, set.key);
  root.querySelector('#b-set').onchange = (e) => { browseState.page = 0; go(`#/browse/${e.target.value}`); };
  root.querySelector('#b-collect').onchange = (e) => {
    if (e.target.value === '__new') {
      const name = (prompt('Name for the new set:', 'My set') || '').trim();
      if (!name) { e.target.value = browseState.collect || ''; return; }
      browseState.collect = saveSet({ name, ids: [] }).id;
      toast(`Created "${name}"`);
    } else browseState.collect = e.target.value || null;
    rerender();
  };
  root.querySelector('#b-addall')?.addEventListener('click', () => {
    const fresh = list.map((x) => x.p.id).filter((id) => !inTarget.has(id));
    if (!fresh.length) return toast('All shown puzzles are already in the set');
    if (!confirm(`Add ${fresh.length.toLocaleString()} puzzle(s) to "${target.name}"?`)) return;
    saveSet({ ...target, ids: [...target.ids, ...fresh] });
    toast(`Added ${fresh.length.toLocaleString()} puzzles`); rerender();
  });
  root.querySelectorAll('.legend-item[data-filter]').forEach((b) => (b.onclick = () => { browseState.filter = b.dataset.filter; browseState.page = 0; rerender(); }));
  root.querySelector('#b-filter').onchange = (e) => { browseState.filter = e.target.value; browseState.page = 0; rerender(); };
  root.querySelector('#b-sort').onchange = (e) => { browseState.sort = e.target.value; browseState.page = 0; rerender(); };
  let qTimer;
  root.querySelector('#b-q').oninput = (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { browseState.q = e.target.value.trim(); browseState.page = 0; rerender(); const q = document.querySelector('#b-q'); q?.focus(); q?.setSelectionRange(q.value.length, q.value.length); }, 250); };
  root.querySelector('#prev').onclick = () => { if (browseState.page > 0) { browseState.page--; rerender(); } };
  root.querySelector('#nextp').onclick = () => { if (browseState.page < pages - 1) { browseState.page++; rerender(); } };
  onKey((e) => { if (e.key === 'Escape') go('#/'); });
}

route();

// =====================================================================================
// SHARED PAGE PIECES
// =====================================================================================
const topNav = (active = '') => `<nav class="topnav">
  <a class="navlink${active === 'stats' ? ' active' : ''}" href="#/stats">Progress</a>
  <a class="navlink${active === 'settings' ? ' active' : ''}" href="#/settings">Settings</a>
</nav>`;

// Remember how much of each library set is mastered today, for "mastered over time"
function snapshotLibrary(data) {
  snapshotSets(libraryKeys(data).map((key) => {
    const set = resolveSet(data, key);
    if (!set) return null;
    const sm = summarize(set.puzzles);
    return { key, mastered: sm.mastered, seen: sm.seen, total: sm.total };
  }).filter(Boolean));
}

const fmtMinutes = (ms) => {
  const m = Math.round((ms || 0) / 60000);
  if (!m && ms > 0) return 'under 1 min';
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

// =====================================================================================
// SETTINGS
// =====================================================================================
function settingsView(data) {
  const s = getSettings();
  const sel = currentSet(data);
  const root = setView(`
    ${outlineButton('Exit', 'leave-fullscreen-button', 'exit')}
    ${topNav('settings')}
    <div class="home builder">
      <header><h1 class="title">SETTINGS</h1></header>
      <div class="panel">
        <h4>Controls</h4>
        <div class="row">
          <label>Rotate left <button class="keybind" data-setting="rotLeft">${esc(keyName(s.rotLeft))}</button></label>
          <label>Rotate right <button class="keybind" data-setting="rotRight">${esc(keyName(s.rotRight))}</button></label>
          <label>Undo <button class="keybind" data-setting="undo">${esc(keyName(s.undo))}</button></label>
        </div>
        <p>Click a key button, then press the key you want. Hover to move the piece and click to place it, as on nestris.org. After a puzzle: Enter/Space next, R retry, Esc exit.</p>
      </div>
      <div class="panel">
        <h4>Drilling</h4>
        <div class="row">
          <label><input type="checkbox" id="set-timed" ${s.timed ? 'checked' : ''}> 30-second timer</label>
          <label><input type="checkbox" id="set-sound" ${s.sound ? 'checked' : ''}> Sound</label>
        </div>
        <div class="row">
          <label>New puzzles per Learn session <input type="number" min="0" max="500" id="set-new" value="${s.newPerSession}"></label>
          <label>New Learn puzzles come
            <select id="set-neworder" class="dark-select">
              <option value="hardest">hardest first</option><option value="easiest">easiest first</option><option value="random">in random order</option>
            </select></label>
        </div>
        <div class="row">
          <label>Perfect Run size <input type="number" min="5" max="2000" id="set-run" value="${s.runSize}"></label>
          <label>Perfect Run picks from
            <select id="set-runpick" class="dark-select">
              <option value="unmastered">not yet mastered</option><option value="random">the whole set</option><option value="seen">puzzles you have seen</option>
            </select></label>
        </div>
        <p>Spaced repetition: a correct answer on a puzzle that's due schedules its next review in 1, 3, 7, 16, then 35 days. A miss sends it back to the start. A puzzle counts as <b>mastered</b> once it reaches the 7-day stage. Progress belongs to the puzzle, so it shows in every set that contains it.</p>
      </div>
      <div class="panel">
        <h4>Backup</h4>
        <div class="row">
          ${solidButton({ label: 'Export progress', color: '#2F3033', id: 'exp-prog' })}
          <label class="solid-button" style="cursor:pointer"><span class="button" style="background-color:#2F3033"><span class="label">Import progress</span></span><input type="file" id="imp-prog" accept=".json,application/json" hidden></label>
          <span id="backup-status" class="backup-status"></span>
        </div>
        <p>Your progress is saved in this browser. Export saves a backup file of your progress, sets and settings; Import merges one back in (for each puzzle, the more recently played copy wins).</p>
      </div>
      ${sel ? `<div class="panel">
        <h4>Reset</h4>
        <div class="row">${solidButton({ label: `Reset progress in "${sel.name}"`, color: '#B73C3C', id: 'reset-r' })}</div>
        <p>Erases your record on every puzzle in the selected set, everywhere those puzzles appear.</p>
      </div>` : ''}
    </div>`, 'scroll');

  root.querySelector('#exit').onclick = () => go('#/');
  root.querySelector('#set-runpick').value = s.runPick || 'unmastered';
  root.querySelector('#set-neworder').value = s.newOrder || 'hardest';
  const bind = (id, key, conv = (v) => v, ev = 'change') => {
    const el = root.querySelector(id);
    el.addEventListener(ev, () => { setSettings({ [key]: conv(el.type === 'checkbox' ? el.checked : el.value) }); });
  };
  bind('#set-timed', 'timed');
  bind('#set-sound', 'sound');
  bind('#set-new', 'newPerSession', (v) => Math.max(0, Math.min(500, Number(v) || 0)));
  bind('#set-run', 'runSize', (v) => Math.max(5, Math.min(2000, Number(v) || 50)));
  bind('#set-runpick', 'runPick');
  bind('#set-neworder', 'newOrder');
  root.querySelectorAll('.keybind').forEach((btn) => (btn.onclick = () => captureKey(btn, () => settingsView(data))));

  const bs = root.querySelector('#backup-status');
  const lb = lastBackup();
  const days = lb ? Math.floor((Date.now() - lb) / 86400000) : null;
  bs.textContent = `Last backup: ${lb === null ? 'never' : days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`;
  bs.classList.toggle('warn', progressCount() >= 20 && (lb === null || days >= 14));

  root.querySelector('#exp-prog').addEventListener('click', () => {
    downloadText(exportProgress({ sets: listSets() }), `puzzle-drill-progress-${dayKey()}.json`);
    setTimeout(() => settingsView(data), 300);
  });
  root.querySelector('#imp-prog').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { total, updated, json } = importProgress(await file.text());
      const setsAdded = importSets(json.sets);
      toast(`Imported: ${updated.toLocaleString()} of ${total.toLocaleString()} puzzles updated${setsAdded ? `, ${setsAdded} set(s)` : ''}`);
      settingsView(data);
    } catch (err) {
      toast('Import failed: ' + (err instanceof SyntaxError ? 'not a valid JSON file' : err.message));
    }
  });
  root.querySelector('#reset-r')?.addEventListener('click', () => {
    if (!confirm(`Erase your progress on all ${sel.puzzles.length.toLocaleString()} puzzles in "${sel.name}"? This also clears it everywhere else those puzzles appear, and cannot be undone.`)) return;
    resetProgress(sel.puzzles.map((p) => p.id)); toast('Progress reset'); settingsView(data);
  });
  onKey((e) => { if (e.key === 'Escape') go('#/'); });
}

// =====================================================================================
// SESSION SUMMARY (with a review of the misses)
// =====================================================================================
let lastSummary = null;  // the most recent finished session, so "#/summary" can come back to it
let singleReturn = null; // where a single puzzle goes when it's done

function renderSummary(data, session) {
  lastSummary = session;
  const perfect = session.done > 0 && session.misses.length === 0;
  const pct = session.done ? Math.round((session.correct / session.done) * 100) : 0;
  const misses = [...session.misses];
  const missLog = misses.map((id) => (session.log || []).find((e) => e.id === id && !e.correct)).filter(Boolean);
  const root = setView(`
    ${outlineButton('Exit', 'leave-fullscreen-button', 'exit')}
    <div class="content summary-page">
      <div class="end-card">
        ${session.set?.kind === 'custom' ? `<p class="set-title">${esc(session.set.name)}</p>` : stars(session.rating, 90)}
        <h1>${session.mode === 'run' ? (perfect ? 'Perfect run!' : 'Run complete') : session.done ? 'Session complete' : 'Nothing to do here'}</h1>
        ${session.done ? `<p class="big">${session.correct}/${session.done}</p>
        <div class="summary-row">
          <div class="summary-chip"><span class="v">${pct}%</span><span class="k">first-try accuracy</span></div>
          <div class="summary-chip"><span class="v">${session.bestStreak}</span><span class="k">best streak</span></div>
          <div class="summary-chip"><span class="v">${misses.length}</span><span class="k">puzzles missed</span></div>
        </div>` : `<p class="engine-note" style="font-size:13px">${session.mode === 'mistakes' ? 'No mistakes to fix in this set.' : 'No puzzles are due right now. Raise "New puzzles per Learn session" in Settings or try a Perfect Run.'}</p>`}
        ${misses.length ? solidButton({ label: `Re-run ${misses.length} miss${misses.length === 1 ? '' : 'es'}`, color: '#B73C3C', stretch: true, id: 'rerun' }) : ''}
        ${session.mode !== 'single' ? solidButton({ label: session.mode === 'run' ? 'New run' : 'Again', icon: 'assets/img/button-icons/new-puzzle.svg', color: '#54A165', stretch: true, id: 'again' }) : ''}
        ${solidButton({ label: 'Home', color: '#3C5EB7', stretch: true, id: 'home' })}
      </div>
      ${missLog.length ? `<div class="review">
        <h2 class="section">Review your misses</h2>
        <p class="review-note">The correct answer is shown on each board. Click one to try it again.</p>
        <div class="grid" id="review-grid"></div>
      </div>` : ''}
    </div>`, perfect ? 'correct' : '');

  const grid = root.querySelector('#review-grid');
  const lvl = getSettings().level;
  for (const e of missLog) {
    const p = data.byId.get(e.id);
    if (!p) continue;
    const d = decode(p);
    const best = d.moves[0];
    const tile = document.createElement('a');
    tile.href = `#/puzzle/${encodeURIComponent(p.id)}`;
    tile.className = 'tile st-learning';
    tile.innerHTML = `<div class="b"></div>
      <div class="meta"><span>Best: <b>${esc(best.first.getTetrisNotation())} · ${esc(best.second.getTetrisNotation())}</b></span></div>
      <div class="meta"><span>${e.you ? `You: ${esc(e.you)}` : 'You viewed the solution'}</span><span>${globalLabel(p)}</span></div>`;
    tile.onclick = () => { singleReturn = '#/summary'; };
    new NesBoard(tile.querySelector('.b'), { scale: 1.3 }).update({
      board: d.board, level: lvl, activePiece: best.first, nextPiece: best.second, defaultOpacity: 0.55,
    });
    grid.appendChild(tile);
  }

  root.querySelector('#exit').onclick = root.querySelector('#home').onclick = () => go('#/');
  root.querySelector('#again')?.addEventListener('click', () => playView(data, session.mode, session.set?.key || ratingKey(session.rating)));
  root.querySelector('#rerun')?.addEventListener('click', () => {
    const pool = misses.map((id) => data.byId.get(id)).filter(Boolean);
    const s2 = createSession('run', session.rating, pool, { ids: misses });
    s2.isRerun = true;
    s2.set = session.set;
    runSession(data, s2);
  });
  onKey((e) => { if (e.key === 'Enter') root.querySelector('#rerun, #again, #home')?.click(); else if (e.key === 'Escape') go('#/'); });
}

// =====================================================================================
// PROGRESS (stats)
// =====================================================================================
function statsView(data) {
  snapshotLibrary(data);
  const daily = getDailyAll();
  const history = getHistory();
  const sel = currentSet(data);
  const keys = Object.keys(daily).sort();
  const tot = keys.reduce((a, k) => ({ n: a.n + daily[k].n, c: a.c + daily[k].c, f: a.f + (daily[k].f || 0), t: a.t + (daily[k].t || 0) }), { n: 0, c: 0, f: 0, t: 0 });
  const allSum = summarize([...data.byId.values()]);
  const streak = getDaily().streak;

  // last 30 local days
  const days = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const short = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const perDay = days.map((d) => ({ d, k: dayKey(d), v: daily[dayKey(d)] || { n: 0, c: 0 } }));

  const lib = libraryKeys(data).map((k) => resolveSet(data, k)).filter(Boolean);
  const setRows = lib.map((set) => {
    const sm = summarize(set.puzzles);
    return `<tr><td>${esc(set.kind === 'rating' ? `${set.rating}★ (default)` : set.name)}</td><td>${sm.total.toLocaleString()}</td><td>${sm.seen.toLocaleString()}</td>
      <td>${sm.mastered.toLocaleString()} <span class="muted">(${sm.total ? Math.round((sm.mastered / sm.total) * 1000) / 10 : 0}%)</span></td>
      <td>${sm.attempts ? Math.round((sm.correct / sm.attempts) * 100) + '%' : '–'}</td></tr>`;
  }).join('');

  const root = setView(`
    ${outlineButton('Exit', 'leave-fullscreen-button', 'exit')}
    ${topNav('stats')}
    <div class="home stats">
      <header><h1 class="title">PROGRESS</h1></header>
      <div class="summary-row">
        <div class="summary-chip"><span class="v">${tot.n.toLocaleString()}</span><span class="k">puzzles answered</span></div>
        <div class="summary-chip"><span class="v">${tot.n ? Math.round((tot.c / tot.n) * 100) + '%' : '–'}</span><span class="k">correct</span></div>
        <div class="summary-chip"><span class="v">${allSum.mastered.toLocaleString()}</span><span class="k">mastered</span></div>
        <div class="summary-chip"><span class="v">${allSum.seen.toLocaleString()}</span><span class="k">puzzles seen</span></div>
        <div class="summary-chip"><span class="v">${keys.length}</span><span class="k">days practiced</span></div>
        <div class="summary-chip"><span class="v">${streak}</span><span class="k">day streak</span></div>
        <div class="summary-chip"><span class="v">${bestStreak()}</span><span class="k">best streak</span></div>
        <div class="summary-chip"><span class="v">${fmtMinutes(tot.t)}</span><span class="k">time drilling</span></div>
      </div>

      <div class="panel chart-panel">
        <div class="chart-head"><h4>Puzzles per day</h4><span class="muted">last 30 days</span>
          <button class="linklike" id="toggle-table">Show as table</button></div>
        <div id="chart-days" class="chart"></div>
        <div id="table-days" class="chart-table" hidden></div>
      </div>
      <div class="panel chart-panel">
        <div class="chart-head"><h4>Accuracy per day</h4><span class="muted">share of puzzles answered correctly, last 30 days</span></div>
        <div id="chart-acc" class="chart"></div>
      </div>
      <div class="panel chart-panel">
        <div class="chart-head"><h4>Mastered over time</h4>
          <select id="m-set" class="dark-select">${lib.map((set) => `<option value="${esc(set.key)}"${set.key === sel?.key ? ' selected' : ''}>${esc(set.kind === 'rating' ? `${set.rating}★ (default)` : set.name)}</option>`).join('')}</select></div>
        <div id="chart-mastered" class="chart"></div>
      </div>

      <div class="panel">
        <h4>Your sets</h4>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Set</th><th>Puzzles</th><th>Seen</th><th>Mastered</th><th>Accuracy</th></tr></thead><tbody>${setRows}</tbody></table></div>
      </div>
    </div>`, 'scroll');
  root.querySelector('#exit').onclick = () => go('#/');

  // Puzzles per day (bars)
  barChart(root.querySelector('#chart-days'), perDay.map(({ d, v }) => ({
    label: short(d), value: v.n,
    tip: `<b>${short(d)}</b><br>${v.n} puzzles · ${v.c} correct${v.f ? ` · ${v.f} new` : ''}${v.t ? `<br>${fmtMinutes(v.t)}` : ''}`,
  })), { empty: 'No puzzles yet. Your daily activity will show up here.' });
  root.querySelector('#table-days').innerHTML = `<table class="data-table"><thead><tr><th>Day</th><th>Puzzles</th><th>Correct</th><th>New</th><th>Time</th></tr></thead><tbody>${
    perDay.filter(({ v }) => v.n).reverse().map(({ d, v }) => `<tr><td>${short(d)}</td><td>${v.n}</td><td>${v.c} (${Math.round((v.c / v.n) * 100)}%)</td><td>${v.f || 0}</td><td>${fmtMinutes(v.t)}</td></tr>`).join('') || '<tr><td colspan="5">No activity yet</td></tr>'}</tbody></table>`;
  root.querySelector('#toggle-table').onclick = (e) => {
    const t = root.querySelector('#table-days'), c = root.querySelector('#chart-days');
    const showTable = t.hidden;
    t.hidden = !showTable; c.hidden = showTable;
    e.target.textContent = showTable ? 'Show as chart' : 'Show as table';
  };

  // Accuracy per day (line, gaps on days without puzzles)
  lineChart(root.querySelector('#chart-acc'), perDay.map(({ d, v }) => ({
    label: short(d), value: v.n ? (v.c / v.n) * 100 : null,
    tip: v.n ? `<b>${short(d)}</b><br>${Math.round((v.c / v.n) * 100)}% correct (${v.c}/${v.n})` : `<b>${short(d)}</b><br>no puzzles`,
  })), { yMax: 100, suffix: '%', empty: 'Answer some puzzles to see your accuracy here.' });

  // Mastered over time for the chosen set
  const drawMastered = (key) => {
    const hk = Object.keys(history).sort().filter((k) => history[k][key]);
    const pts = hk.map((k) => {
      const [m, seen, total] = history[k][key];
      const d = new Date(`${k}T12:00:00`);
      return { label: short(d), value: m, tip: `<b>${short(d)}</b><br>${m.toLocaleString()} mastered · ${seen.toLocaleString()} seen of ${total.toLocaleString()}` };
    });
    const el = root.querySelector('#chart-mastered');
    if (pts.length < 2) {
      const cur = pts[0];
      el.innerHTML = `<div class="chart-empty"><span class="hero">${cur ? cur.value.toLocaleString() : 0}</span> mastered today.<br>Tracking started ${hk[0] ? short(new Date(`${hk[0]}T12:00:00`)) : 'today'}; the line fills in as you come back on other days.</div>`;
      return;
    }
    lineChart(el, pts, {});
  };
  drawMastered(root.querySelector('#m-set').value);
  root.querySelector('#m-set').onchange = (e) => drawMastered(e.target.value);
  onKey((e) => { if (e.key === 'Escape') go('#/'); });
}

// ---------- small SVG charts (one series, one axis; hover tooltips) ----------
const CHART_W = 640, CHART_H = 200, PAD = { l: 36, r: 10, t: 12, b: 26 };
// Round axis: a 1/2/5 x 10^k step with at most 4 intervals, so every tick is a whole, round number
function niceScale(v) {
  if (v <= 4) return { max: 4, step: 1 };
  const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((x) => x >= raw);
  return { max: step * Math.ceil(v / step), step };
}
function chartFrame(el, scale, labels, suffix = '') {
  const iw = CHART_W - PAD.l - PAD.r, ih = CHART_H - PAD.t - PAD.b;
  const yMax = scale.max;
  const y = (v) => PAD.t + ih - (v / yMax) * ih;
  let g = '';
  for (let v = 0; v <= yMax + 1e-9; v += scale.step) {
    const i = v;
    g += `<line x1="${PAD.l}" x2="${CHART_W - PAD.r}" y1="${y(v)}" y2="${y(v)}" class="grid${i === 0 ? ' base' : ''}"/>`;
    g += `<text x="${PAD.l - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${Math.round(v)}${suffix}</text>`;
  }
  const step = Math.max(1, Math.ceil(labels.length / 6));
  const x = (i) => PAD.l + (iw / labels.length) * (i + 0.5);
  labels.forEach((l, i) => { if ((labels.length - 1 - i) % step === 0) g += `<text x="${x(i)}" y="${CHART_H - 6}" class="tick" text-anchor="middle">${esc(l)}</text>`; });
  el.innerHTML = `<svg viewBox="0 0 ${CHART_W} ${CHART_H}" class="chart-svg" role="img">${g}<g class="marks"></g><g class="hover"></g></svg><div class="chart-tip" hidden></div>`;
  return { svg: el.querySelector('svg'), marks: el.querySelector('.marks'), hover: el.querySelector('.hover'), tip: el.querySelector('.chart-tip'), x, y, iw, ih };
}
function showTip(el, f, html, cx, cy) {
  f.tip.innerHTML = html; f.tip.hidden = false;
  const r = f.svg.getBoundingClientRect(), er = el.getBoundingClientRect();
  const px = (cx / CHART_W) * r.width + (r.left - er.left), py = (cy / CHART_H) * r.height + (r.top - er.top);
  f.tip.style.left = `${Math.min(Math.max(px, 60), er.width - 60)}px`;
  f.tip.style.top = `${py}px`;
}
function barChart(el, items, { empty } = {}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!max) { el.innerHTML = `<div class="chart-empty">${empty || 'No data yet.'}</div>`; return; }
  const f = chartFrame(el, niceScale(max), items.map((i) => i.label));
  const bw = Math.min(14, (f.iw / items.length) - 4), base = f.y(0);
  let m = '';
  items.forEach((it, i) => {
    if (it.value > 0) {
      const top = f.y(it.value), h = base - top, r = Math.min(4, h, bw / 2), x0 = f.x(i) - bw / 2;
      // 4px rounded top, square at the baseline
      m += `<path class="bar" d="M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z"/>`;
    }
    m += `<rect class="hit" data-i="${i}" x="${f.x(i) - f.iw / items.length / 2}" y="${PAD.t}" width="${f.iw / items.length}" height="${f.ih}"/>`;
  });
  f.marks.innerHTML = m;
  f.marks.querySelectorAll('.hit').forEach((h) => {
    const i = Number(h.dataset.i);
    h.onmouseenter = () => { h.classList.add('on'); showTip(el, f, items[i].tip, f.x(i), f.y(items[i].value)); };
    h.onmouseleave = () => { h.classList.remove('on'); f.tip.hidden = true; };
  });
}
function lineChart(el, pts, { yMax, suffix = '', empty } = {}) {
  const vals = pts.map((p) => p.value).filter((v) => v !== null && v !== undefined);
  if (!vals.length) { el.innerHTML = `<div class="chart-empty">${empty || 'No data yet.'}</div>`; return; }
  const f = chartFrame(el, yMax ? { max: yMax, step: yMax / 4 } : niceScale(Math.max(...vals)), pts.map((p) => p.label), suffix);
  let d = '', open = false, m = '';
  pts.forEach((p, i) => {
    if (p.value === null || p.value === undefined) { open = false; return; }
    d += `${open ? 'L' : 'M'}${f.x(i)},${f.y(p.value)} `; open = true;
    const prev = pts[i - 1]?.value, nxt = pts[i + 1]?.value;
    if ((prev === null || prev === undefined) && (nxt === null || nxt === undefined)) m += `<circle class="dot" cx="${f.x(i)}" cy="${f.y(p.value)}" r="4"/>`; // isolated point
  });
  f.marks.innerHTML = `<path class="line" d="${d}"/>${m}`;
  // crosshair hover, snapping to the nearest point with a value
  f.svg.addEventListener('mousemove', (e) => {
    const r = f.svg.getBoundingClientRect();
    const cx = ((e.clientX - r.left) / r.width) * CHART_W;
    let best = -1, bd = Infinity;
    pts.forEach((p, i) => { if (p.value === null || p.value === undefined) return; const dd = Math.abs(f.x(i) - cx); if (dd < bd) { bd = dd; best = i; } });
    if (best < 0) return;
    const px = f.x(best), py = f.y(pts[best].value);
    f.hover.innerHTML = `<line class="cross" x1="${px}" x2="${px}" y1="${PAD.t}" y2="${CHART_H - PAD.b}"/><circle class="focus" cx="${px}" cy="${py}" r="5"/>`;
    showTip(el, f, pts[best].tip, px, py);
  });
  f.svg.addEventListener('mouseleave', () => { f.hover.innerHTML = ''; f.tip.hidden = true; });
}
