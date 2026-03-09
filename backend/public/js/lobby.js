/**
 * Lobby page: public/private room management via Socket.IO.
 */

const socket = io();
let myRoomId = null;
let myPlayerId = null;
let currentGame = null;
let currentLobby = null;

const params = new URLSearchParams(window.location.search);
const gameId = params.get('game');

const panels = {
  mode: document.getElementById('modeSelect'),
  createPrivate: document.getElementById('createPrivatePanel'),
  joinPrivate: document.getElementById('joinPrivatePanel'),
  publicNick: document.getElementById('publicNickPanel'),
  waiting: document.getElementById('waitingPanel')
};

async function init() {
  try {
    const res = await fetch(`/api/games/${gameId}`);
    currentGame = await res.json();
    document.getElementById('gameBadge').textContent = currentGame.name;
    document.getElementById('gameTitle').textContent = currentGame.name;
    document.getElementById('gameDesc').textContent = currentGame.description;
    document.title = `${currentGame.name} - Lobby`;
    renderPublicSizeOptions(currentGame.minPlayers, currentGame.maxPlayers);
  } catch {
    showToast('Failed to load game info', 'error');
  }
}

function renderPublicSizeOptions(minPlayers, maxPlayers) {
  const select = document.getElementById('pubTargetPlayers');
  select.innerHTML = '';
  for (let count = minPlayers; count <= maxPlayers; count++) {
    const option = document.createElement('option');
    option.value = String(count);
    option.textContent = `${count} players`;
    select.appendChild(option);
  }
  select.value = String(minPlayers);
}

function showPanel(name) {
  Object.values(panels).forEach((panel) => panel.classList.add('hidden'));
  if (panels[name]) panels[name].classList.remove('hidden');
}

document.getElementById('btnPublic').onclick = () => showPanel('publicNick');
document.getElementById('btnCreatePrivate').onclick = () => showPanel('createPrivate');
document.getElementById('btnJoinPrivate').onclick = () => showPanel('joinPrivate');
document.getElementById('btnBackCreate').onclick = () => showPanel('mode');
document.getElementById('btnBackJoin').onclick = () => showPanel('mode');
document.getElementById('btnBackPublic').onclick = () => showPanel('mode');

document.getElementById('btnDoPublic').onclick = () => {
  const nickname = getNickname('pubNickname');
  const targetPlayers = Number(document.getElementById('pubTargetPlayers').value);
  if (!nickname) return showToast('Enter a nickname', 'error');
  socket.emit('lobby:join_public', { gameId, nickname, targetPlayers });
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
  const roomId = document.getElementById('jpRoomId').value.trim().toUpperCase();
  const password = document.getElementById('jpPassword').value;
  if (!nickname) return showToast('Enter a nickname', 'error');
  if (!roomId) return showToast('Enter a room ID', 'error');
  socket.emit('lobby:join_private', { roomId, nickname, password });
};

document.getElementById('btnReady').onclick = () => {
  socket.emit('lobby:toggle_ready');
};

document.getElementById('btnStartPrivate').onclick = () => {
  socket.emit('lobby:start_private');
};

socket.on('lobby:created', (data) => {
  myRoomId = data.roomId;
  myPlayerId = data.playerId;
  document.getElementById('searchAnim').style.display = 'none';
  applyLobbyState(data, true);
});

socket.on('lobby:joined', (data) => {
  myRoomId = data.roomId;
  myPlayerId = data.playerId;
  document.getElementById('searchAnim').style.display = 'none';
});

socket.on('lobby:updated', (data) => {
  applyLobbyState(data, false);
});

socket.on('lobby:player_left', () => {
  showToast('A player left the lobby');
});

socket.on('game:started', (data) => {
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
});

function applyLobbyState(data, created) {
  currentLobby = data;
  showPanel('waiting');
  renderRoomInfo(data.roomId, data.isPrivate);
  renderPlayers(data.players, data.maxPlayers);
  updateWaitingState(data, created);
  updateActionButtons(data);
}

function renderRoomInfo(roomId, isPrivate) {
  const wrap = document.getElementById('roomInfo');
  if (!isPrivate) {
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = `
    <div class="room-code" onclick="copyRoomId('${roomId}')" title="Click to copy">${roomId}</div>
    <div class="room-code-label">ROOM CODE - CLICK TO COPY</div>
  `;
}

function renderPlayers(players, maxPlayers) {
  const slots = document.getElementById('playerSlots');
  const avatars = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  slots.innerHTML = '';

  for (let i = 0; i < maxPlayers; i++) {
    const player = players[i];
    const slot = document.createElement('div');

    if (player) {
      slot.className = 'player-slot filled' + (player.ready ? ' ready' : '');
      slot.innerHTML = `
        <div class="slot-avatar">${avatars[i % avatars.length]}</div>
        <div class="slot-info">
          <div class="slot-name">${escHtml(player.nickname)}${player.id === myPlayerId ? ' <span style="color:var(--accent);font-size:11px">(you)</span>' : ''}</div>
          <div class="slot-status">${player.isHost ? 'Host' : 'Player'}</div>
        </div>
        ${player.ready ? '<span class="slot-ready-badge">READY</span>' : ''}
      `;
    } else {
      slot.className = 'player-slot slot-empty';
      slot.innerHTML = `
        <div class="slot-avatar">...</div>
        <div class="slot-info">
          <div class="slot-name" style="color:var(--text-dim)">Waiting...</div>
        </div>
      `;
    }

    slots.appendChild(slot);
  }
}

function updateWaitingState(data, created) {
  const title = document.getElementById('waitingTitle');
  const tip = document.getElementById('lobbyTip');
  const count = data.players.length;
  const target = data.targetPlayers || data.maxPlayers;
  const reachedMinimum = count >= data.minPlayers;

  if (!data.isPrivate) {
    title.textContent = `Finding ${target}-player lobby (${count}/${target})`;
    tip.textContent = count >= target
      ? 'Lobby full. Starting game...'
      : `Matchmaking will auto-start when ${target} players join`;
    return;
  }

  if (!reachedMinimum) {
    title.textContent = `Waiting for players (${count}/${data.minPlayers} minimum)`;
    tip.textContent = `Need at least ${data.minPlayers} players before the host can start`;
    return;
  }

  if (isMyLobbyHost(data)) {
    title.textContent = created ? 'Private room created' : 'Minimum players reached';
    tip.textContent = 'You can start the game now, or wait for more players to join';
  } else {
    title.textContent = 'Waiting for host to start';
    tip.textContent = 'The room host can start the game at any time now';
  }
}

function updateActionButtons(data) {
  const readyButton = document.getElementById('btnReady');
  const startButton = document.getElementById('btnStartPrivate');
  const searchAnim = document.getElementById('searchAnim');
  const reachedMinimum = data.players.length >= data.minPlayers;
  const host = isMyLobbyHost(data);

  readyButton.classList.add('hidden');

  if (data.isPrivate) {
    searchAnim.style.display = 'none';
    startButton.classList.toggle('hidden', !(host && reachedMinimum));
    startButton.disabled = !(host && reachedMinimum);
  } else {
    startButton.classList.add('hidden');
    searchAnim.style.display = data.players.length < (data.targetPlayers || data.maxPlayers) ? 'flex' : 'none';
  }
}

function isMyLobbyHost(data) {
  return Boolean((data.players || []).find((player) => player.id === myPlayerId && player.isHost));
}

function copyRoomId(id) {
  navigator.clipboard.writeText(id).then(() => showToast('Room ID copied!'));
}

function getNickname(fieldId) {
  const field = document.getElementById(fieldId);
  const saved = localStorage.getItem('mg_nickname') || '';
  if (!field.value.trim() && saved) field.value = saved;
  const nickname = field.value.trim();
  if (nickname) localStorage.setItem('mg_nickname', nickname);
  return nickname;
}

function escHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

init();
