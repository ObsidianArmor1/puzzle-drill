// Scores one exact (first, second) placement pair the way StackRabbit's getTopMoveList scores its top moves:
//   immediate line-clear reward of both placements + getPlayoutScore(board after both, ..., second piece).
// Built on the pinned engine source (included unmodified). Used by Puzzle Drill to rate a player's move that isn't
// in the engine's top 5.
//   request: "<200-char board>|<level>|<lines>|<cur>|<next>|<timeline>|<playoutCount>|<playoutLength>|"
//   first / second: the placements' cells, "x,y x,y x,y x,y" (board coordinates, row 0 at the top)
// Returns JSON: {"score":<float>,"reachable":true|false} or {"error":"..."}.
// Build with -DPINNED_SRC='"<path to StackRabbit at nestris.org's pinned commit 86a4bfc>/src/cpp_modules/src/main.cpp"'
#ifndef PINNED_SRC
#error "Define PINNED_SRC as the path to the pinned StackRabbit main.cpp"
#endif
#include PINNED_SRC
#include <set>
#include <sstream>
#include <iostream>

static std::set<std::pair<int, int>> parseCells(const std::string &s) {
  std::set<std::pair<int, int>> out;
  std::stringstream ss(s); std::string tok;
  while (ss >> tok) { auto c = tok.find(','); if (c != std::string::npos) out.insert({atoi(tok.substr(0, c).c_str()), atoi(tok.substr(c + 1).c_str())}); }
  return out;
}
static std::set<std::pair<int, int>> cellsOf(const Piece *p, int x, int y, int rot) {
  std::set<std::pair<int, int>> out;
  for (int r = 0; r < 4; r++) {
    int row = p->rowsByRotation[rot][r];
    if (row == 0 || row == NONE) continue;
    unsigned int bits = SHIFTBY(row, x);
    for (int c = 0; c < 10; c++) if (bits & (1u << (9 - c))) out.insert({c, y + r});
  }
  return out;
}
/** Engine (x, y, rot) whose cells equal `want`, or x = NONE. */
static LockLocation locate(const Piece *p, const std::set<std::pair<int, int>> &want) {
  for (int rot = 0; rot < 4; rot++) {
    if (p->rowsByRotation[rot][0] == NONE) continue;
    for (int x = -3; x < 11; x++) for (int y = -3; y < 21; y++) {
      if (y > p->maxYByRotation[rot]) continue;
      if (X_BOUNDS_COLLISION_TABLE[p->index][rot][x + X_BOUNDS_COLLISION_TABLE_OFFSET]) continue;
      if (cellsOf(p, x, y, rot) == want) return {x, y, rot};
    }
  }
  return {NONE, NONE, NONE};
}

std::string scorePair(std::string req, std::string firstCells, std::string secondCells) {
  // ---- same setup as mainProcess (pinned main.cpp) ----
  GameState gs = {{}, {}, 0, 0, 0, 0, false};
  const Piece *cur = NULL, *next = NULL;
  int playoutCount = DEFAULT_PLAYOUT_COUNT, playoutLength = DEFAULT_PLAYOUT_LENGTH;
  std::string timeline;
  if (req.size() < 201) return "{\"error\":\"bad request\"}";
  std::string rest = req.substr(201);
  size_t start = 0, end = rest.find('|');
  for (int i = 0; end != std::string::npos; i++) {
    std::string arg = rest.substr(start, end - start);
    int v = atoi(arg.c_str());
    if (i == 0) gs.level = v; else if (i == 1) gs.lines = v;
    else if (i == 2) cur = &PIECE_LIST[v]; else if (i == 3) next = &PIECE_LIST[v];
    else if (i == 4) timeline = arg; else if (i == 5) playoutCount = v; else if (i == 6) playoutLength = v;
    else if (i == 8) gs.disableTuck = v == 1;
    start = end + 1; end = rest.find('|', start);
  }
  if (!cur || !next) return "{\"error\":\"missing pieces\"}";
  encodeBoard(req.c_str(), gs.board);
  getSurfaceArray(gs.board, gs.surfaceArray);
  auto r1 = updateSurfaceAndHoles(gs.surfaceArray, gs.board, 9, false, gs.disableTuck);
  gs.numTrueHoles = r1.first; gs.numPartialHoles = r1.second;
  const PieceRangeContext ctx[4] = {
    getPieceRangeContext(timeline.c_str(), 1, true), getPieceRangeContext(timeline.c_str(), 1, false),
    getPieceRangeContext(timeline.c_str(), 2, false), getPieceRangeContext(timeline.c_str(), 3, false),
  };
  const EvalContext context = getEvalContext(gs, ctx);
  auto r2 = updateSurfaceAndHoles(gs.surfaceArray, gs.board, context.countWellHoles ? -1 : context.wellColumn, context.aiMode == DIG, gs.disableTuck);
  gs.numTrueHoles = r2.first; gs.numPartialHoles = r2.second;

  // ---- find the pair among the engine's own two-piece search ----
  LockLocation a = locate(cur, parseCells(firstCells));
  if (a.x == NONE) return "{\"error\":\"first placement doesn't match the current piece\"}";
  // Board after the first placement, to locate the second (line clears shift it)
  LockLocation b = locate(next, parseCells(secondCells));
  if (b.x == NONE) return "{\"error\":\"second placement doesn't match the next piece\"}";
  std::list<Possibility> all;
  searchDepth2(gs, cur, next, 999999, &context, all);
  for (auto &p : all) {
    if (lockLocationEquals(p.firstPlacement, a) && lockLocationEquals(p.secondPlacement, b)) {
      float score = p.immediateReward + getPlayoutScore(p.resultingState, playoutCount, playoutLength, ctx, next->index, NULL);
      return string_format("{\"score\":%.2f,\"reachable\":true}", score);
    }
  }
  // Not in the engine's reachable set (e.g. a move its move search can't find): score it directly
  LockPlacement pa = {a.x, a.y, a.rotationIndex, -1, 'X', cur};
  GameState afterA = advanceGameState(gs, pa, &context);
  LockPlacement pb = {b.x, b.y, b.rotationIndex, -1, 'X', next};
  GameState afterB = advanceGameState(afterA, pb, &context);
  float reward = getLineClearFactor(afterA.lines - gs.lines, context.weights, context.shouldRewardLineClears)
               + getLineClearFactor(afterB.lines - afterA.lines, context.weights, context.shouldRewardLineClears);
  float score = reward + getPlayoutScore(afterB, playoutCount, playoutLength, ctx, next->index, NULL);
  return string_format("{\"score\":%.2f,\"reachable\":false}", score);
}

#ifdef __EMSCRIPTEN__
#undef NONE
#include <emscripten/bind.h>
EMSCRIPTEN_BINDINGS(ratepair) { emscripten::function("scorePair", &scorePair); }
#else
int main() { // stdin: request \t firstCells \t secondCells   (one per line) -> JSON line
  std::string line;
  while (std::getline(std::cin, line)) {
    auto t1 = line.find('\t'), t2 = line.find('\t', t1 + 1);
    std::cout << scorePair(line.substr(0, t1), line.substr(t1 + 1, t2 - t1 - 1), line.substr(t2 + 1)) << std::endl;
  }
}
#endif
