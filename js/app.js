import { loadAll, decode, matchSubmission } from './data.js';
import {
  listSets, getCustomSet, saveSet, deleteSet, togglePuzzle, importSets, resolveSet, evaluateRule, describeRule,
  ratingKey, customKey, DEFAULT_RULE, THEMES, STATUS_OPTIONS,
} from './sets.js';
import { NesBoard, PuzzleBoard, pieceSVG } from './board.js';
import { createSession, MODES, orderNew } from './session.js';
import {
  getSettings, setSettings, getRec, record, summarize, getDaily, isMastered, resetProgress, MASTERED_BOX,
  exportProgress, importProgress, lastBackup, progressCount,
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
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const data = await loadAll();
  if (!migrated) { migrated = true; migrateSettings(data); }
  const legacy = (k) => (k && /^\d+$/.test(k) ? ratingKey(k) : k); // old links used bare ratings
  if (parts[0] === 'play') return playView(data, parts[1], legacy(parts[2]));
  if (parts[0] === 'puzzle') return puzzleView(data, parts[1]);
  if (parts[0] === 'browse') return browseView(data, legacy(parts[1]) || currentSet(data)?.key);
  if (parts[0] === 'sets' && parts[1] === 'new') return builderView(data, null);
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
    rates.length ? `solved by ${pct(Math.min(...rates))}–${pct(Math.max(...rates))} of players` : '',
    sel.missing ? `${sel.missing} no longer in the data` : '',
  ].filter(Boolean).join(' · ');

  const modeCard = (mode, badge, extra = '') => `
    <button class="option${list.length ? '' : ' locked'}" data-mode="${mode}">
      <img class="prevent-select" src="assets/${MODES[mode].icon}" width="64">
      <div class="text">
        <h1 class="prevent-select">${MODES[mode].label}${badge !== undefined && badge !== '' ? `<span class="badge">${badge}</span>` : ''}</h1>
        <p class="prevent-select">${MODES[mode].description}${extra}</p>
      </div>
    </button>`;

  const root = setView(`
    <div class="home">
      <header><h1 class="title">PUZZLES</h1></header>
      <p class="subtitle">Drill rated nestris.org puzzles until every one is automatic.</p>

      ${data.byId.size ? '' : `<div class="panel"><p><b>No puzzles loaded.</b> The puzzle data failed to load; try refreshing the page.</p></div>`}

      <h2 class="section">Library</h2>
      <div class="rating-row library">
        ${lib.map(card).join('')}
        <button class="rating-card lib-card new-set" id="new-set"><span class="plus">+</span><div class="small">New set</div></button>
      </div>

      ${sel ? `<div class="panel set-panel">
        <div class="row set-head"><h3>${sel.kind === 'rating' ? `${sel.rating}★ puzzles` : esc(sel.name)}</h3>
          <div class="row set-actions">
            ${solidButton({ label: 'Browse', color: '#2F3033', id: 'set-browse' })}
            ${sel.kind === 'custom' ? solidButton({ label: sel.set.rule ? 'Edit' : 'Rename', color: '#2F3033', id: 'set-edit' }) : ''}
            ${sel.kind === 'custom' && sel.set.rule ? solidButton({ label: 'Refresh', color: '#2F3033', id: 'set-refresh' }) : ''}
            ${sel.kind === 'custom' ? solidButton({ label: 'Delete', color: '#B73C3C', id: 'set-delete' }) : ''}
          </div></div>
        <p>${selInfo}</p>
        ${sel.kind === 'custom' && !list.length ? '<p>This set is empty. Open <b>Browse</b> on any set and use "Collect into" to handpick puzzles for it.</p>' : ''}
      </div>` : ''}

      ${sum ? `<div class="summary-row">
        <div class="summary-chip"><span class="v">${Math.round((sum.mastered / sum.total) * 1000) / 10}%</span><span class="k">mastered</span></div>
        <div class="summary-chip"><span class="v">${sum.due + sum.learning}</span><span class="k">due now</span></div>
        <div class="summary-chip"><span class="v">${(sum.total - sum.seen).toLocaleString()}</span><span class="k">never seen</span></div>
        <div class="summary-chip"><span class="v">${sum.attempts ? Math.round((sum.correct / sum.attempts) * 100) + '%' : '–'}</span><span class="k">accuracy</span></div>
        <div class="summary-chip"><span class="v">${daily.today.c}/${daily.today.n}</span><span class="k">today</span></div>
        <div class="summary-chip"><span class="v">${daily.streak}</span><span class="k">day streak</span></div>
      </div>` : ''}

      <h2 class="section">Modes</h2>
      <div class="options">
        ${modeCard('learn', sum ? (sum.due + sum.learning || '') : '', sum ? ` <b>${sum.due + sum.learning}</b> due, up to <b>${s.newPerSession}</b> new${learnNext}.` : '')}
        ${modeCard('run', s.runSize, ` Picks from: <b>${{ unmastered: 'not yet mastered', random: 'whole set', seen: 'puzzles you have seen' }[s.runPick || 'unmastered']}</b>.`)}
        ${modeCard('mistakes', mistakes || '')}
        ${modeCard('endless', '')}
      </div>

      <h2 class="section">Settings</h2>
      <div class="panel">
        <div class="row">
          <label><input type="checkbox" id="set-timed" ${s.timed ? 'checked' : ''}> 30-second timer</label>
          <label><input type="checkbox" id="set-sound" ${s.sound ? 'checked' : ''}> Sound</label>
          <label>Rotate left <button class="keybind" data-setting="rotLeft">${esc(keyName(s.rotLeft))}</button></label>
          <label>Rotate right <button class="keybind" data-setting="rotRight">${esc(keyName(s.rotRight))}</button></label>
          <label>Undo <button class="keybind" data-setting="undo">${esc(keyName(s.undo))}</button></label>
        </div>
        <div class="row">
          <label>New per Learn session <input type="number" min="0" max="500" id="set-new" value="${s.newPerSession}"></label>
          <label>Perfect Run size <input type="number" min="5" max="2000" id="set-run" value="${s.runSize}"></label>
          <label>Run picks from
            <select id="set-runpick" class="dark-select">
              <option value="unmastered">not yet mastered</option><option value="random">whole set</option><option value="seen">seen puzzles</option>
            </select></label>
          <label>New Learn puzzles
            <select id="set-neworder" class="dark-select">
              <option value="hardest">hardest first</option><option value="easiest">easiest first</option><option value="random">random order</option>
            </select></label>
        </div>
        <p>Spaced repetition: a correct answer on a due puzzle schedules the next review in 1, 3, 7, 16, then 35 days. A miss sends it back to the start. A puzzle counts as <b>mastered</b> once it reaches the 7-day review stage. Progress belongs to the puzzle, so it shows up in every set that contains it. Keys during a puzzle: rotate ${esc(keyName(s.rotLeft))}/${esc(keyName(s.rotRight))}, undo ${esc(keyName(s.undo))} (click a key button above, then press the key you want). After it: Enter/Space next, R retry, Esc exit.</p>
      </div>

      <div class="panel">
        <div class="row">
          ${solidButton({ label: 'Export progress', color: '#2F3033', id: 'exp-prog' })}
          <label class="solid-button" style="cursor:pointer"><span class="button" style="background-color:#2F3033"><span class="label">Import progress</span></span><input type="file" id="imp-prog" accept=".json,application/json" hidden></label>
          ${sel ? solidButton({ label: 'Reset progress in this set', color: '#B73C3C', id: 'reset-r' }) : ''}
        </div>
        <p id="backup-status" class="backup-status"></p>
        <p>Your progress is saved in this browser. Export saves a backup file of your progress, sets and settings; Import merges one back in (for each puzzle, the more recently played copy wins).</p>
      </div>
    </div>`, 'scroll');

  root.querySelector('#set-runpick').value = s.runPick || 'unmastered';
  root.querySelector('#set-neworder').value = newOrder;
  root.querySelector('#set-neworder').addEventListener('change', (e) => { setSettings({ newOrder: e.target.value }); homeView(data); });
  root.querySelectorAll('.lib-card[data-key]').forEach((b) => (b.onclick = () => { setSettings({ setKey: b.dataset.key }); homeView(data); }));
  root.querySelector('#new-set').onclick = () => go('#/sets/new');
  root.querySelectorAll('.option[data-mode]').forEach((b) => (b.onclick = () => go(`#/play/${b.dataset.mode}/${sel.key}`)));
  root.querySelector('#set-browse')?.addEventListener('click', () => go(`#/browse/${sel.key}`));
  root.querySelector('#set-edit')?.addEventListener('click', () => go(`#/sets/edit/${sel.set.id}`));
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

  const bind = (id, key, conv = (v) => v, ev = 'change') => {
    const el = root.querySelector(id);
    el.addEventListener(ev, () => { setSettings({ [key]: conv(el.type === 'checkbox' ? el.checked : el.value) }); });
  };
  bind('#set-timed', 'timed');
  bind('#set-sound', 'sound');
  root.querySelectorAll('.keybind').forEach((btn) => (btn.onclick = () => captureKey(btn, () => homeView(data))));
  bind('#set-new', 'newPerSession', (v) => Math.max(0, Math.min(500, Number(v) || 0)));
  bind('#set-run', 'runSize', (v) => Math.max(5, Math.min(2000, Number(v) || 50)));
  root.querySelector('#set-runpick').addEventListener('change', (e) => { setSettings({ runPick: e.target.value }); homeView(data); });

  // Backup reminder: progress only lives in this browser, so nudge after 14 days without an export
  const bs = root.querySelector('#backup-status');
  if (bs) {
    const lb = lastBackup();
    const days = lb ? Math.floor((Date.now() - lb) / 86400000) : null;
    const when = lb === null ? 'never' : days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
    bs.textContent = `Last backup: ${when}`;
    bs.classList.toggle('warn', progressCount() >= 20 && (lb === null || days >= 14));
  }

  root.querySelector('#exp-prog')?.addEventListener('click', () => {
    const blob = new Blob([exportProgress({ sets: listSets() })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `puzzle-drill-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setTimeout(() => homeView(data), 300);
  });
  root.querySelector('#imp-prog')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { total, updated, json } = importProgress(await file.text());
      const setsAdded = importSets(json.sets);
      toast(`Imported: ${updated.toLocaleString()} of ${total.toLocaleString()} puzzles updated${setsAdded ? `, ${setsAdded} set(s)` : ''}`);
      homeView(data);
    } catch (err) {
      toast('Import failed: ' + (err instanceof SyntaxError ? 'not a valid JSON file' : err.message));
    }
  });
  root.querySelector('#reset-r')?.addEventListener('click', () => {
    if (!confirm(`Erase your progress on all ${list.length.toLocaleString()} puzzles in "${sel.name}"? This also clears it everywhere else those puzzles appear, and cannot be undone.`)) return;
    resetProgress(list.map((p) => p.id)); toast('Progress reset'); homeView(data);
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
function builderView(data, editId) {
  const existing = editId ? getCustomSet(editId) : null;
  if (editId && !existing) return go('#/');
  const handpicked = existing && !existing.rule;
  let rule = structuredClone(existing?.rule || DEFAULT_RULE);
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
        <p>Ranked by how rarely players solve each puzzle on nestris.org, across the star ratings chosen above. Only puzzles with engine details have a rank.</p>
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
  runSession(data, createSession('single', p.rating, null, { puzzle: p }), { exitTo: '#/browse/' + (browseState.key || ratingKey(p.rating)) });
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
        <div class="guesses"><p>${p.hasDetails ? (m.guesses ?? 0).toLocaleString() : '–'}</p></div><div></div>
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
                  ${p.hasDetails ? '' : '<p class="engine-note">Only the best move is known for this puzzle (no details scraped yet).</p>'}
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
    const perfect = session.done > 0 && session.misses.length === 0;
    const pct = session.done ? Math.round((session.correct / session.done) * 100) : 0;
    const misses = [...session.misses];
    const root = setView(`
      ${outlineButton('Exit', 'leave-fullscreen-button', 'exit')}
      <div class="content" style="justify-content:center">
        <div class="end-card">
          ${session.set?.kind === 'custom' ? `<p class="set-title">${esc(session.set.name)}</p>` : stars(session.rating, 90)}
          <h1>${session.mode === 'run' ? (perfect ? 'Perfect run!' : 'Run complete') : session.done ? 'Session complete' : 'Nothing to do here'}</h1>
          ${session.done ? `<p class="big">${session.correct}/${session.done}</p>
          <div class="summary-row">
            <div class="summary-chip"><span class="v">${pct}%</span><span class="k">first-try accuracy</span></div>
            <div class="summary-chip"><span class="v">${session.bestStreak}</span><span class="k">best streak</span></div>
            <div class="summary-chip"><span class="v">${misses.length}</span><span class="k">puzzles missed</span></div>
          </div>` : `<p class="engine-note" style="font-size:13px">${session.mode === 'mistakes' ? 'No mistakes to fix in this set.' : 'No puzzles are due right now. Raise "New per Learn session" in Settings or try a Perfect Run.'}</p>`}
          ${misses.length ? solidButton({ label: `Re-run ${misses.length} miss${misses.length === 1 ? '' : 'es'}`, color: '#B73C3C', stretch: true, id: 'rerun' }) : ''}
          ${session.mode !== 'single' ? solidButton({ label: session.mode === 'run' ? 'New run' : 'Again', icon: 'assets/img/button-icons/new-puzzle.svg', color: '#54A165', stretch: true, id: 'again' }) : ''}
          ${solidButton({ label: 'Home', color: '#3C5EB7', stretch: true, id: 'home' })}
        </div>
      </div>`, perfect ? 'correct' : '');
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

  next();
}

// =====================================================================================
// BROWSE
// =====================================================================================
const PAGE = 48;
let browseState = { filter: 'all', sort: 'id', page: 0, q: '' };

function browseView(data, key) {
  const set = resolveSet(data, key);
  if (!set) return go('#/');
  browseState.key = set.key;
  const all = set.puzzles;
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
  if (browseState.q) list = list.filter((x) => x.p.id.includes(browseState.q) || (x.p.theme || '').toLowerCase().includes(browseState.q.toLowerCase()));
  const acc = (r) => (r && r.n ? r.c / r.n : 2);
  const sorters = {
    id: (a, b) => a.p.id.localeCompare(b.p.id),
    accuracy: (a, b) => acc(a.r) - acc(b.r),
    recent: (a, b) => (b.r?.l || 0) - (a.r?.l || 0),
    global: (a, b) => ((a.p.attempts ? a.p.solves / a.p.attempts : 2) - (b.p.attempts ? b.p.solves / b.p.attempts : 2)),
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
        <select id="b-sort">${[['id', 'Sort: ID'], ['accuracy', 'Sort: your accuracy'], ['recent', 'Sort: recently played'], ['global', 'Sort: hardest globally']].map(([v, l]) => `<option value="${v}"${v === browseState.sort ? ' selected' : ''}>${l}</option>`).join('')}</select>
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
      <div class="meta"><span class="st-badge st-${st}">${label}</span><span>${p.hardRank ? `#${p.hardRank.toLocaleString()}` : ''}</span></div>
      <div class="meta"><span>${r ? `you ${r.c}/${r.n}` : ''}${review ? ` · ${review}` : ''}</span><span>${p.attempts ? Math.round((p.solves / p.attempts) * 100) + '% global' : ''}</span></div>`;
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
