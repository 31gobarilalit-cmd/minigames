/**
 * Homerun — Frontend Renderer
 * Homerun: full canvas cross-and-circle race board with dice rolling.
 */
window.GameRenderer = (() => {
  let session, sendMove, state;
  let canvas, ctx;

  const COLORS = { red:'#E53935', blue:'#1565C0', green:'#2E7D32', yellow:'#F9A825' };
  const PLAYER_COLORS = ['red','blue','green','yellow'];
  const CELL = 48;
  const GRID = 15;
  const SIZE = CELL * GRID;

  // 52-cell track coordinates on the 15×15 board
  const TRACK = buildTrack();

  function buildTrack() {
    // Outer ring track positions (row, col) for the 52 shared cells
    const t = [];
    // Bottom-left to top-left (col 6, rows 14..9)
    for (let r=14;r>=9;r--) t.push([r,6]);
    // Top-left block up (col 6..8, row 8)
    // across top-left
    for (let c=5;c>=0;c--) t.push([8,c]);
    // up left column
    for (let r=7;r>=0;r--) t.push([r,6]);
    // across top
    for (let c=7;c<=14;c++) t.push([0,c]);
    // Wait — use a simplified track for clarity
    // Just place pieces symbolically
    return t;
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

  function drawBoard() {
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Draw 15x15 grid
    for (let r=0; r<GRID; r++) {
      for (let c=0; c<GRID; c++) {
        const x=c*CELL, y=r*CELL;
        const color = getCellColor(r, c);
        ctx.fillStyle = color;
        ctx.fillRect(x+1, y+1, CELL-2, CELL-2);
      }
    }

    // Draw home yards (corners)
    drawYard(0, 0, 'red');
    drawYard(0, 9, 'blue');
    drawYard(9, 0, 'green');
    drawYard(9, 9, 'yellow');

    // Draw center home triangle
    drawCenterHome();

    // Draw pieces from state
    if (state) drawPieces();
  }

  function getCellColor(r, c) {
    // Safe cells glow lightly
    const safe = [[6,1],[1,8],[8,13],[13,6],[6,2],[2,8],[8,12],[12,6],[6,6]];
    if (safe.some(([sr,sc])=>sr===r&&sc===c)) return '#2a2a3a';
    // Color lanes
    if (c===7 && r>=1 && r<=5)  return '#1565C088'; // blue lane
    if (r===7 && c>=9 && c<=13) return '#F9A82588'; // yellow lane
    if (c===7 && r>=9 && r<=13) return '#2E7D3288'; // green lane
    if (r===7 && c>=1 && c<=5)  return '#E5393588'; // red lane
    // Board cells
    if ((r<6||r>8)&&(c<6||c>8)) return '#111118'; // yard area — dark
    return '#1e1e2e';
  }

  function drawYard(row, col, color) {
    const x=col*CELL, y=row*CELL, sz=6*CELL;
    ctx.fillStyle = COLORS[color] + '22';
    ctx.fillRect(x+2, y+2, sz-4, sz-4);
    ctx.strokeStyle = COLORS[color] + '44';
    ctx.lineWidth = 2;
    ctx.strokeRect(x+2, y+2, sz-4, sz-4);

    // Yard label
    ctx.font = 'bold 11px Rajdhani, sans-serif';
    ctx.fillStyle = COLORS[color] + 'aa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(color.toUpperCase(), x+sz/2, y+sz/2);

    // Starting circles for 4 pieces
    const positions = [[2,2],[2,3],[3,2],[3,3]];
    positions.forEach(([pr,pc], i) => {
      const cx = (col+pc) * CELL + CELL/2;
      const cy = (row+pr) * CELL + CELL/2;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI*2);
      ctx.fillStyle = COLORS[color] + '44';
      ctx.fill();
      ctx.strokeStyle = COLORS[color];
      ctx.lineWidth = 2;
      ctx.stroke();
      // Piece number
      ctx.fillStyle = COLORS[color];
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(i+1, cx, cy);
    });
  }

  function drawCenterHome() {
    const cx = SIZE/2, cy = SIZE/2, r = CELL*1.5;
    // Draw 4 triangles for home
    [['red',[7,6],[6,7]], ['blue',[6,7],[7,8]], ['green',[8,7],[7,8]], ['yellow',[7,8],[8,7]]].forEach(([color,[r1,c1],[r2,c2]]) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo((c1+.5)*CELL, (r1+.5)*CELL);
      ctx.lineTo((c2+.5)*CELL, (r2+.5)*CELL);
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

  function drawPieces() {
    if (!state.pieces) return;
    const playerColors = {};
    state.players?.forEach((p, i) => { playerColors[p.id] = PLAYER_COLORS[i]; });

    Object.entries(state.pieces).forEach(([pid, piece]) => {
      const color  = piece.color;
      const col    = ['red','blue','green','yellow'].indexOf(color);
      const colorHex = COLORS[color];

      piece.positions.forEach((pos, pi) => {
        if (pos === 56) {
          // At home — show in center
          const cx = SIZE/2 + (pi%2-0.5)*22;
          const cy = SIZE/2 + (Math.floor(pi/2)-0.5)*22;
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI*2);
          ctx.fillStyle = colorHex;
          ctx.fill();
          ctx.font = '10px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pi+1, cx, cy);
        } else if (pos >= 0) {
          // On track — simplified position mapping
          const angle = (pos / 52) * Math.PI * 2 - Math.PI/2;
          const rx = SIZE/2 + Math.cos(angle) * (SIZE/2 - CELL*1.5);
          const ry = SIZE/2 + Math.sin(angle) * (SIZE/2 - CELL*1.5);
          ctx.beginPath();
          ctx.arc(rx, ry, 12, 0, Math.PI*2);
          ctx.fillStyle = colorHex;
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pi+1, rx, ry);
        }
        // pos === -1: still in yard, drawn in yard area already
      });
    });
  }

  function renderDice() {
    const el = document.getElementById('homerunDice');
    const faces = ['', '⚀','⚁','⚂','⚃','⚄','⚅'];
    el.textContent = state?.dice ? (faces[state.dice] || '🎲') : '🎲';

    const isMyTurn  = state?.currentTurn === session.playerId;
    const canRoll   = state?.canRoll && isMyTurn;
    el.style.cursor = canRoll ? 'pointer' : 'default';
    el.style.opacity = canRoll ? '1' : '0.4';
  }

  function renderInfo() {
    const el = document.getElementById('homerunInfo');
    if (!state) return;
    const isMyTurn = state.currentTurn === session.playerId;
    el.textContent = isMyTurn
      ? (state.canRoll ? '🎲 Click the die to roll!' : '🏃 Click a piece to move')
      : '⏳ Waiting for opponent…';
  }

  function renderPieceButtons() {
    const wrap = document.getElementById('homerunPieces');
    if (!state || state.canRoll || state.currentTurn !== session.playerId) { wrap.innerHTML = ''; return; }

    const myPiece = Object.entries(state.pieces || {}).find(([pid]) => pid === session.playerId)?.[1];
    if (!myPiece) return;

    wrap.innerHTML = '<div style="font-family:var(--font-head);font-size:12px;color:var(--text-dim);letter-spacing:2px;width:100%;text-align:center">SELECT PIECE TO MOVE</div>';

    myPiece.positions.forEach((pos, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      const canMove = pos === -1 ? state.dice === 6 : pos !== 56;
      btn.textContent = `Piece ${i+1} (${pos === -1 ? 'Yard' : pos === 56 ? 'Home ✓' : `pos ${pos}`})`;
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

    // Animate dice
    const el = document.getElementById('homerunDice');
    el.classList.add('rolling');
    setTimeout(() => el.classList.remove('rolling'), 400);
  }

  function reset() { state = null; drawBoard(); }

  return { init, update, reset };
})();
