/**
 * lobby.js — Lobby page: public/private room management via Socket.IO
 */

const socket = io();
let myRoomId = null;
let myPlayerId = null;
let currentGame = null;

/* ── Load game info ── */
const params  = new URLSearchParams(window.location.search);
const gameId  = params.get('game');

async function init() {
  try {
    const res  = await fetch(`/api/games/${gameId}`);
    currentGame = await res.json();
    document.getElementById('gameBadge').textContent   = gameEmoji(gameId);
    document.getElementById('gameTitle').textContent   = currentGame.name;
    document.getElementById('gameDesc').textContent    = currentGame.description;
    document.title = currentGame.name + ' — Lobby';
  } catch {
    showToast('Failed to load game info', 'error');
  }
}
init();

function gameEmoji(id) {
  return { prowl:'🦊', shadow_court:'🎭', realm_and_trade:'🏰', homerun:'🎲', serpents_path:'🐍' }[id] || '🎮';
}

/* ── Panel switching ── */
const panels = {
  mode:          document.getElementById('modeSelect'),
  createPrivate: document.getElementById('createPrivatePanel'),
  joinPrivate:   document.getElementById('joinPrivatePanel'),
  publicNick:    document.getElementById('publicNickPanel'),
  waiting:       document.getElementById('waitingPanel')
};

function showPanel(name) {
  Object.values(panels).forEach(p => p.classList.add('hidden'));
  if (panels[name]) panels[name].classList.remove('hidden');
}

/* ── Button wiring ── */
document.getElementById('btnPublic').onclick        = () => showPanel('publicNick');
document.getElementById('btnCreatePrivate').onclick = () => showPanel('createPrivate');
document.getElementById('btnJoinPrivate').onclick   = () => showPanel('joinPrivate');
document.getElementById('btnBackCreate').onclick    = () => showPanel('mode');
document.getElementById('btnBackJoin').onclick      = () => showPanel('mode');
document.getElementById('btnBackPublic').onclick    = () => showPanel('mode');

document.getElementById('btnDoPublic').onclick = () => {
  const nickname = getNickname('pubNickname');
  if (!nickname) return showToast('Enter a nickname', 'error');
  socket.emit('lobby:join_public', { gameId, nickname });
  showPanel('waiting');
  document.getElementById('searchAnim').style.display = 'flex';
};

document.getElementById('btnDoCreate').onclick = () => {
  const nickname = getNickname('cpNickname');
  const password = document.getElementById('cpPassword').value;
  if (!nickname) return showToast('Enter a nickname', 'error');
  socket.emit('lobby:create_private', { gameId, nickname, password });
};

document.getElementById('btnDoJoin').onclick = () => {
  const nickname = getNickname('jpNickname');
  const roomId   = document.getElementById('jpRoomId').value.trim().toUpperCase();
  const password = document.getElementById('jpPassword').value;
  if (!nickname) return showToast('Enter a nickname', 'error');
  if (!roomId)   return showToast('Enter a room ID', 'error');
  socket.emit('lobby:join_private', { roomId, nickname, password });
};

document.getElementById('btnReady').onclick = () => {
  socket.emit('lobby:toggle_ready');
};

/* ── Socket events ── */
socket.on('lobby:created', (data) => {
  myRoomId   = data.roomId;
  myPlayerId = data.playerId;
  showPanel('waiting');
  document.getElementById('searchAnim').style.display = 'none';
  renderRoomInfo(data.roomId, true);
  renderPlayers(data.players, data.maxPlayers);
  document.getElementById('waitingTitle').textContent = 'Waiting for players…';
});

socket.on('lobby:joined', (data) => {
  myRoomId   = data.roomId;
  myPlayerId = data.playerId;
  document.getElementById('searchAnim').style.display = 'none';
});

socket.on('lobby:updated', (data) => {
  showPanel('waiting');
  renderRoomInfo(data.roomId, data.isPrivate);
  renderPlayers(data.players, data.maxPlayers);
  const waiting = data.players.length < data.maxPlayers;
  document.getElementById('waitingTitle').textContent = waiting
    ? `Waiting for players… (${data.players.length}/${data.maxPlayers})`
    : 'All players present! Ready up!';
});

socket.on('lobby:player_left', (data) => {
  showToast('A player left the lobby');
});

socket.on('game:started', (data) => {
  // Store game session and redirect to game page
  sessionStorage.setItem('mg_session', JSON.stringify({
    gameId: data.gameId,
    roomId: myRoomId,
    playerId: myPlayerId,
    players: data.players,
    initialState: data.state
  }));
  window.location.href = 'game.html?game=' + data.gameId;
});

socket.on('error', ({ message }) => {
  showToast(message, 'error');
  showPanel('mode');
});

/* ── Render helpers ── */
function renderRoomInfo(roomId, isPrivate) {
  const wrap = document.getElementById('roomInfo');
  if (!isPrivate) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <div class="room-code" onclick="copyRoomId('${roomId}')" title="Click to copy">${roomId}</div>
    <div class="room-code-label">ROOM CODE — CLICK TO COPY</div>
  `;
}

function renderPlayers(players, maxPlayers) {
  const slots = document.getElementById('playerSlots');
  slots.innerHTML = '';

  for (let i = 0; i < maxPlayers; i++) {
    const p    = players[i];
    const slot = document.createElement('div');
    const avatars = ['🧑','👩','🧔','👧','🧒','👴'];

    if (p) {
      slot.className = 'player-slot filled' + (p.ready ? ' ready' : '');
      slot.innerHTML = `
        <div class="slot-avatar">${avatars[i % avatars.length]}</div>
        <div class="slot-info">
          <div class="slot-name">${escHtml(p.nickname)}${p.id === myPlayerId ? ' <span style="color:var(--accent);font-size:11px">(you)</span>' : ''}</div>
          <div class="slot-status">${p.isHost ? '👑 Host' : 'Player'}</div>
        </div>
        ${p.ready ? '<span class="slot-ready-badge">READY</span>' : ''}
      `;
    } else {
      slot.className = 'player-slot slot-empty';
      slot.innerHTML = `
        <div class="slot-avatar">⏳</div>
        <div class="slot-info">
          <div class="slot-name" style="color:var(--text-dim)">Waiting…</div>
        </div>
      `;
    }
    slots.appendChild(slot);
  }
}

function copyRoomId(id) {
  navigator.clipboard.writeText(id).then(() => showToast('Room ID copied! ✓'));
}

function getNickname(fieldId) {
  const field = document.getElementById(fieldId);
  const saved = localStorage.getItem('mg_nickname') || '';
  if (!field.value.trim() && saved) field.value = saved;
  const nick = field.value.trim();
  if (nick) localStorage.setItem('mg_nickname', nick);
  return nick;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Toast ── */
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3000);
}
