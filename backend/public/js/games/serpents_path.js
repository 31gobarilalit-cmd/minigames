/**
 * Serpent's Path — Frontend Renderer
 * Serpent's Path: full 10×10 board with serpents and ladders drawn.
 */
window.GameRenderer = (() => {
  let session, sendMove, state;
  let canvas, ctx;

  const CELL = 52;
  const SIZE = CELL * 10;
  const PAD  = 4;

  // Snakes: head -> tail (higher -> lower)
  const SNAKES  = { 99:78, 95:75, 92:88, 89:68, 74:53, 62:19, 64:60, 49:11, 46:25, 16:6 };
  // Ladders: bottom -> top (lower -> higher)
  const LADDERS = { 2:38, 7:14, 8:31, 15:26, 21:42, 28:84, 36:44, 51:67, 71:91, 78:98, 87:94 };

  const PLAYER_COLORS = ['#E53935','#1565C0','#2E7D32','#F9A825'];
  const PLAYER_EMOJIS = ['🔴','🔵','🟢','🟡'];

  function cellToXY(cell) {
    if (cell === 0) return [-100, -100]; // off board
    const n    = cell - 1;
    const row  = Math.floor(n / 10);    // 0=bottom, 9=top
    const col  = row % 2 === 0 ? n % 10 : 9 - (n % 10);
    const x    = col * CELL + PAD;
    const y    = (9 - row) * CELL + PAD;
    return [x + CELL/2, y + CELL/2];
  }

  function init(_session, _sendMove) {
    session  = _session;
    sendMove = _sendMove;

    document.getElementById('gameWrap').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:14px">
        <div id="serpentEvent" class="event-banner" style="display:none"></div>
        <canvas id="serpentCanvas" class="serpent-canvas" title="Click to roll dice"></canvas>
        <div id="serpentDice" class="dice-display" title="Click to roll your turn">🎲</div>
        <div id="serpentInfo" style="font-family:var(--font-head);font-size:14px;color:var(--accent);text-align:center;letter-spacing:1px"></div>
        <div id="serpentScores" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center"></div>
      </div>
    `;

    canvas = document.getElementById('serpentCanvas');
    ctx    = canvas.getContext('2d');
    canvas.width = canvas.height = SIZE + PAD*2;
    canvas.style.maxWidth = '100%';
    canvas.addEventListener('click', onRoll);

    document.getElementById('serpentDice').addEventListener('click', onRoll);

    drawBoard();
  }

  function update(_state) {
    state = _state;
    drawBoard();
    renderDice();
    renderInfo();
    renderScores();
    renderEvent();
  }

  function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw cells
    for (let n = 1; n <= 100; n++) {
      const [cx, cy] = cellToXY(n);
      const row = Math.floor((n-1)/10);
      const even = row % 2 === 0;

      // Cell background
      ctx.fillStyle = (row + Math.floor((n-1)%10)) % 2 === 0 ? '#1e1e2e' : '#2a2a3a';

      // Highlight snakes/ladders
      if (SNAKES[n])  ctx.fillStyle = '#ff5f5722';
      if (LADDERS[n]) ctx.fillStyle = '#4caf5022';

      ctx.fillRect(cx - CELL/2 + 1, cy - CELL/2 + 1, CELL-2, CELL-2);

      // Border
      ctx.strokeStyle = '#2a2a3a';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - CELL/2 + 1, cy - CELL/2 + 1, CELL-2, CELL-2);

      // Cell number
      ctx.fillStyle = '#3a3a5a';
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(n, cx - CELL/2 + 3, cy - CELL/2 + 3);
    }

    // Draw snakes
    Object.entries(SNAKES).forEach(([head, tail]) => {
      const [x1,y1] = cellToXY(+head);
      const [x2,y2] = cellToXY(+tail);
      drawSnake(x1,y1,x2,y2);
    });

    // Draw ladders
    Object.entries(LADDERS).forEach(([bottom, top]) => {
      const [x1,y1] = cellToXY(+bottom);
      const [x2,y2] = cellToXY(+top);
      drawLadder(x1,y1,x2,y2);
    });

    // Draw player tokens
    if (state) drawPlayers();
  }

  function drawSnake(x1, y1, x2, y2) {
    ctx.save();
    ctx.shadowColor = '#ff5f57';
    ctx.shadowBlur = 6;
    // Wavy snake body
    const steps = 12;
    const amp   = 8;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t  = i / steps;
      const x  = x1 + (x2-x1)*t + Math.sin(t*Math.PI*4) * amp;
      const y  = y1 + (y2-y1)*t;
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    }
    ctx.strokeStyle = '#ff5f57';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // Head emoji
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐍', x1, y1);
  }

  function drawLadder(x1, y1, x2, y2) {
    ctx.save();
    ctx.shadowColor = '#4CAF50';
    ctx.shadowBlur = 6;

    const dx   = (y2-y1 === 0) ? 0 : (x2-x1) / Math.abs(y2-y1) * 6;
    const perp = { x: -(y2-y1), y: x2-x1 };
    const len  = Math.hypot(perp.x, perp.y);
    const nx   = perp.x/len * 7, ny = perp.y/len * 7;

    // Two rails
    [[nx,ny],[-nx,-ny]].forEach(([ox,oy]) => {
      ctx.beginPath();
      ctx.moveTo(x1+ox, y1+oy);
      ctx.lineTo(x2+ox, y2+oy);
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });

    // Rungs
    const rungs = 5;
    for (let i=1; i<rungs; i++) {
      const t = i/rungs;
      const rx = x1+(x2-x1)*t, ry = y1+(y2-y1)*t;
      ctx.beginPath();
      ctx.moveTo(rx+nx, ry+ny);
      ctx.lineTo(rx-nx, ry-ny);
      ctx.strokeStyle = '#4CAF5088';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();

    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🪜', x1, y1);
  }

  function drawPlayers() {
    const players = state.players || [];
    const positions = state.positions || {};

    // Group by position to offset
    const posGroups = {};
    players.forEach((p, i) => {
      const pos = positions[p.id] || 0;
      if (!posGroups[pos]) posGroups[pos] = [];
      posGroups[pos].push({ player: p, index: i });
    });

    Object.entries(posGroups).forEach(([pos, group]) => {
      const [bx, by] = cellToXY(+pos);
      group.forEach(({ player, index }, gi) => {
        const offX = (gi % 2 - 0.5) * 14;
        const offY = (Math.floor(gi/2) - 0.5) * 14;
        const cx   = bx + offX, cy = by + offY;
        const color = PLAYER_COLORS[index];

        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI*2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(player.nickname?.[0]?.toUpperCase() || '?', cx, cy);
      });
    });
  }

  function renderDice() {
    const el    = document.getElementById('serpentDice');
    const faces = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
    el.textContent = state?.dice ? (faces[state.dice] || '🎲') : '🎲';
    const myTurn = state?.currentTurn === session.playerId;
    el.style.opacity = myTurn ? '1' : '0.4';
    el.style.cursor  = myTurn ? 'pointer' : 'default';
  }

  function renderInfo() {
    const el  = document.getElementById('serpentInfo');
    const myTurn = state?.currentTurn === session.playerId;
    const cur  = state?.players?.find(p => p.id === state.currentTurn);
    el.textContent = myTurn ? '🎲 Click the dice to roll!' : `⏳ ${cur?.nickname || 'Opponent'}'s turn…`;
  }

  function renderScores() {
    const wrap = document.getElementById('serpentScores');
    if (!state) return;
    wrap.innerHTML = (state.players || []).map((p, i) => `
      <div style="display:flex;align-items:center;gap:6px;background:var(--bg3);border:1px solid var(--border);padding:8px 14px;border-radius:8px;font-family:var(--font-head)">
        <span style="font-size:16px">${PLAYER_EMOJIS[i]}</span>
        <span style="font-size:14px">${p.nickname}</span>
        <span style="font-size:18px;color:var(--accent);font-weight:700">${state.positions?.[p.id] || 0}</span>
      </div>
    `).join('');
  }

  function renderEvent() {
    const el  = document.getElementById('serpentEvent');
    const evt = state?.lastEvent;
    if (!evt) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.className = `event-banner ${evt.type}`;
    el.textContent = evt.type === 'snake'
      ? `🐍 SNAKE! ${evt.from} → ${evt.to}`
      : `🪜 LADDER! ${evt.from} → ${evt.to}`;
  }

  function onRoll() {
    if (!state) return;
    if (state.currentTurn !== session.playerId) return showToast?.('Not your turn!');
    sendMove({ action: 'roll' });

    const el = document.getElementById('serpentDice');
    el.classList.add('rolling');
    setTimeout(() => el.classList.remove('rolling'), 400);
  }

  function reset() { state = null; drawBoard(); }

  return { init, update, reset };
})();
