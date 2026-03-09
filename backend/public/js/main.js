/**
 * main.js — Home page: load game grid, handle clicks
 */

const GAME_AVATARS = {
  prowl:  '🦊',
  shadow_court: '🎭',
  realm_and_trade: '🏰',
  homerun: '🎲',
  serpents_path: '🐍'
};

const PLAYER_LABELS = {
  prowl: '2 players',
  shadow_court: '3–6 players',
  realm_and_trade: '3–4 players',
  homerun: '2–4 players',
  serpents_path: '2–4 players'
};

/* ── Restore saved nickname ── */
const nicknameInput = document.getElementById('nicknameInput');
nicknameInput.value = localStorage.getItem('mg_nickname') || '';
nicknameInput.addEventListener('input', () => {
  localStorage.setItem('mg_nickname', nicknameInput.value.trim());
});

/* ── Load games from API ── */
async function loadGames() {
  const grid = document.getElementById('gameGrid');
  try {
    const res   = await fetch('/api/games');
    const games = await res.json();
    grid.innerHTML = '';
    games.forEach(game => grid.appendChild(buildCard(game)));
  } catch (err) {
    grid.innerHTML = '<p style="color:var(--text-dim);grid-column:1/-1">Could not connect to server. Make sure the backend is running.</p>';
  }
}

function buildCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.innerHTML = `
    <div class="card-thumb" style="background:${game.color}22">
      <span style="position:relative;z-index:1">${GAME_AVATARS[game.id] || '🎮'}</span>
    </div>
    <div class="card-body">
      <span class="card-type">${game.type === 'multiplayer' ? '👥 Multiplayer' : '👤 Single Player'}</span>
      <div class="card-name">${game.name}</div>
      <div class="card-desc">${game.description}</div>
      <div class="card-tags">
        ${(game.tags || []).map(t => `<span class="tag">${t}</span>`).join('')}
      </div>
    </div>
    <div class="card-footer">
      <span class="player-count">${PLAYER_LABELS[game.id] || ''}</span>
      <button class="btn-play">PLAY</button>
    </div>
  `;

  card.querySelector('.btn-play').addEventListener('click', (e) => {
    e.stopPropagation();
    startGame(game);
  });
  card.addEventListener('click', () => startGame(game));
  return card;
}

function startGame(game) {
  // Save game info for lobby page
  sessionStorage.setItem('mg_game', JSON.stringify(game));
  const nick = document.getElementById('nicknameInput').value.trim();
  if (nick) localStorage.setItem('mg_nickname', nick);
  window.location.href = 'lobby.html?game=' + game.id;
}

/* ── Toast helper ── */
window.showToast = function(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3000);
};

loadGames();
