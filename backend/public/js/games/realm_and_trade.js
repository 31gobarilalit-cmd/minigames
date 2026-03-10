/**
 * Realm & Trade — Frontend Renderer
 * Realm & Trade resource-settlement game with hex board canvas + resource panel.
 */
window.GameRenderer = (() => {
  let session, sendMove, state;
  let canvas, ctx;
  let myPlayer = null;

  const RES_ICONS  = { wood:'🪵', brick:'🧱', wheat:'🌾', sheep:'🐑', ore:'⛏️', desert:'🏜️' };
  const RES_COLORS = { wood:'#4a7c3f', brick:'#a0522d', wheat:'#d4a017', sheep:'#7db87d', ore:'#708090', desert:'#c2a97a' };
  const HEX_R = 48;

  // Hex grid layout (19 tiles for Realm & Trade board)
  const HEX_LAYOUT = [
    [0,1,2],
    [3,4,5,6],
    [7,8,9,10,11],  // middle row — longest
    [12,13,14,15],
    [16,17,18]
  ];

  function init(_session, _sendMove) {
    session  = _session;
    sendMove = _sendMove;

    document.getElementById('gameWrap').innerHTML = `
      <div class="realm-wrap">
        <canvas id="realmCanvas" class="realm-canvas"></canvas>
        <div id="realmInfo" style="text-align:center;font-family:var(--font-head);font-size:14px;color:var(--accent);margin:6px 0"></div>
        <div id="diceDisplay" style="text-align:center;font-size:36px;margin:4px 0"></div>
        <div class="realm-sidebar" id="realmResources"></div>
        <div class="realm-actions" id="realmActions"></div>
      </div>
    `;

    canvas = document.getElementById('realmCanvas');
    ctx    = canvas.getContext('2d');
    canvas.width  = 600;
    canvas.height = 520;
    canvas.style.maxWidth = '100%';

    drawBoard();
  }

  function update(_state) {
    state = _state;
    myPlayer = state.players?.find(p => p.id === session.playerId);

    drawBoard();
    renderResources();
    renderActions();
    renderInfo();

    if (state.dice) {
      const d = state.dice;
      const faces = ['', '⚀','⚁','⚂','⚃','⚄','⚅'];
      document.getElementById('diceDisplay').textContent = (faces[d[0]]||'') + ' ' + (faces[d[1]]||'');
    }
  }

  function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw ocean background
    const grad = ctx.createRadialGradient(300,260,80,300,260,260);
    grad.addColorStop(0, '#1a3a5c');
    grad.addColorStop(1, '#0d1b2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!state) { drawPlaceholder(); return; }

    // Draw hexagons
    const tiles = state.tiles || [];
    const CX = canvas.width / 2;
    const CY = canvas.height / 2 - 10;
    const W  = HEX_R * Math.sqrt(3);
    const H  = HEX_R * 2;

    HEX_LAYOUT.forEach((row, ri) => {
      const rowLen = row.length;
      const maxLen = HEX_LAYOUT[2].length;
      const offsetX = (maxLen - rowLen) * W / 2;
      const startX  = CX - (maxLen * W) / 2;
      const y = CY + (ri - 2) * (H * 0.75);

      row.forEach((tileIdx, ci) => {
        const x = startX + offsetX + ci * W + W/2;
        if (tiles[tileIdx]) drawHex(x, y, tiles[tileIdx]);
      });
    });

    // Draw player settlements/roads
    if (state.players) {
      state.players.forEach(p => {
        p.settlements?.forEach(v => drawSettlement(v, p.color, false));
        p.cities?.forEach(v => drawSettlement(v, p.color, true));
      });
    }
  }

  function drawHex(cx, cy, tile) {
    const r = HEX_R - 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 180 * (60 * i - 30);
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.fillStyle = RES_COLORS[tile.type] || '#888';
    ctx.fill();
    ctx.strokeStyle = '#111118';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Resource icon
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(RES_ICONS[tile.type] || '?', cx, cy - 8);

    // Number token
    if (tile.number) {
      ctx.beginPath();
      ctx.arc(cx, cy+14, 14, 0, Math.PI*2);
      ctx.fillStyle = tile.number === 6 || tile.number === 8 ? '#ff5f57' : '#f5f0e0';
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `bold ${tile.number >= 10 ? '11' : '13'}px var(--font-head, sans-serif)`;
      ctx.fillText(tile.number, cx, cy+14);
    }
  }

  function drawSettlement(vertexId, color, isCity) {
    // Simplified: map vertex IDs to canvas positions
    const x = 80 + (vertexId % 11) * 40;
    const y = 80 + Math.floor(vertexId / 11) * 40;
    ctx.beginPath();
    ctx.arc(x, y, isCity ? 10 : 7, 0, Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawPlaceholder() {
    ctx.font = '64px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏝️', canvas.width/2, canvas.height/2);
    ctx.fillStyle = '#7070a0';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('Generating board…', canvas.width/2, canvas.height/2 + 60);
  }

  function renderResources() {
    const wrap = document.getElementById('realmResources');
    if (!myPlayer) return;
    wrap.innerHTML = Object.entries(myPlayer.resources || {}).map(([r,n]) => `
      <div class="resource-card">
        <div class="res-icon">${RES_ICONS[r] || r}</div>
        <div class="res-name">${r.toUpperCase()}</div>
        <div class="res-count">${n}</div>
      </div>
    `).join('') + `<div class="resource-card">
      <div class="res-icon">🏆</div>
      <div class="res-name">VP</div>
      <div class="res-count">${myPlayer?.vp || 0}/10</div>
    </div>`;
  }

  function renderActions() {
    const bar = document.getElementById('realmActions');
    const isMyTurn = state?.currentTurn === session.playerId;
    const canAfford = (cost) => Object.entries(cost).every(([r,n]) => (myPlayer?.resources?.[r]||0) >= n);

    bar.innerHTML = '';
    if (!isMyTurn) { bar.innerHTML = '<div style="color:var(--text-dim);font-family:var(--font-head);font-size:13px;letter-spacing:1px">⏳ Waiting for opponent…</div>'; return; }

    // Setup phase: only settlement + road placement (free)
    if (state?.phase === 'setup') {
      const setupActions = [
        { label:'🏠 Place Settlement (free)', action:'build_settlement' },
        { label:'🛤️ Place Road (free)', action:'build_road' },
      ];
      setupActions.forEach(({ label, action }) => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.textContent = label;
        btn.onclick = () => {
          if (action === 'build_settlement') {
            const v = prompt('Enter vertex number (0-53):');
            if (v !== null) sendMove({ action, vertex: parseInt(v) });
          } else {
            const e = prompt('Enter edge number (0-71):');
            if (e !== null) sendMove({ action, edge: parseInt(e) });
          }
        };
        bar.appendChild(btn);
      });
      return;
    }

    // Main phase actions
    const diceRolled = state?.diceRolled;
    const actions = [
      { label:'🎲 Roll Dice', action:'roll_dice', cost:{}, disabled: diceRolled || state?.phase_action === 'move_robber' },
      { label:'🏠 Settlement', action:'build_settlement', cost:{wood:1,brick:1,wheat:1,sheep:1}, disabled: !diceRolled },
      { label:'🏙️ City',       action:'build_city',       cost:{ore:3,wheat:2}, disabled: !diceRolled },
      { label:'🛤️ Road',       action:'build_road',       cost:{wood:1,brick:1}, disabled: !diceRolled },
      { label:'🔄 Trade 4:1', action:'trade',             cost:{}, disabled: !diceRolled },
      { label:'⏩ End Turn',   action:'end_turn',         cost:{}, disabled: !diceRolled },
    ];

    actions.forEach(({ label, action, cost, disabled }) => {
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.textContent = label;
      btn.disabled = disabled;
      const affordable = !Object.keys(cost).length || canAfford(cost);
      btn.style.opacity = disabled ? .3 : (affordable ? 1 : .4);
      btn.onclick = () => {
        if (action === 'trade') {
          const give    = prompt('Give resource (wood/brick/wheat/sheep/ore):');
          const receive = prompt('Receive resource:');
          if (give && receive) sendMove({ action, give, receive });
        } else if (action === 'build_settlement' || action === 'build_city') {
          const v = prompt('Enter vertex number (0-53):');
          if (v !== null) sendMove({ action, vertex: parseInt(v) });
        } else if (action === 'build_road') {
          const e = prompt('Enter edge number (0-71):');
          if (e !== null) sendMove({ action, edge: parseInt(e) });
        } else {
          sendMove({ action });
        }
      };
      bar.appendChild(btn);
    });
  }

  function renderInfo() {
    const el = document.getElementById('realmInfo');
    if (!state) return;
    const isMyTurn = state.currentTurn === session.playerId;
    if (state.phase === 'setup') {
      el.textContent = isMyTurn ? '⚡ Setup: Place a settlement and a road (free)' : '⏳ Setup: Waiting for opponent…';
    } else {
      el.textContent = isMyTurn ? '⚡ Your turn! Roll dice first.' : '⏳ Opponent\'s turn…';
    }
  }

  function reset() { state = null; myPlayer = null; drawBoard(); }

  return { init, update, reset };
})();
