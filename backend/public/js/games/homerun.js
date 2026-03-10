/**
 * Homerun — Frontend Renderer
 * Cross-and-circle race (Ludo) with proper 52-cell track on a 15×15 board.
 */
window.GameRenderer = (() => {
  let session, sendMove, state;
  let canvas, ctx;

  const COLORS = { red:'#E53935', blue:'#1565C0', green:'#2E7D32', yellow:'#F9A825' };
  const PLAYER_COLORS = ['red','blue','green','yellow'];
  const CELL = 48;
  const GRID = 15;
  const SIZE = CELL * GRID;

  // ── 52-cell shared track (row, col) on 15×15 board, clockwise ──
  const TRACK = [
    [6,1],[6,2],[6,3],[6,4],[6,5],           //  0-4   Red start → right
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],     //  5-10  up left column
    [0,7],[0,8],                              // 11-12  across top
    [1,8],[2,8],[3,8],[4,8],[5,8],           // 13-17  Blue start → down right col
    [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],// 18-23  right across top-right
    [7,14],[8,14],                            // 24-25  down right edge
    [8,13],[8,12],[8,11],[8,10],[8,9],       // 26-30  Green start → left
    [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],// 31-36  down right column
    [14,7],[14,6],                            // 37-38  across bottom
    [13,6],[12,6],[11,6],[10,6],[9,6],       // 39-43  Yellow start → up left col
    [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],     // 44-49  left across bottom-left
    [7,0],[6,0]                               // 50-51  up left edge → back to 0
  ];

  // Home stretch cells per color (5 cells toward center, step 53-57 in game)
  const HOME_STRETCH = {
    red:    [[7,1],[7,2],[7,3],[7,4],[7,5]],
    blue:   [[1,7],[2,7],[3,7],[4,7],[5,7]],
    green:  [[7,13],[7,12],[7,11],[7,10],[7,9]],
    yellow: [[13,7],[12,7],[11,7],[10,7],[9,7]]
  };

  // Yard piece home positions (2×2 grid inside each 6×6 corner)
  const YARD_POS = {
    red:    [[2,2],[2,3],[3,2],[3,3]],
    blue:   [[2,11],[2,12],[3,11],[3,12]],
    green:  [[11,11],[11,12],[12,11],[12,12]],
    yellow: [[11,2],[11,3],[12,2],[12,3]]
  };

  // Yard corner origins (row, col) for drawing the 6×6 box
  const YARD_ORIGINS = {
    red:    [0, 0],
    blue:   [0, 9],
    green:  [9, 9],
    yellow: [9, 0]
  };

  // Which colors are in the game
  function activeColors() {
    if (!state || !state.players) return [];
    return state.players.map(p => {
      const piece = state.pieces?.[p.id];
      return piece?.color;
    }).filter(Boolean);
  }

  function init(_session, _sendMove) {
    session  = _session;
    sendMove = _sendMove;

    document.getElementById('gameWrap').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
        <canvas id="homerunCanvas" class="homerun-canvas"></canvas>
        <div id="homerunDice" class="dice-display" title="Click to roll">🎲</div>
        <div id="homerunInfo" style="font-family:var(--font-head);font-size:14px;color:var(--accent);text-align:center;letter-spacing:1px"></div>
        <div id="homerunPieces" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"></div>
      </div>
    `;

    canvas = document.getElementById('homerunCanvas');
    ctx    = canvas.getContext('2d');
    canvas.width = canvas.height = SIZE;
    canvas.style.maxWidth = '100%';
    canvas.style.cursor = 'default';

    document.getElementById('homerunDice').addEventListener('click', onDiceClick);
    drawBoard();
  }

  function update(_state) {
    state = _state;
    drawBoard();
    renderDice();
    renderInfo();
    renderPieceButtons();
  }

  /* ── Board drawing ── */
  function drawBoard() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const colors = activeColors();

    // Draw cross-shaped track cells
    drawTrackCells(colors);

    // Draw yards (only for active players)
    colors.forEach(color => {
      const [yr, yc] = YARD_ORIGINS[color];
      drawYard(yr, yc, color);
    });

    // Draw inactive corners as dark
    PLAYER_COLORS.forEach(color => {
      if (!colors.includes(color)) {
        const [yr, yc] = YARD_ORIGINS[color];
        ctx.fillStyle = '#111118';
        ctx.fillRect(yc * CELL, yr * CELL, 6 * CELL, 6 * CELL);
      }
    });

    // Draw center home
    drawCenterHome(colors);

    // Draw pieces
    if (state) drawPieces(colors);
  }

  function drawTrackCells(colors) {
    // Draw all 52 track cells
    TRACK.forEach((rc, i) => {
      const [r, c] = rc;
      const x = c * CELL, y = r * CELL;
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      ctx.strokeStyle = '#2a2a3a';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
    });

    // Draw home stretch lanes (colored cells)
    colors.forEach(color => {
      const stretch = HOME_STRETCH[color];
      stretch.forEach(([r, c]) => {
        const x = c * CELL, y = r * CELL;
        ctx.fillStyle = COLORS[color] + '55';
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.strokeStyle = COLORS[color] + '88';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
      });
    });

    // Draw start position markers
    const startPositions = { red: 0, blue: 13, green: 26, yellow: 39 };
    colors.forEach(color => {
      const [r, c] = TRACK[startPositions[color]];
      const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[color];
      ctx.fill();
      // Arrow/star to mark start
      ctx.font = '10px Rajdhani, sans-serif';
      ctx.fillStyle = COLORS[color];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('START', cx, cy + 10);
    });
  }

  function drawYard(row, col, color) {
    const x = col * CELL, y = row * CELL, sz = 6 * CELL;
    ctx.fillStyle = COLORS[color] + '15';
    ctx.fillRect(x + 2, y + 2, sz - 4, sz - 4);
    ctx.strokeStyle = COLORS[color] + '44';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, sz - 4, sz - 4);

    // Yard label
    ctx.font = 'bold 13px Rajdhani, sans-serif';
    ctx.fillStyle = COLORS[color] + '88';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(color.toUpperCase(), x + sz / 2, y + sz / 2);

    // Draw 4 yard circles (piece slots)
    YARD_POS[color].forEach(([pr, pc], i) => {
      const cx = pc * CELL + CELL / 2;
      const cy = pr * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[color] + '33';
      ctx.fill();
      ctx.strokeStyle = COLORS[color] + '66';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  function drawCenterHome(colors) {
    const cx = SIZE / 2, cy = SIZE / 2;

    // Draw colored triangles for active players
    const triangles = {
      red:    [[7, 6], [6, 7]],
      blue:   [[6, 7], [7, 8]],
      green:  [[7, 8], [8, 7]],
      yellow: [[8, 7], [7, 6]]
    };
    colors.forEach(color => {
      const [[r1, c1], [r2, c2]] = triangles[color];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo((c1 + .5) * CELL, (r1 + .5) * CELL);
      ctx.lineTo((c2 + .5) * CELL, (r2 + .5) * CELL);
      ctx.closePath();
      ctx.fillStyle = COLORS[color] + '88';
      ctx.fill();
    });

    // Center star
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⭐', cx, cy);
  }

  /* ── Piece rendering ── */
  function getPieceXY(color, pos, steps) {
    // pos === -1: in yard
    if (pos === -1) return null; // handled separately
    // pos === 99: finished (at center)
    if (pos === 99) return [SIZE / 2, SIZE / 2];
    // Home stretch (steps 53-57, positions 53-56 displayed as 52+ offset)
    if (steps > 52) {
      const hsIdx = steps - 53; // 0-4 index into home stretch
      const stretch = HOME_STRETCH[color];
      if (stretch && stretch[hsIdx]) {
        const [r, c] = stretch[hsIdx];
        return [c * CELL + CELL / 2, r * CELL + CELL / 2];
      }
      return [SIZE / 2, SIZE / 2];
    }
    // On shared track
    if (pos >= 0 && pos < 52) {
      const [r, c] = TRACK[pos];
      return [c * CELL + CELL / 2, r * CELL + CELL / 2];
    }
    return null;
  }

  function drawPieces(colors) {
    if (!state.pieces) return;

    // Collect all piece positions to handle overlaps
    const posMap = {}; // "x,y" -> [{color, pieceIdx, pid}]

    Object.entries(state.pieces).forEach(([pid, piece]) => {
      const color = piece.color;
      if (!colors.includes(color)) return;
      const positions = piece.positions || [];
      const steps = piece.steps || [];

      positions.forEach((pos, pi) => {
        if (pos === -1) {
          // In yard — draw on yard slot
          const yardSlots = YARD_POS[color];
          if (yardSlots && yardSlots[pi]) {
            const [yr, yc] = yardSlots[pi];
            drawPiece(yc * CELL + CELL / 2, yr * CELL + CELL / 2, color, pi);
          }
          return;
        }

        const xy = getPieceXY(color, pos, steps[pi] || 0);
        if (!xy) return;
        const key = `${Math.round(xy[0])},${Math.round(xy[1])}`;
        if (!posMap[key]) posMap[key] = [];
        posMap[key].push({ color, pi });
      });
    });

    // Draw pieces with slight offset for overlapping
    Object.entries(posMap).forEach(([key, pieces]) => {
      pieces.forEach(({ color, pi }, gi) => {
        const [bx, by] = key.split(',').map(Number);
        const offX = pieces.length > 1 ? (gi % 2 - 0.5) * 16 : 0;
        const offY = pieces.length > 1 ? (Math.floor(gi / 2) - 0.5) * 16 : 0;
        drawPiece(bx + offX, by + offY, color, pi);
      });
    });
  }

  function drawPiece(cx, cy, color, pieceIdx) {
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = COLORS[color];
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pieceIdx + 1, cx, cy);
  }

  /* ── UI rendering ── */
  function renderDice() {
    const el = document.getElementById('homerunDice');
    const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    el.textContent = state?.dice ? (faces[state.dice] || '🎲') : '🎲';

    const isMyTurn = state?.currentTurn === session.playerId;
    const canRoll = state?.canRoll && isMyTurn;
    el.style.cursor = canRoll ? 'pointer' : 'default';
    el.style.opacity = canRoll ? '1' : '0.4';
  }

  function renderInfo() {
    const el = document.getElementById('homerunInfo');
    if (!state) return;
    const isMyTurn = state.currentTurn === session.playerId;
    el.textContent = isMyTurn
      ? (state.canRoll ? '🎲 Click the die to roll!' : '🏃 Click a piece button to move')
      : '⏳ Waiting for opponent…';
  }

  function renderPieceButtons() {
    const wrap = document.getElementById('homerunPieces');
    if (!state || state.canRoll || state.currentTurn !== session.playerId) { wrap.innerHTML = ''; return; }

    const myPiece = Object.entries(state.pieces || {}).find(([pid]) => pid === session.playerId)?.[1];
    if (!myPiece) return;

    const positions = myPiece.positions || [];
    const steps = myPiece.steps || [];

    wrap.innerHTML = '<div style="font-family:var(--font-head);font-size:12px;color:var(--text-dim);letter-spacing:2px;width:100%;text-align:center">SELECT PIECE TO MOVE</div>';

    positions.forEach((pos, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      const s = steps[i] || 0;
      const canMove = pos === -1 ? state.dice === 6 : (pos !== 56 && s + state.dice <= 57);
      btn.textContent = `Piece ${i + 1} (${pos === -1 ? 'Yard' : pos === 99 ? 'Home ✓' : `step ${s}`})`;
      btn.disabled = !canMove;
      btn.style.opacity = canMove ? 1 : .3;
      btn.onclick = () => sendMove({ action: 'move_piece', pieceIndex: i });
      wrap.appendChild(btn);
    });
  }

  function onDiceClick() {
    if (!state) return;
    if (state.currentTurn !== session.playerId) return showToast?.('Not your turn!');
    if (!state.canRoll) return showToast?.('Already rolled!');
    sendMove({ action: 'roll' });

    const el = document.getElementById('homerunDice');
    el.classList.add('rolling');
    setTimeout(() => el.classList.remove('rolling'), 400);
  }

  function reset() { state = null; drawBoard(); }

  return { init, update, reset };
})();
