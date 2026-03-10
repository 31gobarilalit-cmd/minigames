/**
 * gameClient.js
 * Loads the correct game renderer and wires up Socket.IO game events.
 * Each game renderer is in js/games/<id>.js
 */

const socket  = io();
let session   = null;
let renderer  = null;   // set by the game-specific script

/* ── Load session ── */
function init() {
  const raw = sessionStorage.getItem('mg_session');
  if (!raw) {
    // Dev shortcut: allow testing without lobby
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('game');
    if (!gameId) { alert('No game session found. Go back to home.'); return; }
    // Fake single-player session
    session = {
      gameId,
      roomId: 'local',
      playerId: 'p1',
      players: [{ id:'p1', nickname:'Player 1' }, { id:'p2', nickname:'Player 2' }],
      initialState: null
    };
  } else {
    session = JSON.parse(raw);
  }

  document.getElementById('gameNameHeader').textContent = session.gameId.replace(/_/g,' ').toUpperCase();
  renderStatusBar();

  // Load game script dynamically
  loadScript(`js/games/${session.gameId}.js`, () => {
    if (window.GameRenderer) {
      renderer = window.GameRenderer;
      renderer.init(session, sendMove);
      if (session.initialState) renderer.update(session.initialState);
    }
  });
}

function loadScript(src, cb) {
  const s = document.createElement('script');
  s.src = src;
  s.onload = cb;
  s.onerror = () => console.error('Failed to load game script:', src);
  document.body.appendChild(s);
}

function sendMove(move) {
  socket.emit('game:move', { move });
}

function renderStatusBar() {
  const players = session.players || [];
  document.getElementById('statusPlayers').textContent =
    '👥 ' + players.map(p => p.nickname).join(' vs ');
}

/* ── Socket events ── */
socket.on('connect', () => {
  // Re-join room on reconnect
  if (session && session.roomId !== 'local') {
    socket.emit('game:rejoin', { roomId: session.roomId, playerId: session.playerId });
  }
});

socket.on('game:state_update', (state) => {
  if (renderer) renderer.update(state);
  updateTurnDisplay(state);
});

socket.on('game:over', ({ winner, state }) => {
  if (renderer) renderer.update(state);
  // Check team win
  const teamWinners = ['loyalists','conspirators','traitor','civilians'];
  if (teamWinners.includes(winner)) {
    const myRole = state?.myRole;
    const isMe = (winner === 'loyalists' && myRole === 'loyalist') ||
                 (winner === 'conspirators' && (myRole === 'conspirator' || myRole === 'mastermind'));
    showOverlay(isMe ? '🏆' : '😢', isMe ? 'YOUR TEAM WINS!' : 'YOUR TEAM LOSES!',
      state?.winReason || (isMe ? 'Congratulations!' : 'Better luck next time!'));
    playSound(isMe ? 'win' : 'lose');
  } else {
    const winnerPlayer = (session.players || []).find(p => p.id === winner);
    const isMe = winner === session.playerId;
    showOverlay(isMe ? '🏆' : '😢',
      isMe ? 'YOU WIN!' : (winnerPlayer ? `${winnerPlayer.nickname} WINS!` : 'GAME OVER'),
      isMe ? 'Congratulations!' : 'Better luck next time!');
    playSound(isMe ? 'win' : 'lose');
  }
});

socket.on('game:player_disconnected', () => {
  document.getElementById('disconnectOverlay').classList.remove('hidden');
});

socket.on('game:restarted', () => {
  document.getElementById('gameOverlay').classList.add('hidden');
  document.getElementById('disconnectOverlay').classList.add('hidden');
  if (renderer && renderer.reset) renderer.reset();
});

socket.on('error', ({ message }) => {
  showToast(message, 'error');
});

/* ── Overlay ── */
function showOverlay(emoji, title, sub) {
  document.getElementById('overlayEmoji').textContent = emoji;
  document.getElementById('overlayTitle').textContent = title;
  document.getElementById('overlaySub').textContent   = sub;
  document.getElementById('gameOverlay').classList.remove('hidden');
}

document.getElementById('btnRestart').onclick = () => {
  socket.emit('game:restart');
};
document.getElementById('overlayRestart').onclick = () => {
  socket.emit('game:restart');
};

/* ── Status bar ── */
function updateTurnDisplay(state) {
  if (!state) return;
  const turnId = state.currentTurn || state.wolfPlayer;
  if (!turnId) return;
  const player = (session.players || []).find(p => p.id === turnId);
  const isMe   = turnId === session.playerId;
  document.getElementById('statusTurn').textContent =
    isMe ? '⚡ YOUR TURN' : (player ? `⏳ ${player.nickname}'s turn` : '');
}

/* ── Sound ── */
function playSound(type) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'win') {
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  } else {
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.setValueAtTime(200, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  }

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.7);
}

/* ── Toast ── */
window.showToast = function(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3000);
};

init();
