// Bundled from nestris.org shared/ (puzzles + tetris logic). Do not edit by hand.
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// ../../shared/tetris/tetromino-type.ts
var TetrominoType = /* @__PURE__ */ ((TetrominoType2) => {
  TetrominoType2[TetrominoType2["I_TYPE"] = 0] = "I_TYPE";
  TetrominoType2[TetrominoType2["O_TYPE"] = 1] = "O_TYPE";
  TetrominoType2[TetrominoType2["L_TYPE"] = 2] = "L_TYPE";
  TetrominoType2[TetrominoType2["J_TYPE"] = 3] = "J_TYPE";
  TetrominoType2[TetrominoType2["T_TYPE"] = 4] = "T_TYPE";
  TetrominoType2[TetrominoType2["S_TYPE"] = 5] = "S_TYPE";
  TetrominoType2[TetrominoType2["Z_TYPE"] = 6] = "Z_TYPE";
  TetrominoType2[TetrominoType2["ERROR_TYPE"] = 7] = "ERROR_TYPE";
  return TetrominoType2;
})(TetrominoType || {});
var ALL_TETROMINO_TYPES = [
  0 /* I_TYPE */,
  1 /* O_TYPE */,
  2 /* L_TYPE */,
  3 /* J_TYPE */,
  4 /* T_TYPE */,
  5 /* S_TYPE */,
  6 /* Z_TYPE */
];

// ../../shared/tetris/tetromino-colors.ts
function getColorTypeForTetromino(tetrominoType) {
  switch (tetrominoType) {
    case 0 /* I_TYPE */:
    case 1 /* O_TYPE */:
    case 4 /* T_TYPE */:
      return 3 /* WHITE */;
    case 3 /* J_TYPE */:
    case 5 /* S_TYPE */:
      return 1 /* PRIMARY */;
    default:
      return 2 /* SECONDARY */;
  }
}
var RGBColor = class {
  constructor(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
  get average() {
    return (this.r + this.g + this.b) / 3;
  }
  toString() {
    return `rgb(${this.r}, ${this.g}, ${this.b})`;
  }
  toStringWithAlpha(alpha) {
    return `rgba(${this.r}, ${this.g}, ${this.b}, ${alpha})`;
  }
};
var COLOR_FIRST_COLORS_RGB = {
  0: new RGBColor(0, 88, 248),
  1: new RGBColor(0, 168, 0),
  2: new RGBColor(216, 0, 204),
  3: new RGBColor(0, 88, 248),
  4: new RGBColor(228, 0, 88),
  5: new RGBColor(88, 248, 152),
  6: new RGBColor(248, 56, 0),
  7: new RGBColor(104, 68, 252),
  8: new RGBColor(0, 88, 248),
  9: new RGBColor(248, 56, 0)
};
var COLOR_SECOND_COLORS_RGB = {
  0: new RGBColor(60, 188, 252),
  1: new RGBColor(148, 248, 24),
  2: new RGBColor(248, 120, 248),
  3: new RGBColor(88, 216, 84),
  4: new RGBColor(88, 248, 152),
  5: new RGBColor(104, 136, 252),
  6: new RGBColor(124, 124, 124),
  7: new RGBColor(168, 0, 32),
  8: new RGBColor(248, 56, 0),
  9: new RGBColor(252, 160, 68)
};
var WHITE = new RGBColor(255, 255, 255);
function getColorForLevel(colorType, level = 0) {
  if (level < 0) level = 0;
  level = level % 10;
  if (colorType === 3 /* WHITE */) {
    return "rgb(255, 255, 255)";
  } else if (colorType === 1 /* PRIMARY */) {
    return COLOR_FIRST_COLORS_RGB[level].toString();
  } else if (colorType === 2 /* SECONDARY */) {
    return COLOR_SECOND_COLORS_RGB[level].toString();
  } else {
    throw new Error("getColorForLevel(): color type is empty");
  }
}
function getColorForTetrominoAndLevel(tetrominoType, level) {
  return getColorForLevel(getColorTypeForTetromino(tetrominoType), level);
}

// ../../shared/tetris/tetromino-shapes.ts
var PIECE_I = [
  [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0]
  ],
  [
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0]
  ]
];
var PIECE_J = [
  [
    [0, 0, 0, 0],
    [0, 1, 1, 1],
    [0, 0, 0, 1]
  ],
  [
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 1, 1, 0]
  ],
  [
    [0, 1, 0, 0],
    [0, 1, 1, 1],
    [0, 0, 0, 0]
  ],
  [
    [0, 0, 1, 1],
    [0, 0, 1, 0],
    [0, 0, 1, 0]
  ]
];
var PIECE_L = [
  [
    [0, 0, 0, 0],
    [0, 1, 1, 1],
    [0, 1, 0, 0]
  ],
  [
    [0, 1, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0]
  ],
  [
    [0, 0, 0, 1],
    [0, 1, 1, 1],
    [0, 0, 0, 0]
  ],
  [
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 1]
  ]
];
var PIECE_O = [
  [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0]
  ]
];
var PIECE_S = [
  [
    [0, 0, 0, 0],
    [0, 0, 1, 1],
    [0, 1, 1, 0]
  ],
  [
    [0, 0, 1, 0],
    [0, 0, 1, 1],
    [0, 0, 0, 1]
  ]
];
var PIECE_T = [
  [
    [0, 0, 0, 0],
    [0, 1, 1, 1],
    [0, 0, 1, 0]
  ],
  [
    [0, 0, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 1, 0]
  ],
  [
    [0, 0, 1, 0],
    [0, 1, 1, 1],
    [0, 0, 0, 0]
  ],
  [
    [0, 0, 1, 0],
    [0, 0, 1, 1],
    [0, 0, 1, 0]
  ]
];
var PIECE_Z = [
  [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 1, 1]
  ],
  [
    [0, 0, 0, 1],
    [0, 0, 1, 1],
    [0, 0, 1, 0]
  ]
];
var PIECE_ERROR = [[[]]];
var PIECE_SHAPE = {
  [0 /* I_TYPE */]: PIECE_I,
  [1 /* O_TYPE */]: PIECE_O,
  [2 /* L_TYPE */]: PIECE_L,
  [3 /* J_TYPE */]: PIECE_J,
  [4 /* T_TYPE */]: PIECE_T,
  [5 /* S_TYPE */]: PIECE_S,
  [6 /* Z_TYPE */]: PIECE_Z,
  [7 /* ERROR_TYPE */]: PIECE_ERROR
};
function getTopLeft(piece) {
  for (let y = 0; y < piece.length; y++) {
    for (let x = 0; x < piece[y].length; x++) {
      if (piece[y][x] === 1) {
        return { x, y };
      }
    }
  }
  throw new Error("Piece is empty");
}
var PIECE_TOP_LEFT = {
  [0 /* I_TYPE */]: PIECE_I.map(getTopLeft),
  [1 /* O_TYPE */]: PIECE_O.map(getTopLeft),
  [2 /* L_TYPE */]: PIECE_L.map(getTopLeft),
  [3 /* J_TYPE */]: PIECE_J.map(getTopLeft),
  [4 /* T_TYPE */]: PIECE_T.map(getTopLeft),
  [5 /* S_TYPE */]: PIECE_S.map(getTopLeft),
  [6 /* Z_TYPE */]: PIECE_Z.map(getTopLeft),
  [7 /* ERROR_TYPE */]: [{ x: 0, y: 0 }]
};

// ../../shared/tetris/block-set.ts
var BlockPosition = class _BlockPosition {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  // Returns a new BlockPosition with the x/y values translated by the given amount
  translate(x, y) {
    return new _BlockPosition(this.x + x, this.y + y);
  }
  // Returns true if the block is in bounds of the grid
  inBounds() {
    return this.x >= 0 && this.x < 10 && this.y >= 0 && this.y < 20;
  }
};
var BlockSet = class _BlockSet {
  constructor(blocks) {
    this.blocks = blocks;
    __publicField(this, "minX");
    __publicField(this, "minY");
    __publicField(this, "maxX");
    __publicField(this, "maxY");
    let minX = 100;
    let minY = 100;
    let maxX = -100;
    let maxY = -100;
    blocks.forEach((block) => {
      minX = Math.min(minX, block.x);
      minY = Math.min(minY, block.y);
      maxX = Math.max(maxX, block.x);
      maxY = Math.max(maxY, block.y);
    });
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
  }
  // Returns a new BlockSet with the blocks translated by the given amount
  translate(x, y) {
    return new _BlockSet(this.blocks.map((block) => block.translate(x, y)));
  }
  // return whether a given position exists in the block set
  contains(x, y) {
    return this.blocks.some((block) => block.x === x && block.y === y);
  }
};

// ../../shared/tetris/tetrominos.ts
var TETROMINO_CHAR = {
  [0 /* I_TYPE */]: "I",
  [1 /* O_TYPE */]: "O",
  [2 /* L_TYPE */]: "L",
  [3 /* J_TYPE */]: "J",
  [4 /* T_TYPE */]: "T",
  [5 /* S_TYPE */]: "S",
  [6 /* Z_TYPE */]: "Z",
  [7 /* ERROR_TYPE */]: "E"
};
var TETROMINO_CHAR_TO_TYPE = {
  "I": 0 /* I_TYPE */,
  "O": 1 /* O_TYPE */,
  "L": 2 /* L_TYPE */,
  "J": 3 /* J_TYPE */,
  "T": 4 /* T_TYPE */,
  "S": 5 /* S_TYPE */,
  "Z": 6 /* Z_TYPE */,
  "E": 7 /* ERROR_TYPE */
};
var _Tetromino = class _Tetromino {
  constructor(type) {
    this.type = type;
    __publicField(this, "blockSet");
    const blocksets = [];
    const shape = PIECE_SHAPE[type];
    for (let shapeForRot of shape) {
      const blockPositions = [];
      for (let y = 0; y < shapeForRot.length; y++) {
        let row = shapeForRot[y];
        for (let x = 0; x < row.length; x++) {
          if (row[x] === 1) {
            blockPositions.push(new BlockPosition(x, y));
          }
        }
      }
      blocksets.push(new BlockSet(blockPositions));
    }
    this.blockSet = blocksets;
  }
  static getPieceByType(type) {
    return _Tetromino.ALL_PIECES.find((piece) => piece.type === type);
  }
  getBlockSet(rotation) {
    return this.blockSet[rotation % this.blockSet.length];
  }
  getColorForLevel(level) {
    return getColorForTetrominoAndLevel(this.type, level);
  }
  numPossibleRotations() {
    return this.blockSet.length;
  }
};
// precompute blocksets for all seven tetrominos at the start of the program
__publicField(_Tetromino, "ALL_PIECES", ALL_TETROMINO_TYPES.map(
  (type) => new _Tetromino(type)
));
var Tetromino = _Tetromino;

// ../../shared/tetris/moveable-tetromino.ts
var MoveableTetromino = class _MoveableTetromino {
  constructor(tetrominoType, rotation, translateX, translateY) {
    this.tetrominoType = tetrominoType;
    this.rotation = rotation;
    this.translateX = translateX;
    this.translateY = translateY;
    __publicField(this, "currentBlockSet");
    __publicField(this, "color");
    this.rotation = rotation % Tetromino.getPieceByType(tetrominoType).numPossibleRotations();
    this.color = getColorTypeForTetromino(tetrominoType);
    this.updateCurrentBlockSet();
  }
  // Returns the starting pose of a piece at spawn
  static fromSpawnPose(tetrominoType) {
    const y = tetrominoType === 0 /* I_TYPE */ ? -2 : -1;
    return new _MoveableTetromino(tetrominoType, 0, 3, y);
  }
  static fromStackRabbitPose(tetrominoType, r, x, y) {
    const dy = tetrominoType === 0 /* I_TYPE */ ? -2 : -1;
    return new _MoveableTetromino(tetrominoType, r, x + 3, y + dy);
  }
  static fromMTPose(tetrominoType, pose) {
    return new _MoveableTetromino(tetrominoType, pose.r, pose.x, pose.y);
  }
  copy() {
    return new _MoveableTetromino(this.tetrominoType, this.rotation, this.translateX, this.translateY);
  }
  contains(x, y) {
    return this.getCurrentBlockSet().contains(x, y);
  }
  // encoding format: TRXXYY
  encodeAsNumber() {
    const typeAsNumber = this.tetrominoType;
    return typeAsNumber * 1e5 + this.rotation * 1e4 + this.translateX * 100 + this.translateY;
  }
  static decodeFromNumber(number) {
    const typeAsNumber = Math.floor(number / 1e5);
    let type;
    switch (typeAsNumber) {
      case 0:
        type = 0 /* I_TYPE */;
        break;
      case 1:
        type = 3 /* J_TYPE */;
        break;
      case 2:
        type = 2 /* L_TYPE */;
        break;
      case 3:
        type = 1 /* O_TYPE */;
        break;
      case 4:
        type = 5 /* S_TYPE */;
        break;
      case 5:
        type = 4 /* T_TYPE */;
        break;
      case 6:
        type = 6 /* Z_TYPE */;
        break;
      default:
        throw new Error("invalid typeAsNumber");
    }
    const rotation = Math.floor(number % 1e5 / 1e4);
    const translateX = Math.floor(number % 1e4 / 100);
    const translateY = Math.floor(number % 100);
    return new _MoveableTetromino(type, rotation, translateX, translateY);
  }
  /**
   * Attempt to extract a MoveableTetromino from an otherwise-empty TetrisBoard, or null if one is not found.
   * @param board The TetrisBoard to extract from
   * @returns The extracted MoveableTetromino, or null if one is not found
   */
  static extractFromTetrisBoard(board) {
    if (board.count() !== 4) return null;
    const topLeft = (() => {
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 10; x++) {
          if (board.exists(x, y)) return { x, y };
        }
      }
      throw new Error("Board is empty");
    })();
    for (let type of ALL_TETROMINO_TYPES) {
      for (let r = 0; r < Tetromino.getPieceByType(type).numPossibleRotations(); r++) {
        const offset = PIECE_TOP_LEFT[type][r];
        const MT = new _MoveableTetromino(type, r, topLeft.x - offset.x, topLeft.y - offset.y);
        if (MT.getCurrentBlockSet().blocks.every((block) => board.exists(block.x, block.y))) {
          return MT;
        }
      }
    }
    return null;
  }
  updateCurrentBlockSet() {
    const tetromino = Tetromino.getPieceByType(this.tetrominoType);
    this.currentBlockSet = tetromino.getBlockSet(this.rotation).translate(this.translateX, this.translateY);
  }
  getCurrentBlockSet() {
    return this.currentBlockSet;
  }
  getRotation() {
    return this.rotation;
  }
  getTranslateX() {
    return this.translateX;
  }
  getTranslateY() {
    return this.translateY;
  }
  getMTPose() {
    return { r: this.rotation, x: this.translateX, y: this.translateY };
  }
  // Represent in Postgres-friendly int2 form. 3 bits for piece type, 2 bits for rotation, 5 bits for x, 5 bits for y
  getInt2() {
    const type = this.tetrominoType;
    const rotation = this.rotation;
    const x = this.translateX + 2;
    const y = this.translateY + 2;
    if (type < 0 || type > 7) throw new Error("Invalid type");
    if (rotation < 0 || rotation > 3) throw new Error("Invalid rotation");
    if (x < 0 || x > 31) throw new Error("Invalid x");
    if (y < 0 || y > 31) throw new Error("Invalid y");
    return type << 12 | rotation << 10 | x << 5 | y;
  }
  // Convert from Postgres-friendly int2 form into MoveableTetromino
  static fromInt2(int2) {
    const type = int2 >> 12 & 7;
    const rotation = int2 >> 10 & 3;
    const x = int2 >> 5 & 31;
    const y = int2 & 31;
    return new _MoveableTetromino(type, rotation, x - 2, y - 2);
  }
  getLowestY() {
    return this.getCurrentBlockSet().maxY;
  }
  updatePose(rotation, translateX, translateY) {
    if (rotation !== void 0) {
      const numPossibleRotations = Tetromino.getPieceByType(this.tetrominoType).numPossibleRotations();
      this.rotation = rotation % numPossibleRotations;
    }
    if (translateX !== void 0) {
      this.translateX = translateX;
    }
    if (translateY !== void 0) {
      this.translateY = translateY;
    }
    this.updateCurrentBlockSet();
  }
  moveBy(dr, dx, dy) {
    this.updatePose(this.rotation + dr + 4, this.translateX + dx, this.translateY + dy);
  }
  rotateBy(delta) {
    const numPossibleRotations = Tetromino.getPieceByType(this.tetrominoType).numPossibleRotations();
    this.rotation = (this.rotation + delta) % numPossibleRotations;
    this.updateCurrentBlockSet();
  }
  // attempt to kick the piece in all directions to a valid placement
  kickToValidPlacement(board, hoveredX, hoveredY, piece, rotation) {
    if (this.isValidPlacement(board)) return;
    let kickOffsets = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 },
      { x: 0, y: 2 },
      { x: -1, y: 2 },
      { x: 1, y: 2 }
    ];
    if (piece === 0 /* I_TYPE */ && rotation % 2 === 1) {
      kickOffsets = [
        { x: 0, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: 0, y: -2 },
        { x: 0, y: 2 }
      ];
    }
    let bestNotContainingMT = void 0;
    for (let offset of kickOffsets) {
      const MT = new _MoveableTetromino(this.tetrominoType, this.rotation, this.translateX + offset.x, this.translateY + offset.y);
      if (MT.isValidPlacement(board)) {
        if (MT.contains(hoveredX, hoveredY)) {
          this.moveBy(0, offset.x, offset.y);
          return;
        } else if (bestNotContainingMT === void 0) {
          bestNotContainingMT = offset;
        }
      }
    }
    ;
    if (bestNotContainingMT !== void 0) {
      this.moveBy(0, bestNotContainingMT.x, bestNotContainingMT.y);
    }
  }
  moveIntoBounds() {
    const blockSet = this.getCurrentBlockSet();
    const minX = blockSet.minX;
    const maxX = blockSet.maxX;
    const minY = blockSet.minY;
    const maxY = blockSet.maxY;
    if (minX < 0) {
      this.moveBy(0, -minX, 0);
    }
    if (maxX > 9) {
      this.moveBy(0, 9 - maxX, 0);
    }
    if (minY < 0) {
      this.moveBy(0, 0, -minY);
    }
    if (maxY > 19) {
      this.moveBy(0, 0, 19 - maxY);
    }
  }
  // whether the entire MT is within the bounds of the board
  isInBounds() {
    return this.getCurrentBlockSet().blocks.every((block) => block.inBounds());
  }
  // whether the entire MT is within the bounds of the board, but ignores if out of top bounds
  isInBoundsIgnoreTop() {
    return this.getCurrentBlockSet().blocks.every((block) => block.x >= 0 && block.x < 10 && block.y < 20);
  }
  // Whether one of the minos of this tetromino is a the given position
  isAtLocation(x, y) {
    return this.getCurrentBlockSet().blocks.some((block) => block.x === x && block.y === y);
  }
  // blit each block of the tetromino into the board with the tetromino's color
  blitToBoard(board) {
    const blockSet = this.getCurrentBlockSet();
    blockSet.blocks.forEach((block) => {
      board.setAt(block.x, block.y, this.color);
    });
  }
  unblitFromBoard(board) {
    const blockSet = this.getCurrentBlockSet();
    blockSet.blocks.forEach((block) => {
      if (!board.exists(block.x, block.y)) {
        throw new Error(`Block at ${block.x}, ${block.y} does not exist in board`);
      }
      board.setAt(block.x, block.y, 0 /* EMPTY */);
    });
  }
  intersectsBoard(board) {
    return this.getCurrentBlockSet().blocks.some((block) => board.exists(block.x, block.y));
  }
  // placement is valid if the piece is in bounds, and does not intersect with the grid, 
  // but moving the piece down one row would intersect with the grid
  isValidPlacement(board) {
    if (!this.isInBoundsIgnoreTop()) return false;
    if (this.intersectsBoard(board)) return false;
    const movedMT = new _MoveableTetromino(this.tetrominoType, this.rotation, this.translateX, this.translateY + 1);
    return !movedMT.isInBounds() || movedMT.intersectsBoard(board);
  }
  // whether the two MTs are the same type and  at the exact same pose
  equals(other) {
    if (this.tetrominoType !== other.tetrominoType) return false;
    if (this.rotation !== other.rotation) return false;
    if (this.translateX !== other.translateX) return false;
    if (this.translateY !== other.translateY) return false;
    return true;
  }
  // return in tetris notation
  getTetrisNotation() {
    let string = "" + TETROMINO_CHAR[this.tetrominoType] + "-";
    const columns = [];
    this.getCurrentBlockSet().blocks.forEach((block) => {
      if (!columns.includes(block.x)) {
        columns.push(block.x);
      }
    });
    columns.sort((a, b) => a - b);
    columns.forEach((column) => {
      if (column === 9) string += "0";
      else string += column + 1;
    });
    return string;
  }
  print() {
    const mask = new TetrisBoard();
    this.blitToBoard(mask);
    console.log(this.getTetrisNotation());
    mask.print();
  }
};

// ../../shared/tetris/tetris-board.ts
var ColorType = /* @__PURE__ */ ((ColorType2) => {
  ColorType2[ColorType2["EMPTY"] = 0] = "EMPTY";
  ColorType2[ColorType2["PRIMARY"] = 1] = "PRIMARY";
  ColorType2[ColorType2["SECONDARY"] = 2] = "SECONDARY";
  ColorType2[ColorType2["WHITE"] = 3] = "WHITE";
  return ColorType2;
})(ColorType || {});
function getRandomColorType() {
  return Math.floor(Math.random() * 3) + 1;
}
var TetrisBoard = class _TetrisBoard {
  // initialize the grid to be empty
  constructor() {
    // 20 rows, 10 columns
    __publicField(this, "grid", []);
    for (let y = 0; y < 20; y++) {
      this.grid.push([]);
      for (let x = 0; x < 10; x++) {
        this.grid[y].push(0 /* EMPTY */);
      }
    }
  }
  static random() {
    const board = new _TetrisBoard();
    for (let y = 10; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        if (Math.random() < 0.5) board.setAt(x, y, getRandomColorType());
      }
    }
    return board;
  }
  // set the color of a cell at a given row and column
  setAt(x, y, color) {
    if (x < 0 || x >= 10 || y < 0 || y >= 20) {
      return;
    }
    this.grid[y][x] = color;
  }
  // get the color of a cell at a given row and column
  getAt(x, y) {
    return this.grid[y][x];
  }
  // whether block at (x,y) exists
  exists(x, y) {
    if (x < 0 || x >= 10 || y < 0 || y >= 20) {
      return false;
    }
    return this.getAt(x, y) != 0 /* EMPTY */;
  }
  // count the number of tetrominos in the board
  count() {
    let count = 0;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        if (this.exists(x, y)) count++;
      }
    }
    return count;
  }
  isRowFull(y) {
    return this.grid[y].every((cell) => cell !== 0 /* EMPTY */);
  }
  isRowEmpty(y) {
    return this.grid[y].every((cell) => cell === 0 /* EMPTY */);
  }
  // modifies grid in place to delete line clears, and returns the number of lines cleared
  processLineClears() {
    let y = 19;
    let numLinesCleared = 0;
    while (y >= 0) {
      if (this.isRowFull(y)) {
        this.grid.splice(y, 1);
        numLinesCleared++;
      }
      y--;
    }
    for (let i = 0; i < numLinesCleared; i++) {
      this.grid.unshift(new Array(10).fill(0 /* EMPTY */));
    }
    return numLinesCleared;
  }
  getLineClearRows() {
    const rows = [];
    for (let y = 0; y < 20; y++) {
      if (this.isRowFull(y)) {
        rows.push(y);
      }
    }
    return rows;
  }
  // make a copy of the grid
  copy() {
    const grid = new _TetrisBoard();
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        grid.setAt(x, y, this.getAt(x, y));
      }
    }
    return grid;
  }
  equals(other) {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        if (this.getAt(x, y) !== other.getAt(x, y)) {
          return false;
        }
      }
    }
    return true;
  }
  equalsIgnoreColor(other) {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        if (this.exists(x, y) !== other.exists(x, y)) {
          return false;
        }
      }
    }
    return true;
  }
  // print 20x10 grid with the color numbers
  print() {
    let str = "";
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        str += "" + this.getAt(x, y) + " ";
      }
      str += "\n";
    }
    console.log(str);
  }
  // Generator to iterate through all cells in the grid
  *iterateMinos() {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        yield { x, y, color: this.getAt(x, y) };
      }
    }
  }
  /**
   * Create a new board that is equal to board1 - board2. If the perfect flag is set, null will be returned
   * instead if a mino that exists on board2 does not exist on board1. Otherwise, a mino that exists on board2
   * subtracting from an empty cell on board1 will do nothing.
   * @param board1 The board to subtract from
   * @param board2 The board to subtract
   * @param perfect If true, return null if a mino that exists on board2 does not exist on board1
   * @returns A new board that is equal to board1 - board2
   */
  static subtract(board1, board2, perfect) {
    const newBoard = new _TetrisBoard();
    for (let { x, y, color } of board1.iterateMinos()) {
      const color2 = board2.getAt(x, y);
      if (color2 === 0 /* EMPTY */) {
        newBoard.setAt(x, y, color);
      } else {
        if (color === 0 /* EMPTY */) {
          if (perfect) {
            return null;
          }
        } else {
          newBoard.setAt(x, y, 0 /* EMPTY */);
        }
      }
    }
    return newBoard;
  }
  /**
   * Get the list of all connected components on the board as a list of TetrisBoard objects. A connected
   * component is a group of cells that are connected to each other through vertical or horizontal adjacency.
   * @returns A list of TetrisBoard objects, each representing a connected component
   */
  extractAllConnectedComponents() {
    const visited = /* @__PURE__ */ new Set();
    const components = [];
    const isInBounds = (x, y) => {
      return x >= 0 && x < 10 && y >= 0 && y < 20;
    };
    const getKey = (x, y) => {
      return `${x},${y}`;
    };
    const directions = [
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: -1, dy: 0 }
    ];
    const bfs = (startX, startY) => {
      const queue = [{ x: startX, y: startY }];
      const component = new _TetrisBoard();
      component.setAt(startX, startY, this.getAt(startX, startY));
      visited.add(getKey(startX, startY));
      while (queue.length > 0) {
        const { x, y } = queue.shift();
        for (const { dx, dy } of directions) {
          const newX = x + dx;
          const newY = y + dy;
          if (isInBounds(newX, newY) && !visited.has(getKey(newX, newY)) && this.exists(newX, newY)) {
            queue.push({ x: newX, y: newY });
            visited.add(getKey(newX, newY));
            component.setAt(newX, newY, this.getAt(newX, newY));
          }
        }
      }
      return component;
    };
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        if (this.exists(x, y) && !visited.has(getKey(x, y))) {
          const component = bfs(x, y);
          components.push(component);
        }
      }
    }
    return components;
  }
  /**
   * Attempt to find the active piece as a seperate entity from the rest of the board
   * @returns the seperated board and piece, or null if a valid seperation is not found
   */
  seperateBoardAndPiece() {
    const cc = this.extractAllConnectedComponents();
    let piece = void 0;
    for (const component of cc) {
      const maybePiece = MoveableTetromino.extractFromTetrisBoard(component);
      if (piece && maybePiece) return null;
      if (maybePiece) piece = maybePiece;
    }
    if (!piece) return null;
    const pieceBoard = new _TetrisBoard();
    piece.blitToBoard(pieceBoard);
    const remainingBoard = _TetrisBoard.subtract(this, pieceBoard, true);
    if (!remainingBoard) throw Error(`Logic error, cannot subtract piece from remaining board`);
    return [piece, remainingBoard];
  }
  getAverageHeight() {
    let totalHeight = 0;
    const numColumns = 9;
    for (let x = 0; x < numColumns; x++) {
      for (let y = 0; y < 20; y++) {
        if (this.exists(x, y)) {
          totalHeight += 20 - y;
          break;
        }
      }
    }
    return totalHeight / numColumns;
  }
  isRightWellOpen() {
    for (let y = 0; y < 20; y++) {
      if (this.exists(9, y)) {
        return false;
      }
    }
    return true;
  }
};

// ../../shared/network/tetris-board-transcoding/buffer-transcoder.ts
var BufferTranscoder = class {
  // Return a Uint8Array of 50 bytes
  static encode(board) {
    const bytes = new Uint8Array(50);
    let byteIndex = 0;
    let bitIndex = 0;
    let value = 0;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        const color = board.getAt(x, y);
        value |= color << 6 - bitIndex;
        bitIndex += 2;
        if (bitIndex === 8) {
          bytes[byteIndex++] = value;
          bitIndex = 0;
          value = 0;
        }
      }
    }
    return bytes;
  }
  static decode(encoded) {
    const board = new TetrisBoard();
    let byteIndex = 0;
    let bitIndex = 0;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        if (bitIndex === 8) {
          byteIndex++;
          bitIndex = 0;
        }
        const byte = encoded[byteIndex];
        const color = byte >> 6 - bitIndex & 3;
        board.setAt(x, y, color);
        bitIndex += 2;
      }
    }
    return board;
  }
};

// ../../shared/scripts/base62-encoder.ts
var Base62Encoder = class {
  // Encodes a Uint8Array into a base-62 alphanumeric string.
  static encode(input) {
    let output = "";
    let num = BigInt("0x" + [...input].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
    while (num > 0) {
      const remainder = num % BigInt(62);
      output = this.charset[Number(remainder)] + output;
      num = num / BigInt(62);
    }
    const lengthPrefix = this.encodeBase62(input.length, 4);
    return lengthPrefix + output;
  }
  // Helper function to encode a number into a base-62 string with a fixed length
  static encodeBase62(value, length) {
    let result = "";
    let num = BigInt(value);
    while (num > 0) {
      const remainder = num % BigInt(62);
      result = this.charset[Number(remainder)] + result;
      num = num / BigInt(62);
    }
    return result.padStart(length, "0");
  }
  // Decodes a base-62 alphanumeric string back into a Uint8Array.
  static decode(input) {
    const lengthPrefix = input.slice(0, 4);
    const encodedData = input.slice(4);
    const byteLength = this.decodeBase62(lengthPrefix);
    let num = BigInt(0);
    for (let char of encodedData) {
      num = num * BigInt(62) + BigInt(this.charset.indexOf(char));
    }
    const hexString = num.toString(16).padStart(byteLength * 2, "0");
    const byteArray = new Uint8Array(byteLength);
    for (let i = 0; i < byteLength; i++) {
      byteArray[i] = parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
    }
    return byteArray;
  }
  // Helper function to decode a base-62 string back into a number
  static decodeBase62(input) {
    let result = BigInt(0);
    for (let char of input) {
      result = result * BigInt(62) + BigInt(this.charset.indexOf(char));
    }
    return Number(result);
  }
};
__publicField(Base62Encoder, "charset", "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz");

// ../../shared/puzzles/encode-puzzle.ts
function encodePuzzle(board, current, next) {
  const encodedBoard = BufferTranscoder.encode(board);
  const puzzleData = new Uint8Array(2 + encodedBoard.length);
  puzzleData[0] = current;
  puzzleData[1] = next;
  puzzleData.set(encodedBoard, 2);
  const encodedPuzzle = Base62Encoder.encode(puzzleData);
  return encodedPuzzle;
}
function decodePuzzle(encodedPuzzle) {
  const puzzleData = Base62Encoder.decode(encodedPuzzle);
  const current = puzzleData[0];
  const next = puzzleData[1];
  const board = BufferTranscoder.decode(puzzleData.subarray(2));
  return { board, current, next };
}

// ../../shared/puzzles/puzzle-theme.ts
var PuzzleTheme = /* @__PURE__ */ ((PuzzleTheme2) => {
  PuzzleTheme2["CLEAN"] = "CLEAN";
  PuzzleTheme2["OVERHANG"] = "OVERHANG";
  PuzzleTheme2["BURN"] = "BURN";
  PuzzleTheme2["DIG"] = "DIG";
  PuzzleTheme2["SPIRE"] = "SPIRE";
  return PuzzleTheme2;
})(PuzzleTheme || {});
var PUZZLE_THEME_TEXT = {
  ["CLEAN" /* CLEAN */]: "Stacking",
  ["OVERHANG" /* OVERHANG */]: "Overhangs",
  ["BURN" /* BURN */]: "Burns",
  ["DIG" /* DIG */]: "Digging",
  ["SPIRE" /* SPIRE */]: "Spires"
};
export {
  ColorType,
  MoveableTetromino,
  PUZZLE_THEME_TEXT,
  PuzzleTheme,
  TetrisBoard,
  Tetromino,
  TetrominoType,
  decodePuzzle,
  encodePuzzle,
  getColorForLevel,
  getColorTypeForTetromino
};
