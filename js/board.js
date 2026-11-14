// NES board rendering and puzzle piece placement.
// Ported from nestris.org's nes-board / nes-block / nes-piece / puzzle-nes-board components.
import { ColorType, TetrominoType, MoveableTetromino, getColorForLevel, getColorTypeForTetromino, Tetromino } from './core.js';

const BOARD_W = 8 * 10 + 11; // 91 px at scale 1
const BOARD_H = 8 * 20 + 21; // 181 px at scale 1
const WHITE_DOTS = [[0, 0], [1, 1], [1, 2], [2, 1]];

function blockSVG(color, level, ox, oy, opacity, hovering) {
  let s = `<g opacity="${opacity}">`;
  if (color === ColorType.EMPTY) {
    if (hovering) s += `<rect x="${ox}" y="${oy}" width="8" height="8" fill="rgb(50,50,50)"/>`;
    return s + '</g>';
  }
  if (color === 'engine') {
    return s + `<rect x="${ox + 0.5}" y="${oy + 0.5}" width="7" height="7" opacity="0.8" stroke="rgb(255,255,255)" stroke-width="1"/></g>`;
  }
  const bg = getColorForLevel(color === ColorType.WHITE ? ColorType.PRIMARY : color, level);
  s += `<rect x="${ox}" y="${oy}" width="8" height="8" fill="${bg}"${hovering ? ' opacity="0.8"' : ''}/>`;
  s += `<rect x="${ox}" y="${oy}" width="1" height="1" fill="#fff"/>`;
  if (color === ColorType.WHITE) s += `<rect x="${ox + 1}" y="${oy + 1}" width="6" height="6" fill="#fff"/>`;
  else for (const [x, y] of WHITE_DOTS) s += `<rect x="${ox + x}" y="${oy + y}" width="1" height="1" fill="#fff"/>`;
  return s + '</g>';
}

// SVG markup for a single tetromino in its spawn rotation (the "next box" piece)
export function pieceSVG(type, level = 18, scale = 1, opacity = 1) {
  if (type === undefined || type === null || type === TetrominoType.ERROR_TYPE) return '';
  const color = getColorTypeForTetromino(type);
  const bs = Tetromino.getPieceByType(type).blockSet[0];
  const w = bs.maxX - bs.minX + 1, h = bs.maxY - bs.minY + 1;
  const pw = 9 * w - 1, ph = 9 * h - 1;
  let inner = '';
  for (const b of bs.blocks) inner += blockSVG(color, level, 9 * (b.x - bs.minX), 9 * (b.y - bs.minY), opacity, false);
  return `<svg class="next-box-svg" width="${pw * scale}" height="${ph * scale}" viewBox="0 0 ${pw} ${ph}">${inner}</svg>`;
}

/**
 * Renders an NES board into `el`. Call update() with any subset of:
 *   board, level, activePiece, activePieceOpacity, nextPiece, nextPieceOpacity,
 *   defaultOpacity, enginePieces (outlines), nextType (corner piece), hovered {x,y}, gold
 */
export class NesBoard {
  constructor(el, { scale = 3.3, interactable = false } = {}) {
    this.el = el;
    this.scale = scale;
    this.interactable = interactable;
    this.state = { level: 18, defaultOpacity: 1, activePieceOpacity: 1, nextPieceOpacity: 1, enginePieces: [] };
    el.classList.add('board-container');
    el.innerHTML = `<div class="next-piece"></div><svg class="board-svg" width="${BOARD_W * scale}" height="${BOARD_H * scale}" viewBox="0 0 ${BOARD_W} ${BOARD_H}"></svg>`;
    this.svg = el.querySelector('svg');
    this.corner = el.querySelector('.next-piece');
  }

  // Convert a pointer event to a board cell (matches nestris's 9px block hit areas)
  cellFromEvent(e) {
    const r = this.svg.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * BOARD_W;
    const py = (e.clientY - r.top) / r.height * BOARD_H;
    const x = Math.floor((px - 1) / 9), y = Math.floor((py - 1) / 9);
    if (x < 0 || x > 9 || y < 0 || y > 19) return undefined;
    return { x, y };
  }

  update(patch) {
    Object.assign(this.state, patch);
    const s = this.state;
    this.el.classList.toggle('gold', !!s.gold);
    const contains = (p, x, y) => p && p.contains(x, y);
    let html = '';
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        let color, opacity;
        if (s.enginePieces.some((p) => p.contains(x, y)) && !(s.board && s.board.exists(x, y))) { color = 'engine'; opacity = 1; }
        else if (contains(s.activePiece, x, y)) { color = s.activePiece.color; opacity = s.activePieceOpacity; }
        else if (contains(s.nextPiece, x, y)) { color = s.nextPiece.color; opacity = s.nextPieceOpacity; }
        else { color = s.board ? s.board.getAt(x, y) : ColorType.EMPTY; opacity = s.defaultOpacity; }
        const hovering = this.interactable && s.hovered && s.hovered.x === x && s.hovered.y === y;
        html += blockSVG(color, s.level, 9 * x + 1, 9 * y + 1, opacity, hovering);
      }
    }
    this.svg.innerHTML = html;
    if (s.nextType !== undefined && s.nextType !== null) {
      this.corner.style.padding = `${5 * this.scale * 0.5}px`;
      this.corner.innerHTML = pieceSVG(s.nextType, s.level, this.scale * 0.5);
    } else {
      this.corner.innerHTML = '';
    }
  }
}

/**
 * Interactive puzzle board: hover to move the piece, click to place, rotate with keys.
 * Calls onSubmit({ first, second }) after the second piece is placed, onCanUndo(bool) as undo availability changes.
 */
export class PuzzleBoard {
  constructor(el, { puzzle, level = 18, scale = 3.3, keys, onSubmit, onCanUndo, onPlace }) {
    this.puzzle = puzzle; // { board, current, next }
    this.level = level;
    this.keys = keys;
    this.onSubmit = onSubmit;
    this.onCanUndo = onCanUndo || (() => {});
    this.onPlace = onPlace || (() => {});
    this.view = new NesBoard(el, { scale, interactable: true });
    this.reset();

    this.onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === this.keys.rotLeft.toLowerCase()) this.rotate(3);
      else if (key === this.keys.rotRight.toLowerCase()) this.rotate(1);
      else if (key === this.keys.undo.toLowerCase()) this.undo();
    };
    window.addEventListener('keydown', this.onKey);

    const svg = this.view.svg;
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.setHovered(this.view.cellFromEvent(e));
    });
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.setHovered(undefined); });
    svg.addEventListener('pointerup', (e) => {
      const cell = this.view.cellFromEvent(e);
      if (e.pointerType === 'mouse') { this.setHovered(cell); this.place(); return; }
      // Touch / pen: first tap previews the piece; tapping on the previewed piece places it
      if (cell && this.hoveredPiece && this.hoveredPiece.contains(cell.x, cell.y)) this.place();
      else this.setHovered(cell);
    });
  }

  destroy() { window.removeEventListener('keydown', this.onKey); }

  reset() {
    this.first = undefined;
    this.second = undefined;
    this.board = this.puzzle.board.copy();
    this.rotation = 0;
    this.computeHovered();
    this.onCanUndo(false);
  }
  undo() { if (this.first && !this.second) this.reset(); }

  rotate(delta) {
    if (this.second) return;
    this.rotation = (this.rotation + delta) % 4;
    this.computeHovered();
  }
  setHovered(cell) { this.hoveredBlock = cell; this.computeHovered(); }

  activeType() {
    if (!this.first) return this.puzzle.current;
    if (!this.second) return this.puzzle.next;
    return undefined;
  }

  // Same mouse-to-placement mapping as nestris.org
  computeHovered() {
    const piece = this.activeType();
    if (piece === undefined || !this.hoveredBlock) { this.hoveredPiece = undefined; return this.render(); }
    let x = this.hoveredBlock.x - 2, y = this.hoveredBlock.y - 2;
    if ([TetrominoType.J_TYPE, TetrominoType.L_TYPE, TetrominoType.T_TYPE].includes(piece)) y += 1;
    if ([TetrominoType.Z_TYPE, TetrominoType.S_TYPE, TetrominoType.I_TYPE].includes(piece) && this.rotation % 2 === 1) y += 1;
    const mt = new MoveableTetromino(piece, this.rotation, x, y);
    mt.moveIntoBounds();
    mt.kickToValidPlacement(this.board, this.hoveredBlock.x, this.hoveredBlock.y, piece, this.rotation);
    this.hoveredPiece = mt;
    this.render();
  }

  place() {
    const hp = this.hoveredPiece;
    if (!hp || !hp.isValidPlacement(this.board)) return;
    const placed = hp.copy();
    placed.blitToBoard(this.board);
    const nb = this.board.copy();
    nb.processLineClears();
    this.board = nb;
    this.rotation = 0;
    if (!this.first) {
      this.first = placed;
      this.onCanUndo(true);
      this.onPlace(1);
      this.computeHovered();
    } else {
      this.second = placed;
      this.onCanUndo(false);
      this.hoveredPiece = undefined;
      this.render();
      this.onSubmit({ first: this.first, second: this.second });
    }
  }

  render() {
    const hp = this.hoveredPiece;
    this.view.update({
      board: this.board,
      level: this.level,
      hovered: this.hoveredBlock,
      activePiece: hp,
      activePieceOpacity: hp && hp.isValidPlacement(this.board) ? 0.7 : 0.35,
      nextType: hp === undefined ? this.activeType() : undefined,
    });
  }
}
