/* ==========================================================
   TWO PLAYER CHESS GAME IN VANILLA JAVASCRIPT
   ----------------------------------------------------------
   This file contains the full logic of the game:
   - Board creation
   - Piece movement rules
   - Turn handling
   - Check / checkmate / stalemate detection
   - Castling
   - En passant
   - Pawn promotion
   - Undo feature
   - Auto-save / crash recovery
   ========================================================== */

// Unicode characters for drawing chess pieces on the board.
const PIECE_SYMBOLS = {
  wp: "♙",
  wr: "♖",
  wn: "♘",
  wb: "♗",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  br: "♜",
  bn: "♞",
  bb: "♝",
  bq: "♛",
  bk: "♚",
};

// Human-friendly piece names for messages.
const PIECE_NAMES = {
  p: "Pawn",
  r: "Rook",
  n: "Knight",
  b: "Bishop",
  q: "Queen",
  k: "King",
};

// Files are the letters a-h used in chess notation.
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// Browser storage keys used to recover the game after a crash or refresh.
const STORAGE_KEYS = {
  lastStable: "js_chess_last_stable_state",
  moveBackup: "js_chess_pre_move_backup",
};

// Cache DOM elements once so we can reuse them easily.
const boardElement = document.getElementById("board");
const turnDisplay = document.getElementById("turnDisplay");
const statusDisplay = document.getElementById("statusDisplay");
const selectedDisplay = document.getElementById("selectedDisplay");
const moveHistoryElement = document.getElementById("moveHistory");
const resetBtn = document.getElementById("resetBtn");
const undoBtn = document.getElementById("undoBtn");

// Main game state object.
let gameState = loadSavedGameState() || createInitialGameState();

// Start the page by drawing the board and attaching button actions.
renderGame();
saveLastStableState();
resetBtn.addEventListener("click", resetGame);
undoBtn.addEventListener("click", undoMove);

// Save one more time if the user refreshes or closes the page.
window.addEventListener("beforeunload", saveLastStableState);

/* ------------------------------
   Game setup functions
   ------------------------------ */

// Creates the full starting state of a chess game.
function createInitialGameState() {
  return {
    board: createInitialBoard(), // 8x8 board with starting positions.
    currentPlayer: "w", // White starts first in chess.
    selectedSquare: null, // No square selected at the start.
    legalMoves: [], // No legal moves highlighted at the start.
    statusMessage: "Game started. White to move.",
    moveHistory: [], // Visible move list for the UI.
    historySnapshots: [], // Lightweight snapshots used for undo.
    enPassantTarget: null, // Square available for en passant capture.
    castlingRights: {
      w: { kingSide: true, queenSide: true },
      b: { kingSide: true, queenSide: true },
    },
    gameOver: false,
  };
}

// Creates the chess board array with standard starting positions.
function createInitialBoard() {
  return [
    ["br", "bn", "bb", "bq", "bk", "bb", "bn", "br"],
    ["bp", "bp", "bp", "bp", "bp", "bp", "bp", "bp"],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ["wp", "wp", "wp", "wp", "wp", "wp", "wp", "wp"],
    ["wr", "wn", "wb", "wq", "wk", "wb", "wn", "wr"],
  ];
}

/* ------------------------------
   Rendering functions
   ------------------------------ */

// Rebuilds the full UI whenever the game changes.
function renderGame() {
  renderBoard();
  renderMoveHistory();
  renderInfoPanel();
}

// Draws the 8x8 chess board.
function renderBoard() {
  boardElement.innerHTML = "";

  const checkedKing = findKingInCheck(gameState.board, gameState.currentPlayer);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement("div");
      const piece = gameState.board[row][col];
      const isLightSquare = (row + col) % 2 === 0;
      const squareNotation = toSquareNotation(row, col);

      square.className = `square ${isLightSquare ? "light" : "dark"}`;
      square.dataset.row = row;
      square.dataset.col = col;
      square.setAttribute("role", "button");
      square.setAttribute("aria-label", squareNotation);

      // Highlight the currently selected piece.
      if (
        gameState.selectedSquare &&
        gameState.selectedSquare.row === row &&
        gameState.selectedSquare.col === col
      ) {
        square.classList.add("selected");
      }

      // Mark the current player's king in red if that king is in check.
      if (checkedKing && checkedKing.row === row && checkedKing.col === col) {
        square.classList.add("check");
      }

      // Add piece symbol if there is a piece on this square.
      if (piece) {
        square.textContent = PIECE_SYMBOLS[piece];
      }

      // Show available moves for the selected piece.
      const matchingMove = gameState.legalMoves.find(
        (move) => move.to.row === row && move.to.col === col
      );

      if (matchingMove) {
        if (piece) {
          square.classList.add("capture-highlight");
        } else {
          const dot = document.createElement("div");
          dot.className = "move-dot";
          square.appendChild(dot);
        }
      }

      // Add coordinate labels on the edges to make the board look polished.
      if (row === 7) {
        const fileLabel = document.createElement("span");
        fileLabel.className = "square-label file-label";
        fileLabel.textContent = FILES[col];
        square.appendChild(fileLabel);
      }

      if (col === 0) {
        const rankLabel = document.createElement("span");
        rankLabel.className = "square-label rank-label";
        rankLabel.textContent = 8 - row;
        square.appendChild(rankLabel);
      }

      // Clicking a square either selects a piece or performs a move.
      square.addEventListener("click", () => safeHandleSquareClick(row, col));
      boardElement.appendChild(square);
    }
  }
}

// Updates text values like turn, status, and selected piece.
function renderInfoPanel() {
  turnDisplay.textContent = gameState.currentPlayer === "w" ? "White" : "Black";
  statusDisplay.textContent = gameState.statusMessage;

  if (!gameState.selectedSquare) {
    selectedDisplay.textContent = "None";
    return;
  }

  const piece = gameState.board[gameState.selectedSquare.row][gameState.selectedSquare.col];
  if (!piece) {
    selectedDisplay.textContent = "None";
    return;
  }

  const colorName = piece[0] === "w" ? "White" : "Black";
  const pieceName = PIECE_NAMES[piece[1]];
  selectedDisplay.textContent = `${colorName} ${pieceName} (${toSquareNotation(
    gameState.selectedSquare.row,
    gameState.selectedSquare.col
  )})`;
}

// Redraws the move history list on the right panel.
function renderMoveHistory() {
  moveHistoryElement.innerHTML = "";

  if (gameState.moveHistory.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "No moves yet.";
    moveHistoryElement.appendChild(emptyItem);
    return;
  }

  gameState.moveHistory.forEach((moveText) => {
    const item = document.createElement("li");
    item.textContent = moveText;
    moveHistoryElement.appendChild(item);
  });
}

/* ------------------------------
   User interaction
   ------------------------------ */

// Wrap click handling so unexpected errors do not permanently break the game.
function safeHandleSquareClick(row, col) {
  try {
    handleSquareClick(row, col);
  } catch (error) {
    console.error("Chess game error while handling click:", error);
    restoreLastStableState("The game recovered from an error and restored the last saved move.");
  }
}

// Handles what happens when a user clicks any square.
function handleSquareClick(row, col) {
  if (gameState.gameOver) {
    return;
  }

  const clickedPiece = gameState.board[row][col];
  const selected = gameState.selectedSquare;

  // If a piece is already selected, first check if the click is a legal move.
  if (selected) {
    const chosenMove = gameState.legalMoves.find(
      (move) => move.to.row === row && move.to.col === col
    );

    if (chosenMove) {
      makeMove(chosenMove);
      return;
    }
  }

  // If the clicked square has a piece belonging to the current player, select it.
  if (clickedPiece && clickedPiece[0] === gameState.currentPlayer) {
    gameState.selectedSquare = { row, col };
    gameState.legalMoves = getLegalMovesForPiece(gameState.board, row, col, gameState);
    gameState.statusMessage = `${gameState.currentPlayer === "w" ? "White" : "Black"} selected ${
      PIECE_NAMES[clickedPiece[1]]
    } on ${toSquareNotation(row, col)}.`;
    renderGame();
    saveLastStableState();
    return;
  }

  // Otherwise clear selection.
  gameState.selectedSquare = null;
  gameState.legalMoves = [];
  gameState.statusMessage = `${gameState.currentPlayer === "w" ? "White" : "Black"} to move.`;
  renderGame();
  saveLastStableState();
}

/* ------------------------------
   Move execution
   ------------------------------ */

// Applies a move to the board and updates all game state.
function makeMove(move) {
  try {
    // Store a lightweight snapshot only.
    gameState.historySnapshots.push(createSnapshot(gameState));

    // Save a backup before changing the position, so crash recovery can roll back one move safely.
    savePreMoveBackup();

    const board = gameState.board;
    const movingPiece = board[move.from.row][move.from.col];
    const targetPiece = board[move.to.row][move.to.col];

    if (!movingPiece) {
      throw new Error("Tried to move a piece from an empty square.");
    }

    const movingColor = movingPiece[0];
    const opponentColor = movingColor === "w" ? "b" : "w";

    // Reset en passant target before setting a new one if needed.
    gameState.enPassantTarget = null;

    // Handle en passant capture.
    if (move.special === "en-passant") {
      const capturedPawnRow = movingColor === "w" ? move.to.row + 1 : move.to.row - 1;
      board[capturedPawnRow][move.to.col] = null;
    }

    // Move the piece to its new square.
    board[move.to.row][move.to.col] = movingPiece;
    board[move.from.row][move.from.col] = null;

    // Handle castling rook movement.
    if (move.special === "castle-king-side") {
      board[move.to.row][5] = board[move.to.row][7];
      board[move.to.row][7] = null;
    }

    if (move.special === "castle-queen-side") {
      board[move.to.row][3] = board[move.to.row][0];
      board[move.to.row][0] = null;
    }

    // Handle pawn promotion when pawn reaches final row.
    if (move.special === "promotion") {
      const selectedPromotion = prompt(
        "Promote pawn to: q (Queen), r (Rook), b (Bishop), n (Knight)",
        "q"
      );
      const promotionPiece = ["q", "r", "b", "n"].includes((selectedPromotion || "q").toLowerCase())
        ? (selectedPromotion || "q").toLowerCase()
        : "q";
      board[move.to.row][move.to.col] = `${movingColor}${promotionPiece}`;
      move.promotionChoice = promotionPiece;
    }

    // If a pawn moved two squares, remember its landing square for en passant.
    if (movingPiece[1] === "p" && Math.abs(move.from.row - move.to.row) === 2) {
      gameState.enPassantTarget = {
        row: (move.from.row + move.to.row) / 2,
        col: move.from.col,
      };
    }

    // Update castling rights if king or rook moves.
    updateCastlingRightsAfterMove(movingPiece, move.from);

    // Update castling rights if a rook gets captured on its starting square.
    if (targetPiece) {
      updateCastlingRightsAfterCapture(targetPiece, move.to);
    }

    // Reset selection after move.
    gameState.selectedSquare = null;
    gameState.legalMoves = [];

    // Create readable move text for move history.
    const moveText = buildMoveText(move, movingPiece, targetPiece);
    gameState.moveHistory.push(moveText);

    // Change turn.
    gameState.currentPlayer = opponentColor;

    // Check the new game state after the move.
    const isCheck = isKingInCheck(gameState.board, gameState.currentPlayer, gameState);
    const hasAnyLegalMove = playerHasAnyLegalMove(gameState.board, gameState.currentPlayer, gameState);

    if (isCheck && !hasAnyLegalMove) {
      gameState.gameOver = true;
      gameState.statusMessage = `Checkmate! ${movingColor === "w" ? "White" : "Black"} wins.`;
    } else if (!isCheck && !hasAnyLegalMove) {
      gameState.gameOver = true;
      gameState.statusMessage = "Stalemate! The game is a draw.";
    } else if (isCheck) {
      gameState.statusMessage = `${gameState.currentPlayer === "w" ? "White" : "Black"} is in check.`;
    } else {
      gameState.statusMessage = `${gameState.currentPlayer === "w" ? "White" : "Black"} to move.`;
    }

    // Make sure the final state is structurally valid before saving it.
    if (!isValidGameState(gameState)) {
      throw new Error("Game state became invalid after the move.");
    }

    renderGame();
    saveLastStableState();
  } catch (error) {
    console.error("Chess game error while making move:", error);
    restoreLastStableState("The move caused an error, so the game was restored to the last valid position.");
  }
}

// Resets the game back to the starting position.
function resetGame() {
  gameState = createInitialGameState();
  clearSavedGameState();
  renderGame();
  saveLastStableState();
}

// Restores the previous saved position.
function undoMove() {
  if (gameState.historySnapshots.length === 0) {
    gameState.statusMessage = "Nothing to undo.";
    renderGame();
    saveLastStableState();
    return;
  }

  gameState = gameState.historySnapshots.pop();
  gameState.statusMessage = "Previous move undone.";
  renderGame();
  saveLastStableState();
}

/* ------------------------------
   Legal move generation
   ------------------------------ */

// Returns all legal moves for one selected piece.
function getLegalMovesForPiece(board, row, col, state) {
  const piece = board[row][col];
  if (!piece) return [];

  const pseudoMoves = getPseudoLegalMoves(board, row, col, state);

  // Filter out moves that would leave the moving side's own king in check.
  return pseudoMoves.filter((move) => !wouldMoveLeaveKingInCheck(board, move, state));
}

// Returns all possible moves for a piece before king safety filtering.
function getPseudoLegalMoves(board, row, col, state) {
  const piece = board[row][col];
  if (!piece) return [];

  const color = piece[0];
  const type = piece[1];

  switch (type) {
    case "p":
      return getPawnMoves(board, row, col, color, state);
    case "r":
      return getSlidingMoves(board, row, col, color, [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]);
    case "b":
      return getSlidingMoves(board, row, col, color, [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]);
    case "q":
      return getSlidingMoves(board, row, col, color, [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]);
    case "n":
      return getKnightMoves(board, row, col, color);
    case "k":
      return getKingMoves(board, row, col, color, state);
    default:
      return [];
  }
}

// Pawn move rules including forward movement, capture, en passant, and promotion.
function getPawnMoves(board, row, col, color, state) {
  const moves = [];
  const direction = color === "w" ? -1 : 1;
  const startRow = color === "w" ? 6 : 1;
  const promotionRow = color === "w" ? 0 : 7;

  // Move one square forward if empty.
  const oneForwardRow = row + direction;
  if (isInsideBoard(oneForwardRow, col) && !board[oneForwardRow][col]) {
    moves.push({
      from: { row, col },
      to: { row: oneForwardRow, col },
      special: oneForwardRow === promotionRow ? "promotion" : null,
    });

    // Move two squares from starting row if both squares are empty.
    const twoForwardRow = row + direction * 2;
    if (row === startRow && !board[twoForwardRow][col]) {
      moves.push({
        from: { row, col },
        to: { row: twoForwardRow, col },
        special: null,
      });
    }
  }

  // Diagonal captures and en passant.
  for (const colOffset of [-1, 1]) {
    const captureRow = row + direction;
    const captureCol = col + colOffset;

    if (!isInsideBoard(captureRow, captureCol)) continue;

    const targetPiece = board[captureRow][captureCol];

    // Normal capture.
    if (targetPiece && targetPiece[0] !== color) {
      moves.push({
        from: { row, col },
        to: { row: captureRow, col: captureCol },
        special: captureRow === promotionRow ? "promotion" : null,
      });
    }

    // En passant capture.
    if (
      state.enPassantTarget &&
      state.enPassantTarget.row === captureRow &&
      state.enPassantTarget.col === captureCol
    ) {
      moves.push({
        from: { row, col },
        to: { row: captureRow, col: captureCol },
        special: "en-passant",
      });
    }
  }

  return moves;
}

// Shared movement logic for rook, bishop, and queen.
function getSlidingMoves(board, row, col, color, directions) {
  const moves = [];

  for (const [rowStep, colStep] of directions) {
    let newRow = row + rowStep;
    let newCol = col + colStep;

    while (isInsideBoard(newRow, newCol)) {
      const targetPiece = board[newRow][newCol];

      if (!targetPiece) {
        moves.push({
          from: { row, col },
          to: { row: newRow, col: newCol },
          special: null,
        });
      } else {
        if (targetPiece[0] !== color) {
          moves.push({
            from: { row, col },
            to: { row: newRow, col: newCol },
            special: null,
          });
        }
        break;
      }

      newRow += rowStep;
      newCol += colStep;
    }
  }

  return moves;
}

// Knight movement in L-shapes.
function getKnightMoves(board, row, col, color) {
  const moves = [];
  const jumps = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];

  for (const [rowOffset, colOffset] of jumps) {
    const newRow = row + rowOffset;
    const newCol = col + colOffset;

    if (!isInsideBoard(newRow, newCol)) continue;

    const targetPiece = board[newRow][newCol];
    if (!targetPiece || targetPiece[0] !== color) {
      moves.push({
        from: { row, col },
        to: { row: newRow, col: newCol },
        special: null,
      });
    }
  }

  return moves;
}

// King movement including castling.
function getKingMoves(board, row, col, color, state) {
  const moves = [];

  // Standard king moves: one square in any direction.
  for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
    for (let colOffset = -1; colOffset <= 1; colOffset++) {
      if (rowOffset === 0 && colOffset === 0) continue;

      const newRow = row + rowOffset;
      const newCol = col + colOffset;
      if (!isInsideBoard(newRow, newCol)) continue;

      const targetPiece = board[newRow][newCol];
      if (!targetPiece || targetPiece[0] !== color) {
        moves.push({
          from: { row, col },
          to: { row: newRow, col: newCol },
          special: null,
        });
      }
    }
  }

  // Castling rules.
  const homeRow = color === "w" ? 7 : 0;

  // King-side castling.
  if (
    row === homeRow &&
    col === 4 &&
    state.castlingRights[color].kingSide &&
    !board[homeRow][5] &&
    !board[homeRow][6] &&
    !isSquareUnderAttack(board, homeRow, 4, oppositeColor(color), state) &&
    !isSquareUnderAttack(board, homeRow, 5, oppositeColor(color), state) &&
    !isSquareUnderAttack(board, homeRow, 6, oppositeColor(color), state) &&
    board[homeRow][7] === `${color}r`
  ) {
    moves.push({
      from: { row, col },
      to: { row: homeRow, col: 6 },
      special: "castle-king-side",
    });
  }

  // Queen-side castling.
  if (
    row === homeRow &&
    col === 4 &&
    state.castlingRights[color].queenSide &&
    !board[homeRow][1] &&
    !board[homeRow][2] &&
    !board[homeRow][3] &&
    !isSquareUnderAttack(board, homeRow, 4, oppositeColor(color), state) &&
    !isSquareUnderAttack(board, homeRow, 3, oppositeColor(color), state) &&
    !isSquareUnderAttack(board, homeRow, 2, oppositeColor(color), state) &&
    board[homeRow][0] === `${color}r`
  ) {
    moves.push({
      from: { row, col },
      to: { row: homeRow, col: 2 },
      special: "castle-queen-side",
    });
  }

  return moves;
}

/* ------------------------------
   Check / king safety
   ------------------------------ */

// Tests whether a move would leave the moving side's own king in check.
function wouldMoveLeaveKingInCheck(board, move, state) {
  const simulatedBoard = cloneBoard(board);
  const movingPiece = simulatedBoard[move.from.row][move.from.col];
  const movingColor = movingPiece[0];

  applyMoveToBoardOnly(simulatedBoard, move, movingPiece);

  return isKingInCheck(simulatedBoard, movingColor, state);
}

// Applies a move only to a copied board for simulation purposes.
function applyMoveToBoardOnly(board, move, movingPiece) {
  board[move.to.row][move.to.col] = movingPiece;
  board[move.from.row][move.from.col] = null;

  if (move.special === "en-passant") {
    const capturedPawnRow = movingPiece[0] === "w" ? move.to.row + 1 : move.to.row - 1;
    board[capturedPawnRow][move.to.col] = null;
  }

  if (move.special === "castle-king-side") {
    board[move.to.row][5] = board[move.to.row][7];
    board[move.to.row][7] = null;
  }

  if (move.special === "castle-queen-side") {
    board[move.to.row][3] = board[move.to.row][0];
    board[move.to.row][0] = null;
  }

  if (move.special === "promotion") {
    board[move.to.row][move.to.col] = `${movingPiece[0]}q`;
  }
}

// Returns true if the given player's king is under attack.
function isKingInCheck(board, color, state) {
  const kingPosition = findKing(board, color);
  if (!kingPosition) return false;

  return isSquareUnderAttack(board, kingPosition.row, kingPosition.col, oppositeColor(color), state);
}

// Finds the king currently in check to highlight it in the UI.
function findKingInCheck(board, color) {
  if (!isKingInCheck(board, color, gameState)) return null;
  return findKing(board, color);
}

// Searches the board for a king of a specific color.
function findKing(board, color) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === `${color}k`) {
        return { row, col };
      }
    }
  }
  return null;
}

// Checks whether a square is attacked by any piece of the attacking color.
function isSquareUnderAttack(board, targetRow, targetCol, attackingColor, state) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece || piece[0] !== attackingColor) continue;

      const type = piece[1];

      // Pawns attack diagonally, so treat them separately.
      if (type === "p") {
        const direction = attackingColor === "w" ? -1 : 1;
        for (const colOffset of [-1, 1]) {
          const attackRow = row + direction;
          const attackCol = col + colOffset;
          if (attackRow === targetRow && attackCol === targetCol) {
            return true;
          }
        }
        continue;
      }

      // Kings also need special handling to avoid recursive castling logic.
      if (type === "k") {
        if (Math.abs(row - targetRow) <= 1 && Math.abs(col - targetCol) <= 1) {
          return true;
        }
        continue;
      }

      const moves = getPseudoLegalMoves(board, row, col, {
        ...state,
        castlingRights: { w: { kingSide: false, queenSide: false }, b: { kingSide: false, queenSide: false } },
      });

      if (moves.some((move) => move.to.row === targetRow && move.to.col === targetCol)) {
        return true;
      }
    }
  }

  return false;
}

// Checks whether the player has at least one legal move left.
function playerHasAnyLegalMove(board, color, state) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece || piece[0] !== color) continue;

      const legalMoves = getLegalMovesForPiece(board, row, col, state);
      if (legalMoves.length > 0) {
        return true;
      }
    }
  }
  return false;
}

/* ------------------------------
   Castling helpers
   ------------------------------ */

// Removes castling rights when king or rook moves from its original square.
function updateCastlingRightsAfterMove(piece, from) {
  const color = piece[0];
  const type = piece[1];

  if (type === "k") {
    gameState.castlingRights[color].kingSide = false;
    gameState.castlingRights[color].queenSide = false;
  }

  if (type === "r") {
    if (color === "w" && from.row === 7 && from.col === 0) {
      gameState.castlingRights.w.queenSide = false;
    }
    if (color === "w" && from.row === 7 && from.col === 7) {
      gameState.castlingRights.w.kingSide = false;
    }
    if (color === "b" && from.row === 0 && from.col === 0) {
      gameState.castlingRights.b.queenSide = false;
    }
    if (color === "b" && from.row === 0 && from.col === 7) {
      gameState.castlingRights.b.kingSide = false;
    }
  }
}

// Removes castling rights if a rook gets captured on its home square.
function updateCastlingRightsAfterCapture(piece, square) {
  const color = piece[0];
  const type = piece[1];
  if (type !== "r") return;

  if (color === "w" && square.row === 7 && square.col === 0) {
    gameState.castlingRights.w.queenSide = false;
  }
  if (color === "w" && square.row === 7 && square.col === 7) {
    gameState.castlingRights.w.kingSide = false;
  }
  if (color === "b" && square.row === 0 && square.col === 0) {
    gameState.castlingRights.b.queenSide = false;
  }
  if (color === "b" && square.row === 0 && square.col === 7) {
    gameState.castlingRights.b.kingSide = false;
  }
}

/* ------------------------------
   Persistence / crash recovery helpers
   ------------------------------ */

// Creates a small, safe snapshot for undo and browser storage.
function createSnapshot(state) {
  return {
    board: cloneBoard(state.board),
    currentPlayer: state.currentPlayer,
    selectedSquare: state.selectedSquare ? { ...state.selectedSquare } : null,
    legalMoves: state.legalMoves.map((move) => ({
      from: { ...move.from },
      to: { ...move.to },
      special: move.special || null,
      promotionChoice: move.promotionChoice || null,
    })),
    statusMessage: state.statusMessage,
    moveHistory: [...state.moveHistory],
    historySnapshots: state.historySnapshots.map((snapshot) => ({
      ...snapshot,
      board: cloneBoard(snapshot.board),
      moveHistory: [...snapshot.moveHistory],
      legalMoves: snapshot.legalMoves.map((move) => ({
        from: { ...move.from },
        to: { ...move.to },
        special: move.special || null,
        promotionChoice: move.promotionChoice || null,
      })),
      selectedSquare: snapshot.selectedSquare ? { ...snapshot.selectedSquare } : null,
      enPassantTarget: snapshot.enPassantTarget ? { ...snapshot.enPassantTarget } : null,
      castlingRights: {
        w: { ...snapshot.castlingRights.w },
        b: { ...snapshot.castlingRights.b },
      },
    })),
    enPassantTarget: state.enPassantTarget ? { ...state.enPassantTarget } : null,
    castlingRights: {
      w: { ...state.castlingRights.w },
      b: { ...state.castlingRights.b },
    },
    gameOver: state.gameOver,
  };
}

// Saves the current stable state to localStorage.
function saveLastStableState() {
  try {
    localStorage.setItem(STORAGE_KEYS.lastStable, JSON.stringify(createSnapshot(gameState)));
  } catch (error) {
    console.error("Could not save stable chess state:", error);
  }
}

// Saves the position from just before a move, so a crash can roll back one move if needed.
function savePreMoveBackup() {
  try {
    localStorage.setItem(STORAGE_KEYS.moveBackup, JSON.stringify(createSnapshot(gameState)));
  } catch (error) {
    console.error("Could not save pre-move backup:", error);
  }
}

// Loads a saved game from localStorage if it is valid.
function loadSavedGameState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.lastStable);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (!isValidGameState(parsed)) {
      clearSavedGameState();
      return null;
    }

    parsed.statusMessage = parsed.moveHistory.length
      ? `${parsed.currentPlayer === "w" ? "White" : "Black"} to move. Game restored.`
      : "Game started. White to move.";
    parsed.selectedSquare = null;
    parsed.legalMoves = [];
    return parsed;
  } catch (error) {
    console.error("Could not load saved chess state:", error);
    clearSavedGameState();
    return null;
  }
}

// Restores the last stable state after an error.
function restoreLastStableState(message) {
  try {
    const moveBackupRaw = localStorage.getItem(STORAGE_KEYS.moveBackup);
    const stableRaw = localStorage.getItem(STORAGE_KEYS.lastStable);
    const moveBackup = moveBackupRaw ? JSON.parse(moveBackupRaw) : null;
    const stableState = stableRaw ? JSON.parse(stableRaw) : null;

    if (moveBackup && isValidGameState(moveBackup)) {
      gameState = moveBackup;
    } else if (stableState && isValidGameState(stableState)) {
      gameState = stableState;
    } else {
      gameState = createInitialGameState();
    }
  } catch (error) {
    console.error("Could not restore saved chess state:", error);
    gameState = createInitialGameState();
  }

  gameState.selectedSquare = null;
  gameState.legalMoves = [];
  gameState.statusMessage = message;
  renderGame();
  saveLastStableState();
}

// Removes saved browser data so a brand-new game can start cleanly.
function clearSavedGameState() {
  try {
    localStorage.removeItem(STORAGE_KEYS.lastStable);
    localStorage.removeItem(STORAGE_KEYS.moveBackup);
  } catch (error) {
    console.error("Could not clear saved chess state:", error);
  }
}

// Checks whether the stored state has the minimum structure needed to run safely.
function isValidGameState(state) {
  if (!state || typeof state !== "object") return false;
  if (!Array.isArray(state.board) || state.board.length !== 8) return false;
  if (!["w", "b"].includes(state.currentPlayer)) return false;
  if (!Array.isArray(state.moveHistory)) return false;
  if (!Array.isArray(state.historySnapshots)) return false;
  if (!state.castlingRights || !state.castlingRights.w || !state.castlingRights.b) return false;

  for (const row of state.board) {
    if (!Array.isArray(row) || row.length !== 8) return false;
    for (const square of row) {
      if (square !== null && typeof square !== "string") return false;
      if (square !== null && !PIECE_SYMBOLS[square]) return false;
    }
  }

  return true;
}

/* ------------------------------
   Move text helpers
   ------------------------------ */

// Builds readable move text for the move history area.
function buildMoveText(move, movingPiece, targetPiece) {
  const colorName = movingPiece[0] === "w" ? "White" : "Black";
  const pieceName = PIECE_NAMES[movingPiece[1]];
  const fromSquare = toSquareNotation(move.from.row, move.from.col);
  const toSquare = toSquareNotation(move.to.row, move.to.col);

  if (move.special === "castle-king-side") {
    return `${colorName}: Castled king side`;
  }

  if (move.special === "castle-queen-side") {
    return `${colorName}: Castled queen side`;
  }

  if (move.special === "en-passant") {
    return `${colorName}: ${pieceName} ${fromSquare} → ${toSquare} (en passant)`;
  }

  if (move.special === "promotion") {
    const promotedTo = move.promotionChoice
      ? PIECE_NAMES[move.promotionChoice]
      : "Queen";
    return `${colorName}: Pawn ${fromSquare} → ${toSquare} (promoted to ${promotedTo})`;
  }

  if (targetPiece) {
    return `${colorName}: ${pieceName} ${fromSquare} captured on ${toSquare}`;
  }

  return `${colorName}: ${pieceName} ${fromSquare} → ${toSquare}`;
}

/* ------------------------------
   Utility helpers
   ------------------------------ */

// Returns true if coordinates are on the board.
function isInsideBoard(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

// Converts row/col into chess notation like e4.
function toSquareNotation(row, col) {
  return `${FILES[col]}${8 - row}`;
}

// Returns the opposite chess color.
function oppositeColor(color) {
  return color === "w" ? "b" : "w";
}

// Makes a deep copy of only the board.
function cloneBoard(board) {
  return board.map((row) => [...row]);
}
