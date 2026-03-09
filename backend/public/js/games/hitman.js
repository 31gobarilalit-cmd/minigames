/**
 * Hitman — Frontend Renderer
 * Social deduction: one hidden hitman among players.
 */
window.GameRenderer = (() => {
  let session, sendMove, state;
  let myRole = null;
  let selectedVote = null;
  let phase = 'discussion';

  const ROLE_INFO = {
    hitman:    { icon:'🎯', label:'HITMAN',   color:'role-hitman',   tip:'Blend in. Eliminate one player per round without being caught.' },
    detective: { icon:'🔍', label:'DETECTIVE', color:'role-detective', tip:'You know who one random civilian is. Find the hitman!' },
    civilian:  { icon:'👤', label:'CIVILIAN',  color:'role-civilian',  tip:'Work together to find and vote out the hitman.' }
  };

  function init(_session, _sendMove) {
    session  = _session;
    sendMove = _sendMove;

    document.getElementById('gameWrap').innerHTML = `
      <div class="hitman-wrap">
        <div id="hmRole" class="hitman-role-card">
          <div class="role-icon">⌛</div>
          <div class="role-label">Waiting for game state…</div>
        </div>
        <div id="hmPhase" style="font-family:var(--font-head);font-size:13px;color:var(--text-dim);letter-spacing:2px;margin-bottom:14px;text-align:center"></div>
        <div id="hmLog" style="font-size:12px;color:var(--text-dim);background:var(--bg3);border-radius:8px;padding:10px 14px;margin-bottom:14px;min-height:36px"></div>
        <div class="players-list" id="hmPlayers"></div>
        <div class="action-bar" id="hmActions"></div>
      </div>
    `;
  }

  function update(_state) {
    state = _state;
    myRole = state.myRole || myRole;

    renderRole();
    renderPhase();
    renderPlayers();
    renderActions();
  }

  function renderRole() {
    if (!myRole) return;
    const info = ROLE_INFO[myRole];
    const el   = document.getElementById('hmRole');
    el.className = `hitman-role-card ${info.color}`;
    el.innerHTML = `
      <div class="role-icon">${info.icon}</div>
      <div class="role-label">${info.label}</div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:6px">${info.tip}</div>
    `;
  }

  function renderPhase() {
    phase = state.phase || 'discussion';
    const labels = { discussion:'💬 Discussion Phase', voting:'🗳️ Voting Phase', reveal:'📢 Results' };
    document.getElementById('hmPhase').textContent = labels[phase] || phase;
    const log = document.getElementById('hmLog');
    log.textContent = state.eliminated?.length
      ? `Eliminated: ${state.eliminated.map(id => playerName(id)).join(', ')}`
      : 'No eliminations yet. Discuss and find the hitman!';
  }

  function renderPlayers() {
    const wrap    = document.getElementById('hmPlayers');
    const players = state.players || [];
    wrap.innerHTML = '';

    players.forEach(p => {
      const row  = document.createElement('div');
      const dead = !p.alive;
      row.className = 'player-row' + (dead ? ' dead' : '');

      const isMe   = p.id === session.playerId;
      const isSel  = selectedVote === p.id;
      const revRole = state.revealedAssignments?.[p.id];

      row.innerHTML = `
        <span class="p-name">${escHtml(p.nickname)}${isMe ? ' (you)' : ''}${revRole ? ` — ${ROLE_INFO[revRole]?.icon} ${revRole}` : ''}</span>
        ${!dead && !isMe && phase === 'voting'
          ? `<button class="vote-btn${isSel ? ' selected' : ''}" data-pid="${p.id}">
              ${isSel ? '✓ Selected' : 'Vote Out'}
             </button>`
          : `<span class="p-status">${dead ? '💀 Eliminated' : '🟢 Alive'}</span>`
        }
      `;
      wrap.appendChild(row);
    });

    // Vote button listeners
    wrap.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedVote = btn.dataset.pid;
        renderPlayers();
        renderActions();
      });
    });
  }

  function renderActions() {
    const bar  = document.getElementById('hmActions');
    const isMe = true; // always show relevant actions
    bar.innerHTML = '';

    if (phase === 'discussion') {
      addBtn(bar, '🗳️ Start Vote', 'action-btn', () => sendMove({ action:'start_vote' }));
      if (myRole === 'hitman') {
        addBtn(bar, '🎯 Eliminate', 'action-btn danger', () => {
          const target = state.players?.find(p => p.alive && p.id !== session.playerId);
          if (!target) return;
          // Simple auto-select first alive non-self target (in real game, pick from list)
          selectedElim = target.id;
          renderElimPicker();
        });
      }
    }

    if (phase === 'voting' && selectedVote) {
      addBtn(bar, `✅ Confirm Vote`, 'action-btn', () => {
        sendMove({ action:'vote', targetId: selectedVote });
        selectedVote = null;
      });
    }
  }

  function renderElimPicker() {
    const bar = document.getElementById('hmActions');
    bar.innerHTML = '<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;font-family:var(--font-head);letter-spacing:1px">CHOOSE TARGET:</div>';
    state.players.filter(p => p.alive && p.id !== session.playerId).forEach(p => {
      addBtn(bar, `💀 ${escHtml(p.nickname)}`, 'action-btn danger', () => {
        sendMove({ action:'hitman_eliminate', targetId: p.id });
      });
    });
    addBtn(bar, 'Cancel', 'action-btn', () => renderActions());
  }

  function addBtn(parent, label, cls, cb) {
    const b = document.createElement('button');
    b.className = cls;
    b.innerHTML = label;
    b.onclick = cb;
    parent.appendChild(b);
  }

  function playerName(id) {
    return state.players?.find(p => p.id === id)?.nickname || id;
  }

  function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function reset() { state = null; myRole = null; selectedVote = null; }

  return { init, update, reset };
})();
