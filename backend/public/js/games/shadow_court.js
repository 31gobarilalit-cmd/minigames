/**
 * Shadow Court — Frontend Renderer
 * Legislative social deduction: Loyalists vs Conspirators + Mastermind
 */
window.GameRenderer = (() => {
  let session, sendMove, state;
  let myRole = null;

  const ROLE_INFO = {
    loyalist:    { icon: '\u{1F7E2}', label: 'LOYALIST',    color: '#2e7d32', tip: 'Pass Loyal Decrees and find the Mastermind.' },
    conspirator: { icon: '\u{1F534}', label: 'CONSPIRATOR', color: '#c62828', tip: 'Pass Corrupt Decrees and protect the Mastermind.' },
    mastermind:  { icon: '\u{1F480}', label: 'MASTERMIND',  color: '#4a148c', tip: 'Stay hidden. Get elected Advisor after 3 Corrupt Decrees to win.' }
  };

  function init(_session, _sendMove) {
    session  = _session;
    sendMove = _sendMove;

    document.getElementById('gameWrap').innerHTML = `
      <style>
        .sc-wrap { max-width: 800px; margin: 0 auto; font-family: var(--font-body, sans-serif); color: #eee; }
        .sc-role-card { background: #222; border-radius: 12px; padding: 16px; margin-bottom: 12px; text-align: center; border: 2px solid #444; }
        .sc-role-icon { font-size: 36px; }
        .sc-role-label { font-size: 18px; font-weight: bold; letter-spacing: 2px; margin-top: 4px; }
        .sc-role-tip { font-size: 12px; color: #aaa; margin-top: 6px; }
        .sc-knowledge { font-size: 12px; color: #ccc; margin-top: 8px; background: rgba(255,255,255,0.05); padding: 6px 10px; border-radius: 6px; }
        .sc-tracks { display: flex; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
        .sc-track { flex: 1; min-width: 200px; background: #1a1a2e; border-radius: 10px; padding: 12px; }
        .sc-track-title { font-size: 13px; font-weight: bold; letter-spacing: 1px; margin-bottom: 8px; }
        .sc-slots { display: flex; gap: 6px; }
        .sc-slot { width: 36px; height: 48px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
                   font-size: 11px; font-weight: bold; border: 2px solid rgba(255,255,255,0.15); position: relative; }
        .sc-slot.filled { opacity: 1; }
        .sc-slot.empty { opacity: 0.4; }
        .sc-slot .sc-power-label { position: absolute; bottom: -14px; font-size: 9px; color: #aaa; white-space: nowrap; }
        .sc-loyal-slot { background: #1b5e20; }
        .sc-loyal-slot.filled { background: #2e7d32; border-color: #4caf50; }
        .sc-corrupt-slot { background: #4a0000; }
        .sc-corrupt-slot.filled { background: #b71c1c; border-color: #ef5350; }
        .sc-election-tracker { display: flex; gap: 8px; margin-bottom: 14px; align-items: center; }
        .sc-et-dot { width: 24px; height: 24px; border-radius: 50%; background: #333; border: 2px solid #555;
                     display: flex; align-items: center; justify-content: center; font-size: 12px; }
        .sc-et-dot.active { background: #e65100; border-color: #ff9800; }
        .sc-players { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
        .sc-player { background: #222; border-radius: 8px; padding: 10px 14px; min-width: 120px; cursor: default;
                     border: 2px solid transparent; transition: border-color 0.2s; position: relative; }
        .sc-player.clickable { cursor: pointer; border-color: #555; }
        .sc-player.clickable:hover { border-color: #90caf9; }
        .sc-player.regent { border-color: #ffd600; }
        .sc-player.advisor { border-color: #7c4dff; }
        .sc-player.dead { opacity: 0.4; text-decoration: line-through; }
        .sc-player-name { font-size: 13px; font-weight: bold; }
        .sc-player-tag { font-size: 10px; color: #aaa; }
        .sc-player-vote { font-size: 11px; margin-top: 4px; }
        .sc-actions { background: #1a1a2e; border-radius: 10px; padding: 16px; margin-bottom: 12px; min-height: 60px; }
        .sc-actions-title { font-size: 13px; font-weight: bold; letter-spacing: 1px; margin-bottom: 10px; color: #90caf9; }
        .sc-btn { padding: 8px 18px; border: none; border-radius: 6px; font-size: 13px; font-weight: bold;
                  cursor: pointer; margin: 4px; transition: background 0.2s; }
        .sc-btn-ja { background: #2e7d32; color: #fff; }
        .sc-btn-ja:hover { background: #388e3c; }
        .sc-btn-nein { background: #c62828; color: #fff; }
        .sc-btn-nein:hover { background: #d32f2f; }
        .sc-btn-action { background: #1565c0; color: #fff; }
        .sc-btn-action:hover { background: #1976d2; }
        .sc-btn-danger { background: #b71c1c; color: #fff; }
        .sc-btn-danger:hover { background: #c62828; }
        .sc-policy-card { display: inline-flex; align-items: center; justify-content: center;
                          width: 60px; height: 84px; border-radius: 8px; margin: 4px; font-size: 12px;
                          font-weight: bold; cursor: pointer; border: 2px solid transparent; transition: border-color 0.2s; }
        .sc-policy-loyal { background: #1b5e20; color: #a5d6a7; border-color: #388e3c; }
        .sc-policy-loyal:hover { border-color: #81c784; }
        .sc-policy-corrupt { background: #4a0000; color: #ef9a9a; border-color: #c62828; }
        .sc-policy-corrupt:hover { border-color: #ef5350; }
        .sc-log { background: #111; border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #888;
                  max-height: 120px; overflow-y: auto; line-height: 1.6; }
        .sc-phase-banner { text-align: center; font-size: 14px; font-weight: bold; letter-spacing: 2px;
                          color: #ffd600; margin-bottom: 10px; padding: 6px; background: rgba(255,214,0,0.08);
                          border-radius: 8px; }
        .sc-deck-info { font-size: 11px; color: #777; text-align: center; margin-bottom: 8px; }
        .sc-peek-cards { display: flex; gap: 8px; justify-content: center; margin: 10px 0; }
      </style>
      <div class="sc-wrap">
        <div id="scRole" class="sc-role-card"></div>
        <div id="scPhase" class="sc-phase-banner"></div>
        <div id="scTracks" class="sc-tracks"></div>
        <div id="scElection" class="sc-election-tracker"></div>
        <div id="scDeckInfo" class="sc-deck-info"></div>
        <div id="scPlayers" class="sc-players"></div>
        <div id="scActions" class="sc-actions"></div>
        <div id="scLog" class="sc-log"></div>
      </div>
    `;
  }

  function update(_state) {
    state = _state;
    myRole = state.myRole || myRole;
    renderRole();
    renderPhase();
    renderTracks();
    renderElectionTracker();
    renderDeckInfo();
    renderPlayers();
    renderActions();
    renderLog();
  }

  function renderRole() {
    const el = document.getElementById('scRole');
    if (!myRole) { el.innerHTML = '<div class="sc-role-icon">...</div><div class="sc-role-label">Waiting...</div>'; return; }
    const info = ROLE_INFO[myRole];
    let html = `
      <div class="sc-role-icon">${info.icon}</div>
      <div class="sc-role-label" style="color:${info.color}">${info.label}</div>
      <div class="sc-role-tip">${info.tip}</div>
    `;
    // Show known players
    if (state.knownPlayers && state.knownPlayers.length > 0) {
      const names = state.knownPlayers.map(kp => {
        const p = state.players.find(pl => pl.id === kp.id);
        const ri = ROLE_INFO[kp.role];
        return `${p ? escHtml(p.nickname) : kp.id} (${ri ? ri.label : kp.role})`;
      }).join(', ');
      html += `<div class="sc-knowledge">You know: ${names}</div>`;
    }
    el.innerHTML = html;
    el.style.borderColor = info.color;
  }

  function renderPhase() {
    const el = document.getElementById('scPhase');
    const labels = {
      nominate: 'NOMINATION PHASE',
      vote: 'VOTING PHASE',
      regent_discard: 'REGENT LEGISLATING',
      advisor_enact: 'ADVISOR LEGISLATING',
      power_investigate: 'REGENT POWER: INVESTIGATE',
      power_peek: 'REGENT POWER: PEEK',
      power_special_election: 'REGENT POWER: SPECIAL ELECTION',
      power_execute: 'REGENT POWER: EXECUTE',
      game_over: 'GAME OVER'
    };
    const phase = state.phase || 'nominate';
    el.textContent = labels[phase] || phase.toUpperCase();
  }

  function renderTracks() {
    const el = document.getElementById('scTracks');
    const tier = state.players.length <= 6 ? 'small' : (state.players.length <= 8 ? 'medium' : 'large');
    const powers = {
      small:  [null, null, 'Peek', 'Kill', 'Kill'],
      medium: [null, 'Spy', 'Elect', 'Kill', 'Kill'],
      large:  ['Spy', 'Spy', 'Elect', 'Kill', 'Kill']
    }[tier];

    // Loyal track (5 slots)
    let loyalHtml = '<div class="sc-track"><div class="sc-track-title" style="color:#4caf50">LOYAL DECREES</div><div class="sc-slots">';
    for (let i = 0; i < 5; i++) {
      const filled = i < (state.loyalPolicies || 0);
      loyalHtml += `<div class="sc-slot sc-loyal-slot ${filled ? 'filled' : 'empty'}">${filled ? '\u2714' : (i + 1)}</div>`;
    }
    loyalHtml += '</div></div>';

    // Corrupt track (6 slots with power labels)
    let corruptHtml = '<div class="sc-track"><div class="sc-track-title" style="color:#ef5350">CORRUPT DECREES</div><div class="sc-slots" style="margin-bottom:18px">';
    for (let i = 0; i < 6; i++) {
      const filled = i < (state.corruptPolicies || 0);
      const power = i < 5 ? powers[i] : null;
      corruptHtml += `<div class="sc-slot sc-corrupt-slot ${filled ? 'filled' : 'empty'}">${filled ? '\u2714' : (i + 1)}`;
      if (power) corruptHtml += `<span class="sc-power-label">${power}</span>`;
      corruptHtml += '</div>';
    }
    corruptHtml += '</div></div>';

    el.innerHTML = loyalHtml + corruptHtml;
  }

  function renderElectionTracker() {
    const el = document.getElementById('scElection');
    const tracker = state.electionTracker || 0;
    let html = '<span style="font-size:12px;color:#aaa;margin-right:8px">Election Tracker:</span>';
    for (let i = 0; i < 3; i++) {
      html += `<div class="sc-et-dot ${i < tracker ? 'active' : ''}">${i < tracker ? '\u2716' : ''}</div>`;
    }
    el.innerHTML = html;
  }

  function renderDeckInfo() {
    const el = document.getElementById('scDeckInfo');
    el.textContent = `Deck: ${state.deckSize || 0} | Discard: ${state.discardSize || 0}`;
  }

  function renderPlayers() {
    const el = document.getElementById('scPlayers');
    const players = state.players || [];
    const phase = state.phase || '';
    const isNominate = phase === 'nominate' && state.regentId === session.playerId;
    const isPowerTarget = (phase === 'power_investigate' || phase === 'power_special_election' || phase === 'power_execute')
                          && state.regentId === session.playerId;

    el.innerHTML = '';
    players.forEach(p => {
      const div = document.createElement('div');
      const isRegent = p.id === state.regentId;
      const isAdvisor = p.id === state.advisorId;
      const isDead = !p.alive;
      const isMe = p.id === session.playerId;
      const revRole = state.revealedAssignments?.[p.id];

      let classes = 'sc-player';
      if (isRegent) classes += ' regent';
      if (isAdvisor) classes += ' advisor';
      if (isDead) classes += ' dead';

      // Clickable for nomination or power targets
      const canClick = !isDead && !isMe && p.id !== state.regentId &&
        ((isNominate && !isTermLimited(p.id)) || isPowerTarget);
      if (canClick) classes += ' clickable';

      div.className = classes;

      let tags = [];
      if (isRegent) tags.push('\u{1F451} Regent');
      if (isAdvisor) tags.push('\u{1F3DB} Advisor');
      if (isDead) tags.push('\u{1F480} Dead');
      if (isMe) tags.push('(you)');
      if (revRole) {
        const ri = ROLE_INFO[revRole];
        tags.push(`${ri ? ri.icon : ''} ${revRole}`);
      }

      // Show votes if voting is done (phase moved past vote)
      let voteHtml = '';
      if (state.votes && state.votes[p.id] && (phase !== 'vote' || Object.keys(state.votes).length === players.filter(pl => pl.alive).length)) {
        const v = state.votes[p.id];
        voteHtml = `<div class="sc-player-vote">${v === 'ja' ? '\u2705 Ja' : '\u274C Nein'}</div>`;
      }

      div.innerHTML = `
        <div class="sc-player-name">${escHtml(p.nickname)}</div>
        <div class="sc-player-tag">${tags.join(' | ')}</div>
        ${voteHtml}
      `;

      if (canClick) {
        div.addEventListener('click', () => {
          if (isNominate) {
            sendMove({ action: 'nominate_advisor', targetId: p.id });
          } else if (phase === 'power_investigate') {
            sendMove({ action: 'investigate', targetId: p.id });
          } else if (phase === 'power_special_election') {
            sendMove({ action: 'special_election', targetId: p.id });
          } else if (phase === 'power_execute') {
            sendMove({ action: 'execute', targetId: p.id });
          }
        });
      }

      el.appendChild(div);
    });
  }

  function isTermLimited(pid) {
    // Approximate term limit check on client side
    if (pid === state.prevAdvisorId) return true;
    const alive = (state.players || []).filter(p => p.alive);
    if (alive.length > 5 && pid === state.prevRegentId) return true;
    return false;
  }

  function renderActions() {
    const el = document.getElementById('scActions');
    const phase = state.phase || '';
    const isRegent = state.regentId === session.playerId;
    const isAdvisor = state.advisorId === session.playerId;
    el.innerHTML = '';

    // ── NOMINATE ──
    if (phase === 'nominate') {
      if (isRegent) {
        el.innerHTML = '<div class="sc-actions-title">NOMINATE AN ADVISOR</div><p style="font-size:12px;color:#aaa">Click a player above to nominate them.</p>';
      } else {
        const regentName = playerName(state.regentId);
        el.innerHTML = `<div class="sc-actions-title">WAITING FOR REGENT</div><p style="font-size:12px;color:#aaa">${escHtml(regentName)} is choosing an Advisor...</p>`;
      }
      return;
    }

    // ── VOTE ──
    if (phase === 'vote') {
      const alreadyVoted = state.votes && state.votes[session.playerId] !== undefined;
      const regentName = playerName(state.regentId);
      const advisorName = playerName(state.advisorId);
      el.innerHTML = `<div class="sc-actions-title">VOTE: ${escHtml(regentName)} + ${escHtml(advisorName)}</div>`;
      if (alreadyVoted) {
        el.innerHTML += '<p style="font-size:12px;color:#aaa">Vote cast. Waiting for others...</p>';
      } else {
        const jaBtn = document.createElement('button');
        jaBtn.className = 'sc-btn sc-btn-ja';
        jaBtn.textContent = 'JA (Yes)';
        jaBtn.onclick = () => sendMove({ action: 'vote', value: 'ja' });
        const neinBtn = document.createElement('button');
        neinBtn.className = 'sc-btn sc-btn-nein';
        neinBtn.textContent = 'NEIN (No)';
        neinBtn.onclick = () => sendMove({ action: 'vote', value: 'nein' });
        el.appendChild(jaBtn);
        el.appendChild(neinBtn);
      }
      return;
    }

    // ── REGENT DISCARD ──
    if (phase === 'regent_discard') {
      if (isRegent && state.drawnPolicies) {
        el.innerHTML = '<div class="sc-actions-title">DISCARD ONE POLICY</div><p style="font-size:12px;color:#aaa">Click a card to discard it. The remaining 2 go to the Advisor.</p>';
        const cardsDiv = document.createElement('div');
        cardsDiv.style.display = 'flex';
        cardsDiv.style.justifyContent = 'center';
        state.drawnPolicies.forEach((card, idx) => {
          const cardEl = document.createElement('div');
          cardEl.className = `sc-policy-card sc-policy-${card}`;
          cardEl.textContent = card === 'loyal' ? 'LOYAL' : 'CORRUPT';
          cardEl.onclick = () => sendMove({ action: 'discard_policy', index: idx });
          cardsDiv.appendChild(cardEl);
        });
        el.appendChild(cardsDiv);
      } else {
        el.innerHTML = '<div class="sc-actions-title">REGENT IS LEGISLATING</div><p style="font-size:12px;color:#aaa">The Regent is reviewing policies...</p>';
      }
      return;
    }

    // ── ADVISOR ENACT ──
    if (phase === 'advisor_enact') {
      if (isAdvisor && state.passedPolicies) {
        el.innerHTML = '<div class="sc-actions-title">ENACT ONE POLICY</div><p style="font-size:12px;color:#aaa">Click a card to enact it.</p>';
        const cardsDiv = document.createElement('div');
        cardsDiv.style.display = 'flex';
        cardsDiv.style.justifyContent = 'center';
        state.passedPolicies.forEach((card, idx) => {
          const cardEl = document.createElement('div');
          cardEl.className = `sc-policy-card sc-policy-${card}`;
          cardEl.textContent = card === 'loyal' ? 'LOYAL' : 'CORRUPT';
          cardEl.onclick = () => sendMove({ action: 'enact_policy', index: idx });
          cardsDiv.appendChild(cardEl);
        });
        el.appendChild(cardsDiv);
      } else {
        el.innerHTML = '<div class="sc-actions-title">ADVISOR IS LEGISLATING</div><p style="font-size:12px;color:#aaa">The Advisor is choosing a policy...</p>';
      }
      return;
    }

    // ── POWER: INVESTIGATE ──
    if (phase === 'power_investigate') {
      if (isRegent) {
        if (state.investigatedParty) {
          const tName = playerName(state.investigatedParty.targetId);
          el.innerHTML = `<div class="sc-actions-title">INVESTIGATION RESULT</div>
            <p style="font-size:13px;color:#fff">${escHtml(tName)} is a <strong style="color:${state.investigatedParty.party === 'loyalist' ? '#4caf50' : '#ef5350'}">${state.investigatedParty.party.toUpperCase()}</strong>.</p>`;
        } else {
          el.innerHTML = '<div class="sc-actions-title">INVESTIGATE A PLAYER</div><p style="font-size:12px;color:#aaa">Click a player above to see their party membership.</p>';
        }
      } else {
        el.innerHTML = '<div class="sc-actions-title">REGENT IS INVESTIGATING</div><p style="font-size:12px;color:#aaa">The Regent is investigating a player...</p>';
      }
      return;
    }

    // ── POWER: PEEK ──
    if (phase === 'power_peek') {
      if (isRegent) {
        el.innerHTML = '<div class="sc-actions-title">TOP 3 POLICIES</div>';
        if (state.peekCards) {
          const cardsDiv = document.createElement('div');
          cardsDiv.className = 'sc-peek-cards';
          state.peekCards.forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = `sc-policy-card sc-policy-${card}`;
            cardEl.textContent = card === 'loyal' ? 'LOYAL' : 'CORRUPT';
            cardEl.style.cursor = 'default';
            cardsDiv.appendChild(cardEl);
          });
          el.appendChild(cardsDiv);
          const doneBtn = document.createElement('button');
          doneBtn.className = 'sc-btn sc-btn-action';
          doneBtn.textContent = 'OK, Continue';
          doneBtn.onclick = () => sendMove({ action: 'peek_done' });
          el.appendChild(doneBtn);
        }
      } else {
        el.innerHTML = '<div class="sc-actions-title">REGENT IS PEEKING</div><p style="font-size:12px;color:#aaa">The Regent is viewing the top 3 policies...</p>';
      }
      return;
    }

    // ── POWER: SPECIAL ELECTION ──
    if (phase === 'power_special_election') {
      if (isRegent) {
        el.innerHTML = '<div class="sc-actions-title">CHOOSE NEXT REGENT</div><p style="font-size:12px;color:#aaa">Click a player above to make them the next Regent.</p>';
      } else {
        el.innerHTML = '<div class="sc-actions-title">SPECIAL ELECTION</div><p style="font-size:12px;color:#aaa">The Regent is choosing the next Regent...</p>';
      }
      return;
    }

    // ── POWER: EXECUTE ──
    if (phase === 'power_execute') {
      if (isRegent) {
        el.innerHTML = '<div class="sc-actions-title">EXECUTE A PLAYER</div><p style="font-size:12px;color:#aaa">Click a player above to execute them.</p>';
      } else {
        el.innerHTML = '<div class="sc-actions-title">EXECUTION</div><p style="font-size:12px;color:#aaa">The Regent is choosing who to execute...</p>';
      }
      return;
    }

    // ── GAME OVER ──
    if (phase === 'game_over') {
      const winner = state.winner;
      const reason = state.winReason || '';
      el.innerHTML = `<div class="sc-actions-title">GAME OVER</div>
        <p style="font-size:16px;font-weight:bold;color:${winner === 'loyalists' ? '#4caf50' : '#ef5350'}">
          ${winner === 'loyalists' ? 'LOYALISTS WIN!' : 'CONSPIRATORS WIN!'}
        </p>
        <p style="font-size:12px;color:#aaa">${escHtml(reason)}</p>`;
      return;
    }
  }

  function renderLog() {
    const el = document.getElementById('scLog');
    const log = state.log || [];
    if (log.length === 0) {
      el.textContent = 'Game started. The Regent must nominate an Advisor.';
      return;
    }
    el.innerHTML = log.map(l => `<div>${escHtml(l)}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  }

  function playerName(id) {
    return (state.players || []).find(p => p.id === id)?.nickname || id;
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function reset() { state = null; myRole = null; }

  return { init, update, reset };
})();
