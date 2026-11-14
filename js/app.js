import { loadAll, decode, matchSubmission } from './data.js';
import { NesBoard, PuzzleBoard, pieceSVG } from './board.js';
import { createSession, MODES } from './session.js';
import {
  getSettings, setSettings, getRec, record, summarize, getDaily, isMastered, resetProgress, MASTERED_BOX,
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
async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const data = await loadAll();
  if (parts[0] === 'play') return playView(data, parts[1], Number(parts[2]));
  if (parts[0] === 'puzzle') return puzzleView(data, parts[1]);
  if (parts[0] === 'browse') return browseView(data, Number(parts[1]) || getSettings().rating);
  return homeView(data);
}
window.addEventListener('hashchange', route);

// =====================================================================================
// HOME
// =====================================================================================
function homeView(data) {
  const s = getSettings();
  const ratings = [1, 2, 3, 4, 5, 6].filter((r) => data.byRating.get(r)?.length);
  let rating = s.rating && data.byRating.get(s.rating)?.length ? s.rating : (ratings.includes(4) ? 4 : ratings[ratings.length - 1]);
  const daily = getDaily();

  const ratingCards = [1, 2, 3, 4, 5, 6].filter((r) => r <= 5 || data.byRating.get(r)?.length).map((r) => {
    const list = data.byRating.get(r) || [];
    if (!list.length) return `<button class="rating-card empty" disabled>${stars(r, 80)}<div class="count">0</div><div class="small">no puzzles</div></button>`;
    const sum = summarize(list);
    const m = (sum.mastered / sum.total) * 100, seen = (sum.seen / sum.total) * 100;
    return `<button class="rating-card${r === rating ? ' selected' : ''}" data-r="${r}">
      ${stars(r, 80)}
      <div class="count">${list.length.toLocaleString()}</div>
      <div class="bar"><div class="m" style="width:${m}%"></div><div class="s" style="width:${Math.max(0, seen - m)}%"></div></div>
      <div class="small">${sum.mastered.toLocaleString()} mastered · ${sum.seen.toLocaleString()} seen</div>
    </button>`;
  }).join('');

  const list = rating ? data.byRating.get(rating) : [];
  const sum = rating ? summarize(list) : null;
  const mistakes = rating ? list.filter((p) => { const r = getRec(p.id); return r && (r.ok === false || r.c < r.n || r.b <= 1); }).length : 0;
  const withDetails = rating ? list.filter((p) => p.hasDetails).length : 0;

  const modeCard = (mode, badge, extra = '') => `
    <button class="option${rating ? '' : ' locked'}" data-mode="${mode}">
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

      ${ratings.length ? '' : `<div class="panel"><p><b>No puzzles loaded.</b> The puzzle data failed to load; try refreshing the page.</p></div>`}

      <h2 class="section">Puzzle set</h2>
      <div class="rating-row">${ratingCards}</div>

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
        ${modeCard('learn', sum ? (sum.due + sum.learning || '') : '', sum ? ` <b>${sum.due + sum.learning}</b> due, up to <b>${s.newPerSession}</b> new.` : '')}
        ${modeCard('run', s.runSize, ` Picks from: <b>${{ unmastered: 'not yet mastered', random: 'whole set', seen: 'puzzles you have seen' }[s.runPick || 'unmastered']}</b>.`)}
        ${modeCard('mistakes', mistakes || '')}
        ${modeCard('endless', '')}
        <button class="option${rating ? '' : ' locked'}" id="browse-card">
          <img class="prevent-select" src="assets/img/button-icons/eye.svg" width="64" style="padding:0 0 0 0">
          <div class="text"><h1>Browse</h1><p>Every puzzle in the set with your record on it. Click one to play it.</p></div>
        </button>
      </div>

      <h2 class="section">Settings</h2>
      <div class="panel">
        <div class="row">
          <label><input type="checkbox" id="set-timed" ${s.timed ? 'checked' : ''}> 30-second timer</label>
          <label><input type="checkbox" id="set-sound" ${s.sound ? 'checked' : ''}> Sound</label>
          <label>Rotate <input type="text" maxlength="1" id="set-rl" value="${esc(s.rotLeft)}"> <input type="text" maxlength="1" id="set-rr" value="${esc(s.rotRight)}"></label>
          <label>Undo <input type="text" maxlength="1" id="set-undo" value="${esc(s.undo)}"></label>
        </div>
        <div class="row">
          <label>New per Learn session <input type="number" min="0" max="500" id="set-new" value="${s.newPerSession}"></label>
          <label>Perfect Run size <input type="number" min="5" max="2000" id="set-run" value="${s.runSize}"></label>
          <label>Run picks from
            <select id="set-runpick" style="background:#151515;color:white;border:1px solid #555;border-radius:4px;padding:3px 5px;font-family:Montserrat">
              <option value="unmastered">not yet mastered</option><option value="random">whole set</option><option value="seen">seen puzzles</option>
            </select></label>
        </div>
        <p>Spaced repetition: a correct answer on a due puzzle schedules the next review in 1, 3, 7, 16, then 35 days. A miss sends it back to the start. A puzzle counts as <b>mastered</b> once it reaches the 7-day review stage. Keys during a puzzle: rotate ${esc(s.rotLeft.toUpperCase())}/${esc(s.rotRight.toUpperCase())}, undo ${esc(s.undo.toUpperCase())}. After it: Enter/Space next, R retry, Esc exit.</p>
      </div>

      ${rating ? `<div class="panel">
        <p>${list.length.toLocaleString()} puzzles in the ${rating}★ set; ${withDetails.toLocaleString()} have full engine details (top 5 moves and global stats), the rest show the best move only. Your progress is saved in this browser.</p>
        <div class="row">${solidButton({ label: `Reset ${rating}★ progress`, color: '#B73C3C', id: 'reset-r' })}</div>
      </div>` : ''}
    </div>`, 'scroll');

  root.querySelector('#set-runpick').value = s.runPick || 'unmastered';
  root.querySelectorAll('.rating-card[data-r]').forEach((b) => (b.onclick = () => { setSettings({ rating: Number(b.dataset.r) }); homeView(data); }));
  root.querySelectorAll('.option[data-mode]').forEach((b) => (b.onclick = () => go(`#/play/${b.dataset.mode}/${rating}`)));
  root.querySelector('#browse-card').onclick = () => go(`#/browse/${rating}`);

  const bind = (id, key, conv = (v) => v, ev = 'change') => {
    const el = root.querySelector(id);
    el.addEventListener(ev, () => { setSettings({ [key]: conv(el.type === 'checkbox' ? el.checked : el.value) }); });
  };
  bind('#set-timed', 'timed');
  bind('#set-sound', 'sound');
  bind('#set-rl', 'rotLeft', (v) => (v || 'z').toLowerCase(), 'input');
  bind('#set-rr', 'rotRight', (v) => (v || 'x').toLowerCase(), 'input');
  bind('#set-undo', 'undo', (v) => (v || 'q').toLowerCase(), 'input');
  bind('#set-new', 'newPerSession', (v) => Math.max(0, Math.min(500, Number(v) || 0)));
  bind('#set-run', 'runSize', (v) => Math.max(5, Math.min(2000, Number(v) || 50)));
  root.querySelector('#set-runpick').addEventListener('change', (e) => { setSettings({ runPick: e.target.value }); homeView(data); });

  root.querySelector('#reset-r')?.addEventListener('click', () => {
    if (!confirm(`Erase all your progress on the ${rating}★ puzzles? This cannot be undone.`)) return;
    resetProgress(list.map((p) => p.id)); toast('Progress reset'); homeView(data);
  });
}

// =====================================================================================
// PLAY
// =====================================================================================
function playView(data, mode, rating, opts = {}) {
  const puzzles = data.byRating.get(rating);
  if (!MODES[mode] || !puzzles?.length) return go('#/');
  const session = createSession(mode, rating, puzzles, { pick: getSettings().runPick || 'unmastered', ...opts });
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
  runSession(data, createSession('single', p.rating, null, { puzzle: p }), { exitTo: '#/browse/' + p.rating });
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
                <p class="instructions narrow">Hover your mouse on the board to move the piece! Rotate with ${esc(s.rotLeft.toUpperCase())} and ${esc(s.rotRight.toUpperCase())}.</p>
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
      // Solution board: player's move (or a hovered engine move) on the dimmed board,
      // with the correct answer outlined when the player missed it.
      const view = new NesBoard(boardEl, { scale: 3.3 });
      const sub = state.submission;
      const best = dec.moves[0];
      const show = (move) => {
        const first = move ? move.first : sub?.first;
        const second = move ? move.second : sub?.second;
        view.update({
          board: dec.board, level: s.level,
          activePiece: first, nextPiece: second, activePieceOpacity: 1, nextPieceOpacity: 1, defaultOpacity: 0.6,
          enginePieces: !move && state.idx !== 0 && best ? [best.first, best.second] : [],
          gold: p.rating === 6,
        });
      };
      show(undefined);
      root.querySelectorAll('.engine-move[data-move]').forEach((row) => {
        row.onmouseenter = () => show(row.dataset.move === 'you' ? undefined : dec.moves[Number(row.dataset.move)]);
        row.onmouseleave = () => show(undefined);
      });
      root.querySelector('#retry').onclick = retry;
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
          ${stars(session.rating, 90)}
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
    root.querySelector('#again')?.addEventListener('click', () => playView(data, session.mode, session.rating));
    root.querySelector('#rerun')?.addEventListener('click', () => {
      const s2 = createSession('run', session.rating, data.byRating.get(session.rating), { ids: misses });
      s2.isRerun = true;
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

function browseView(data, rating) {
  const all = data.byRating.get(rating) || [];
  const now = Date.now();
  const statusOf = (r) => (!r ? 'unseen' : r.b <= 1 ? 'learning' : r.b >= MASTERED_BOX ? 'mastered' : 'seen');
  let list = all.map((p) => ({ p, r: getRec(p.id) }));
  const f = browseState.filter;
  if (f === 'unseen') list = list.filter((x) => !x.r);
  else if (f === 'missed') list = list.filter((x) => x.r && x.r.c < x.r.n);
  else if (f === 'learning') list = list.filter((x) => x.r && x.r.b <= 1);
  else if (f === 'due') list = list.filter((x) => x.r && x.r.b >= 2 && x.r.d <= now);
  else if (f === 'mastered') list = list.filter((x) => isMastered(x.r));
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
        <select id="b-rating">${[1, 2, 3, 4, 5, 6].filter((r) => data.byRating.get(r)?.length).map((r) => `<option value="${r}"${r === rating ? ' selected' : ''}>${r}★ (${data.byRating.get(r).length.toLocaleString()})</option>`).join('')}</select>
        <select id="b-filter">${[['all', 'All'], ['unseen', 'Never seen'], ['due', 'Due for review'], ['learning', 'Missed last time'], ['missed', 'Ever missed'], ['mastered', 'Mastered']].map(([v, l]) => `<option value="${v}"${v === f ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <select id="b-sort">${[['id', 'Sort: ID'], ['accuracy', 'Sort: your accuracy'], ['recent', 'Sort: recently played'], ['global', 'Sort: hardest globally']].map(([v, l]) => `<option value="${v}"${v === browseState.sort ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input id="b-q" placeholder="Search ID or theme" value="${esc(browseState.q)}" size="16">
        <span>${list.length.toLocaleString()} puzzles</span>
      </div>
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
    tile.className = `tile st-${statusOf(r)}`;
    tile.innerHTML = `<div class="b"></div>
      <div class="pieces">${pieceSVG(d.current, s.level, 1.3)}${pieceSVG(d.next, s.level, 1.3)}</div>
      <div class="meta"><span>${r ? `${r.c}/${r.n}` : 'new'}</span><span>${p.attempts ? Math.round((p.solves / p.attempts) * 100) + '% global' : ''}</span></div>`;
    new NesBoard(tile.querySelector('.b'), { scale: 1.3 }).update({ board: d.board, level: s.level });
    grid.appendChild(tile);
  }

  root.querySelector('#exit').onclick = () => go('#/');
  const rerender = () => browseView(data, rating);
  root.querySelector('#b-rating').onchange = (e) => { browseState.page = 0; go(`#/browse/${e.target.value}`); };
  root.querySelector('#b-filter').onchange = (e) => { browseState.filter = e.target.value; browseState.page = 0; rerender(); };
  root.querySelector('#b-sort').onchange = (e) => { browseState.sort = e.target.value; browseState.page = 0; rerender(); };
  let qTimer;
  root.querySelector('#b-q').oninput = (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { browseState.q = e.target.value.trim(); browseState.page = 0; rerender(); const q = document.querySelector('#b-q'); q?.focus(); q?.setSelectionRange(q.value.length, q.value.length); }, 250); };
  root.querySelector('#prev').onclick = () => { if (browseState.page > 0) { browseState.page--; rerender(); } };
  root.querySelector('#nextp').onclick = () => { if (browseState.page < pages - 1) { browseState.page++; rerender(); } };
  onKey((e) => { if (e.key === 'Escape') go('#/'); });
}

route();
