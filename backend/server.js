/**
 * ============================================================
 *  Mini Games Platform — Main Server
 *  Node.js + Express + Socket.IO
 *  Run: node server.js   (or: npm run dev)
 * ============================================================
 */

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const cors     = require('cors');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');

const gameRegistry    = require('./gameRegistry');
const LobbyManager    = require('./lobbyManager');
const GameStateManager = require('./gameStateManager');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ── REST API ──────────────────────────────────────────────────
app.get('/api/games',       (_req, res) => res.json(gameRegistry.getAllGames()));
app.get('/api/games/:id',   (req, res)  => {
  const g = gameRegistry.getGame(req.params.id);
  g ? res.json(g) : res.status(404).json({ error: 'Not found' });
});

// ── Managers ─────────────────────────────────────────────────
const lobbyManager     = new LobbyManager();
const gameStateManager = new GameStateManager();

// ── Socket.IO ────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  /* ── Join public matchmaking ── */
  socket.on('lobby:join_public', ({ gameId, nickname }) => {
    const game = gameRegistry.getGame(gameId);
    if (!game) return socket.emit('error', { message: 'Game not found' });

    const player = { id: socket.id, nickname: nickname || 'Player', ready: false };
    const { roomId } = lobbyManager.joinPublicLobby(gameId, player, game.maxPlayers);

    _attachSocket(socket, roomId, gameId, nickname);

    const lobby = lobbyManager.getLobby(roomId);
    io.to(roomId).emit('lobby:updated', _lobbyPayload(lobby, game));
    socket.emit('lobby:joined', { roomId, playerId: socket.id });

    if (lobby.players.length >= game.maxPlayers) _startGame(roomId, gameId);
  });

  /* ── Create private room ── */
  socket.on('lobby:create_private', ({ gameId, nickname, password }) => {
    const game = gameRegistry.getGame(gameId);
    if (!game) return socket.emit('error', { message: 'Game not found' });

    const roomId = uuidv4().substring(0, 8).toUpperCase();
    const player = { id: socket.id, nickname: nickname || 'Host', ready: false, isHost: true };
    lobbyManager.createPrivateLobby(roomId, gameId, player, password, game.maxPlayers);

    _attachSocket(socket, roomId, gameId, nickname);

    const lobby = lobbyManager.getLobby(roomId);
    socket.emit('lobby:created', { roomId, playerId: socket.id, ..._lobbyPayload(lobby, game) });
  });

  /* ── Join private room ── */
  socket.on('lobby:join_private', ({ roomId, nickname, password }) => {
    const lobby = lobbyManager.getLobby(roomId);
    if (!lobby)                          return socket.emit('error', { message: 'Room not found' });
    if (lobby.password !== (password||'')) return socket.emit('error', { message: 'Wrong password' });
    if (lobby.players.length >= lobby.maxPlayers) return socket.emit('error', { message: 'Lobby is full' });
    if (lobby.started)                   return socket.emit('error', { message: 'Game already started' });

    const game   = gameRegistry.getGame(lobby.gameId);
    const player = { id: socket.id, nickname: nickname || 'Player', ready: false };
    lobbyManager.addPlayerToLobby(roomId, player);

    _attachSocket(socket, roomId, lobby.gameId, nickname);

    const updated = lobbyManager.getLobby(roomId);
    io.to(roomId).emit('lobby:updated', _lobbyPayload(updated, game));
    socket.emit('lobby:joined', { roomId, playerId: socket.id });

    if (updated.players.length >= lobby.maxPlayers) _startGame(roomId, lobby.gameId);
  });

  /* ── Toggle ready ── */
  socket.on('lobby:toggle_ready', () => {
    const { roomId } = socket.data;
    if (!roomId) return;
    lobbyManager.toggleReady(roomId, socket.id);
    const lobby = lobbyManager.getLobby(roomId);
    const game  = gameRegistry.getGame(lobby.gameId);
    io.to(roomId).emit('lobby:updated', _lobbyPayload(lobby, game));

    const allReady = lobby.players.every(p => p.ready);
    if (allReady && lobby.players.length >= lobby.maxPlayers) _startGame(roomId, lobby.gameId);
  });

  /* ── Game move ── */
  socket.on('game:move', ({ move }) => {
    const { roomId, gameId } = socket.data;
    if (!roomId) return;

    const result = gameStateManager.processMove(roomId, socket.id, move);
    if (result.error) return socket.emit('error', { message: result.error });

    io.to(roomId).emit('game:state_update', result.state);
    if (result.gameOver) {
      io.to(roomId).emit('game:over', { winner: result.winner, state: result.state });
      lobbyManager.endGame(roomId);
    }
  });

  /* ── Restart ── */
  socket.on('game:restart', () => {
    const { roomId } = socket.data;
    if (!roomId) return;
    lobbyManager.resetReadyStates(roomId);
    gameStateManager.resetGame(roomId);
    const lobby = lobbyManager.getLobby(roomId);
    const game  = gameRegistry.getGame(lobby.gameId);
    io.to(roomId).emit('lobby:updated', { ..._lobbyPayload(lobby, game), gameStarted: false });
    io.to(roomId).emit('game:restarted');
  });

  /* ── Disconnect ── */
  socket.on('disconnect', () => {
    const { roomId } = socket.data;
    console.log(`[-] ${socket.id} disconnected`);
    if (!roomId) return;

    lobbyManager.removePlayer(roomId, socket.id);
    const lobby = lobbyManager.getLobby(roomId);
    if (!lobby) return;

    if (lobby.players.length === 0) {
      lobbyManager.deleteLobby(roomId);
    } else {
      io.to(roomId).emit('lobby:player_left', { playerId: socket.id, players: lobby.players });
      if (lobby.started) io.to(roomId).emit('game:player_disconnected', { playerId: socket.id });
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────
function _attachSocket(socket, roomId, gameId, nickname) {
  socket.join(roomId);
  socket.data.roomId  = roomId;
  socket.data.gameId  = gameId;
  socket.data.nickname = nickname;
}

function _lobbyPayload(lobby, game) {
  return {
    roomId:     lobby.roomId,
    players:    lobby.players,
    maxPlayers: lobby.maxPlayers,
    minPlayers: game.minPlayers,
    isPrivate:  lobby.isPrivate,
    gameId:     lobby.gameId,
    gameName:   game.name
  };
}

function _startGame(roomId, gameId) {
  const lobby = lobbyManager.getLobby(roomId);
  if (!lobby || lobby.started) return;
  lobbyManager.setStarted(roomId);
  const initialState = gameStateManager.initGame(roomId, gameId, lobby.players);
  io.to(roomId).emit('game:started', { gameId, players: lobby.players, state: initialState });
  console.log(`[Game] ${gameId} started in room ${roomId}`);
}

// ── Listen ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮  Mini Games running → http://localhost:${PORT}\n`);
});
