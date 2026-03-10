/**
 * Prowl — Frontend Renderer
 * Sheep & Wolf: 20 sheep vs 2 wolves on a cross board with pen.
 * Canvas-based. Sheep move toward the pen; wolves hunt by jumping.
 */
window.GameRenderer = (() => {
  const CELL = 56;
  const PAD  = 32;
  const COLS = 7;
  const ROWS = 10;

  // Valid cells on the 10×7 grid
  const VALID = new Set([
    2,3,4, 9,10,11, 16,17,18,
    23,24,25, 30,31,32,
    35,36,37,38,39,40,41,
    42,43,44,45,46,47,48,
    49,50,51,52,53,54,55,
    58,59,60, 65,66,67
  ]);
  const PEN = new Set([2,3,4,9,10,11,16,17,18]);

  // Pre-compute 8-directional adjacency
  const ADJ = {};
  VALID.forEach(pos => {
    const row = Math.floor(pos / COLS), col = pos % COLS;
    ADJ[pos] = [];
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const nr = row + dr, nc = col + dc, np = nr * COLS + nc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && VALID.has(np)) {
        ADJ[pos].push({ pos: np, dr, dc });
      }
    }
  });

  let canvas, ctx, session, sendMove;
  let state = null;
  let selected = null;

  function init(_session, _sendMove) {
    session  = _session;
    sendMove = _sendMove;

    document.getElementById('gameWrap').innerHTML = `
      <div class="board-container">
        <div style="font-family:var(--font-head);font-size:13px;color:var(--text-dim);letter-spacing:2px;text-align:center;margin-bottom:8px">
          🐺 Prowl — Wolves vs Sheep — Click piece then click destination
        </div>
        <canvas id="prowlCanvas"></canvas>
        <div id="prowlInfo" style="text-align:center;font-family:var(--font-head);font-size:15px;color:var(--accent);margin-top:8px"></div>
        <div id="prowlStats" style="display:flex;gap:16px;justify-content:center;margin-top:6px;font-family:var(--font-head);font-size:13px;color:var(--text-dim)"></div>
      </div>
    `;

    canvas = document.getElementById('prowlCanvas');
    ctx    = canvas.getContext('2d');
    canvas.width  = COLS * CELL + PAD * 2;
    canvas.height = ROWS * CELL + PAD * 2;
    canvas.style.cursor = 'pointer';
    canvas.style.maxWidth = '100%';

    canvas.addEventListener('click', onCanvasClick);
    draw();
  }

  function update(_state) {
    state = _state;
    selected = null;
    draw();
    updateInfo();
  }

  function reset() { state = null; selected = null; draw(); }

  /* ── Drawing ── */
  function posToXY(pos) {
    const row = Math.floor(pos / COLS), col = pos % COLS;
    return [PAD + col * CELL + CELL / 2, PAD + row * CELL + CELL / 2];
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!state) { drawEmpty(); return; }

    const sheep  = new Set(Array.isArray(state.sheep) ? state.sheep : []);
    const wolves = state.wolves || [];
    const pen    = new Set(Array.isArray(state.pen) ? state.pen : [...PEN]);

    // Draw connection lines
    VALID.forEach(pos => {
      const [x, y] = posToXY(pos);
      const adj = ADJ[pos] || [];
      adj.forEach(({ pos: np, dr, dc }) => {
        // Only draw lines in one direction to avoid duplication
        if (np > pos) {
          const [nx, ny] = posToXY(np);
          ctx.beginPath();
          ctx.moveTo(x, y); ctx.lineTo(nx, ny);
          ctx.strokeStyle = pen.has(pos) && pen.has(np) ? '#c8a84433' : '#2a2a3a';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
    });

    // Draw cells
    VALID.forEach(pos => {
      const [cx, cy] = posToXY(pos);
      const isPen    = pen.has(pos);
      const isWolf   = wolves.includes(pos);
      const isSheep  = sheep.has(pos);
      const isSel    = selected === pos;
      const isHint   = selected !== null && isValidTarget(selected, pos, sheep, wolves);

      // Cell background
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      if (isPen && !isSheep && !isWolf) ctx.fillStyle = '#c8a84418';
      else if (isSel)  ctx.fillStyle = '#f0c04044';
      else if (isHint) ctx.fillStyle = '#4CAF5022';
      else             ctx.fillStyle = '#1a1a24';
      ctx.fill();

      // Cell border
      ctx.strokeStyle = isSel ? '#f0c040' : isHint ? '#4CAF50' : isPen ? '#c8a84444' : '#2a2a3a';
      ctx.lineWidth = isPen ? 2 : 1.5;
      ctx.stroke();

      // Pen label on empty pen cells
      if (isPen && !isSheep && !isWolf) {
        ctx.font = '10px Rajdhani, sans-serif';
        ctx.fillStyle = '#c8a84444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PEN', cx, cy);
      }

      // Wolf piece
      if (isWolf) {
        ctx.font = '26px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐺', cx, cy);
        if (isSel) drawGlow(cx, cy, '#E07B39');
      }

      // Sheep piece
      if (isSheep) {
        ctx.font = '22px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐑', cx, cy);
        if (isSel) drawGlow(cx, cy, '#4CAF50');
      }

      // Hint dot for empty target cells
      if (isHint && !isWolf && !isSheep) {
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#4CAF5088';
        ctx.fill();
      }
    });

    // Pen area label
    const [penLX, penLY] = posToXY(3); // top-center of pen
    ctx.font = 'bold 11px Rajdhani, sans-serif';
    ctx.fillStyle = '#c8a84466';
    ctx.textAlign = 'center';
    ctx.fillText('🏠  S H E E P   P E N', penLX, penLY - CELL + 10);
  }

  function drawEmpty() {
    ctx.fillStyle = '#2a2a3a44';
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐺', canvas.width / 2, canvas.height / 2);
  }

  function drawGlow(x, y, color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /* ── Interaction ── */
  function cellFromXY(mx, my) {
    for (const pos of VALID) {
      const [cx, cy] = posToXY(pos);
      if (Math.hypot(mx - cx, my - cy) < 24) return pos;
    }
    return null;
  }

  function isValidTarget(from, to, sheep, wolves) {
    if (to === from) return false;
    const isWolfTurn = state.wolfPlayer === session.playerId;
    const isSheepTurn = !isWolfTurn;

    // Can't land on occupied cell
    if (sheep.has(to) || wolves.includes(to)) return false;

    const fromRow = Math.floor(from / COLS);
    const toRow   = Math.floor(to / COLS);

    if (isSheepTurn) {
      // Sheep: adjacent move, not backward (dr > 0)
      if (toRow > fromRow) return false;
      return !!(ADJ[from] || []).find(n => n.pos === to);
    }

    // Wolf: check adjacent move
    const isAdj = (ADJ[from] || []).some(n => n.pos === to);
    if (isAdj && !PEN.has(to)) return true;

    // Wolf: check jump capture
    for (const { pos: midPos, dr, dc } of (ADJ[from] || [])) {
      if (sheep.has(midPos)) {
        const landRow = Math.floor(from / COLS) + dr * 2;
        const landCol = from % COLS + dc * 2;
        const landPos = landRow * COLS + landCol;
        if (landPos === to && VALID.has(to) && !PEN.has(to)) return true;
      }
    }
    return false;
  }

  function onCanvasClick(e) {
    if (!state || state.winner) return;
    if (state.currentTurn !== session.playerId) { showToast?.('Not your turn!'); return; }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;
    const cell = cellFromXY(mx, my);
    if (cell === null) return;

    const sheep  = new Set(state.sheep || []);
    const wolves = state.wolves || [];
    const isWolfTurn  = state.wolfPlayer === session.playerId;
    const isSheepTurn = !isWolfTurn;

    if (selected === null) {
      // Select a piece
      if (isWolfTurn && wolves.includes(cell)) {
        // If in multi-jump, can only select the active wolf
        if (state.activeWolf !== null && wolves[state.activeWolf] !== cell) {
          showToast?.('Must continue jumping with the highlighted wolf!');
          return;
        }
        selected = cell;
      } else if (isSheepTurn && sheep.has(cell)) {
        selected = cell;
      }
      draw();
    } else {
      // Move piece
      if (cell === selected) { selected = null; draw(); return; }
      sendMove({ from: selected, to: cell });
      selected = null;
    }
  }

  function updateInfo() {
    if (!state) return;
    const info  = document.getElementById('prowlInfo');
    const stats = document.getElementById('prowlStats');
    const sheepCount = (state.sheep || []).length;
    const penCount   = (state.sheep || []).filter(p => PEN.has(p)).length;

    const isMyTurn = state.currentTurn === session.playerId;
    const isWolf   = state.wolfPlayer === session.playerId;
    let msg = '';

    if (state.winner) {
      msg = '';
    } else if (state.activeWolf !== null && isMyTurn && isWolf) {
      msg = '🐺 Multi-jump! You must continue capturing!';
    } else if (isMyTurn) {
      msg = isWolf ? '🐺 Your turn (Wolf) — capture or move' : '🐑 Your turn (Sheep) — move toward the pen';
    } else {
      msg = '⏳ Opponent\'s turn…';
    }
    info.textContent = msg;

    stats.innerHTML = `
      <span>🐑 Sheep: ${sheepCount}/20</span>
      <span>🏠 Pen: ${penCount}/9</span>
      <span>💀 Captured: ${state.captured || 0}</span>
    `;
  }

  return { init, update, reset };
})();
