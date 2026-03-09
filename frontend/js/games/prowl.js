/**
 * Prowl — Frontend Renderer
 * Cross-shaped board, canvas-based.
 */
window.GameRenderer = (() => {
  const CELL = 64;
  const PAD  = 40;
  // Valid cells on a 7×7 cross grid
  const VALID = new Set([2,3,4,9,10,11,12,13,14,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,38,44,45,46]);

  let canvas, ctx, session, sendMove;
  let state = null;
  let selected = null;

  function init(_session, _sendMove) {
    session  = _session;
    sendMove = _sendMove;

    const wrap = document.getElementById('gameWrap');
    wrap.innerHTML = `
      <div class="board-container">
        <div style="font-family:var(--font-head);font-size:13px;color:var(--text-dim);letter-spacing:2px;text-align:center;margin-bottom:8px">
          🦊 Prowl — Hunter vs Pack — Click a piece then click destination
        </div>
        <canvas id="fgCanvas"></canvas>
        <div id="fgInfo" style="text-align:center;font-family:var(--font-head);font-size:15px;color:var(--accent);margin-top:8px"></div>
      </div>
    `;

    canvas = document.getElementById('fgCanvas');
    ctx    = canvas.getContext('2d');
    canvas.width  = 7 * CELL + PAD * 2;
    canvas.height = 7 * CELL + PAD * 2;
    canvas.style.cursor = 'pointer';
    canvas.style.maxWidth = '100%';

    canvas.addEventListener('click', onCanvasClick);
    draw();
  }

  function update(_state) {
    state = _state;
    selected = null;
    draw();
    const isFox  = state.currentTurn === session.playerId;
    const isGoose = !isFox && session.playerId !== state.foxPlayer;
    document.getElementById('fgInfo').textContent =
      state.winner ? '' :
      (state.currentTurn === session.playerId ? '⚡ Your turn!' : '⏳ Opponent\'s turn…');
  }

  function reset() { state = null; selected = null; draw(); }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!state) { drawEmpty(); return; }

    const geese = new Set(Array.isArray(state.geese) ? state.geese : []);

    // Draw grid lines
    VALID.forEach(pos => {
      const row = Math.floor(pos/7), col = pos%7;
      const x = PAD + col*CELL + CELL/2, y = PAD + row*CELL + CELL/2;
      // Draw connections
      [[0,1],[1,0]].forEach(([dr,dc]) => {
        const np = (row+dr)*7+(col+dc);
        if (VALID.has(np)) {
          const nx = PAD + (col+dc)*CELL+CELL/2, ny = PAD + (row+dr)*CELL+CELL/2;
          ctx.beginPath();
          ctx.moveTo(x,y); ctx.lineTo(nx,ny);
          ctx.strokeStyle = '#2a2a3a';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    });

    // Draw cells
    VALID.forEach(pos => {
      const row = Math.floor(pos/7), col = pos%7;
      const cx = PAD + col*CELL + CELL/2, cy = PAD + row*CELL + CELL/2;

      const isFox    = pos === state.fox;
      const isGoose  = geese.has(pos);
      const isSel    = selected === pos;
      const isHint   = selected !== null && isValidTarget(selected, pos, geese, state.fox);

      // Cell background
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI*2);
      if (isSel)   ctx.fillStyle = '#f0c04044';
      else if (isHint) ctx.fillStyle = '#4CAF5022';
      else         ctx.fillStyle = '#1a1a24';
      ctx.fill();
      ctx.strokeStyle = isSel ? '#f0c040' : isHint ? '#4CAF50' : '#2a2a3a';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Piece
      if (isFox) {
        ctx.font = '26px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🦊', cx, cy);
        if (isSel) drawGlow(cx, cy, '#E07B39');
      } else if (isGoose) {
        ctx.font = '22px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐑', cx, cy);
        if (isSel) drawGlow(cx, cy, '#4CAF50');
      }

      // Hint dot
      if (isHint && !isFox && !isGoose) {
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI*2);
        ctx.fillStyle = '#4CAF5088';
        ctx.fill();
      }
    });
  }

  function drawEmpty() {
    ctx.fillStyle = '#2a2a3a44';
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🦊', canvas.width/2, canvas.height/2);
  }

  function drawGlow(x, y, color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI*2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function cellFromXY(mx, my) {
    for (const pos of VALID) {
      const row = Math.floor(pos/7), col = pos%7;
      const cx = PAD + col*CELL + CELL/2, cy = PAD + row*CELL + CELL/2;
      if (Math.hypot(mx-cx, my-cy) < 24) return pos;
    }
    return null;
  }

  function isValidTarget(from, to, geese, fox) {
    if (to === from) return false;
    const row1 = Math.floor(from/7), col1 = from%7;
    const row2 = Math.floor(to/7),   col2 = to%7;
    const dr = Math.abs(row2-row1), dc = Math.abs(col2-col1);
    // Adjacent
    if (dr+dc === 1 && !geese.has(to) && to !== fox) return VALID.has(to);
    // Jump (fox only)
    if ((dr===2&&dc===0)||(dr===0&&dc===2)) {
      const mid = Math.floor((from+to)/2);
      return geese.has(mid) && !geese.has(to) && VALID.has(to);
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

    const geese = new Set(state.geese);
    const isFoxTurn = state.foxPlayer === session.playerId;

    if (selected === null) {
      // Select piece
      if (isFoxTurn && cell === state.fox) selected = cell;
      else if (!isFoxTurn && geese.has(cell)) selected = cell;
      draw();
    } else {
      // Move piece
      if (cell === selected) { selected = null; draw(); return; }
      sendMove({ from: selected, to: cell });
      selected = null;
    }
  }

  return { init, update, reset };
})();
