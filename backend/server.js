/**
 * ============================================================
 *  Mini Games Platform - Main Server
 *  Node.js + Express + Socket.IO
 * ============================================================
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const gameRegistry = require('./gameRegistry');
const LobbyManager = require('./lobbyManager');
const GameStateManager = require('./gameStateManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/games', (_req, res) => res.json(gameRegistry.getAllGames()));
app.get('/api/games/:id', (req, res) => {
  const game = gameRegistry.getGame(req.params.id);
  game ? res.json(game) : res.status(404).json({ error: 'Not found' });
});

const lobbyManager = new LobbyManager();
const gameStateManager = new GameStateManager();

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  socket.on('lobby:join_public', ({ gameId, nickname, targetPlayers }) => {
    const game = gameRegistry.getGame(gameId);
    if (!game) return socket.emit('error', { message: 'Game not found' });

    const desiredSize = Number(targetPlayers);
    if (!Number.isInteger(desiredSize) || desiredSize < game.minPlayers || desiredSize > game.maxPlayers) {
      return socket.emit('error', { message: 'Invalid lobby size selected' });
    }

    const player = { id: socket.id, nickname: nickname || 'Player', ready: false, isHost: false };
    const { roomId } = lobbyManager.joinPublicLobby(gameId, player, desiredSize);

    _attachSocket(socket, roomId, gameId, nickname);

    const lobby = lobbyManager.getLobby(roomId);
    io.to(roomId).emit('lobby:updated', _lobbyPayload(lobby, game));
    socket.emit('lobby:joined', { roomId, playerId: socket.id });

    if (lobby.players.length >= lobby.targetPlayers) _startGame(roomId, gameId);
  });

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

  socket.on('lobby:join_private', ({ roomId, nickname, password }) => {
    const lobby = lobbyManager.getLobby(roomId);
    if (!lobby) return socket.emit('error', { message: 'Room not found' });
    if (lobby.password !== (password || '')) return socket.emit('error', { message: 'Wrong password' });
    if (lobby.players.length >= lobby.maxPlayers) return socket.emit('error', { message: 'Lobby is full' });
    if (lobby.started) return socket.emit('error', { message: 'Game already started' });

    const game = gameRegistry.getGame(lobby.gameId);
    const player = { id: socket.id, nickname: nickname || 'Player', ready: false, isHost: false };
    lobbyManager.addPlayerToLobby(roomId, player);

    _attachSocket(socket, roomId, lobby.gameId, nickname);

    const updated = lobbyManager.getLobby(roomId);
    io.to(roomId).emit('lobby:updated', _lobbyPayload(updated, game));
    socket.emit('lobby:joined', { roomId, playerId: socket.id });
  });

  socket.on('lobby:toggle_ready', () => {
    const { roomId } = socket.data;
    if (!roomId) return;
    lobbyManager.toggleReady(roomId, socket.id);
    const lobby = lobbyManager.getLobby(roomId);
    if (!lobby) return;
    const game = gameRegistry.getGame(lobby.gameId);
    io.to(roomId).emit('lobby:updated', _lobbyPayload(lobby, game));
  });

  socket.on('lobby:start_private', () => {
    const { roomId, gameId } = socket.data;
    if (!roomId || !gameId) return;

    const lobby = lobbyManager.getLobby(roomId);
    const game = gameRegistry.getGame(gameId);
    if (!lobby || !game) return;
    if (!lobby.isPrivate) return socket.emit('error', { message: 'Only private rooms can be started manually' });

    const host = lobby.players.find((player) => player.isHost);
    if (!host || host.id !== socket.id) return socket.emit('error', { message: 'Only the room host can start the game' });
    if (lobby.players.length < game.minPlayers) {
      return socket.emit('error', { message: `Need at least ${game.minPlayers} players to start` });
    }

    _startGame(roomId, gameId);
  });

  socket.on('game:rejoin', ({ roomId, playerId }) => {
    const lobby = lobbyManager.getLobby(roomId);
    if (!lobby) return socket.emit('error', { message: 'Room not found' });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.gameId = lobby.gameId;
    // Send current game state
    const state = gameStateManager.getPlayerState(roomId, socket.id) || gameStateManager.getState(roomId);
    if (state) socket.emit('game:state_update', state);
  });

  socket.on('game:move', ({ move }) => {
    const { roomId } = socket.data;
    if (!roomId) return;

    const result = gameStateManager.processMove(roomId, socket.id, move);
    if (result.error) return socket.emit('error', { message: result.error });

    if (result.perPlayer) {
      // Send per-player state (e.g., Shadow Court hides roles)
      const lobby = lobbyManager.getLobby(roomId);
      if (lobby) {
        const sockets = io.sockets.adapter.rooms.get(roomId);
        if (sockets) {
          for (const sid of sockets) {
            const playerState = gameStateManager.getPlayerState(roomId, sid);
            io.to(sid).emit('game:state_update', playerState);
          }
        }
      }
    } else {
      io.to(roomId).emit('game:state_update', result.state);
    }

    if (result.gameOver) {
      if (result.perPlayer) {
        const sockets = io.sockets.adapter.rooms.get(roomId);
        if (sockets) {
          for (const sid of sockets) {
            const playerState = gameStateManager.getPlayerState(roomId, sid);
            io.to(sid).emit('game:over', { winner: result.winner, state: playerState });
          }
        }
      } else {
        io.to(roomId).emit('game:over', { winner: result.winner, state: result.state });
      }
      lobbyManager.endGame(roomId);
    }
  });

  socket.on('game:restart', () => {
    const { roomId } = socket.data;
    if (!roomId) return;
    lobbyManager.resetReadyStates(roomId);
    gameStateManager.resetGame(roomId);
    const lobby = lobbyManager.getLobby(roomId);
    if (!lobby) return;
    const game = gameRegistry.getGame(lobby.gameId);
    io.to(roomId).emit('lobby:updated', { ..._lobbyPayload(lobby, game), gameStarted: false });
    io.to(roomId).emit('game:restarted');
  });

  socket.on('disconnect', () => {
    const { roomId } = socket.data;
    console.log(`[-] ${socket.id} disconnected`);
    if (!roomId) return;

    lobbyManager.removePlayer(roomId, socket.id);
    const lobby = lobbyManager.getLobby(roomId);
    if (!lobby) return;

    if (lobby.players.length === 0) {
      lobbyManager.deleteLobby(roomId);
      return;
    }

    const game = gameRegistry.getGame(lobby.gameId);
    io.to(roomId).emit('lobby:updated', _lobbyPayload(lobby, game));
    io.to(roomId).emit('lobby:player_left', { playerId: socket.id, players: lobby.players });
    if (lobby.started) io.to(roomId).emit('game:player_disconnected', { playerId: socket.id });
  });
});

function _attachSocket(socket, roomId, gameId, nickname) {
  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.gameId = gameId;
  socket.data.nickname = nickname;
}

function _lobbyPayload(lobby, game) {
  return {
    roomId: lobby.roomId,
    players: lobby.players,
    maxPlayers: lobby.maxPlayers,
    minPlayers: game.minPlayers,
    targetPlayers: lobby.targetPlayers || lobby.maxPlayers,
    isPrivate: lobby.isPrivate,
    gameId: lobby.gameId,
    gameName: game.name,
    started: lobby.started
  };
}

function _startGame(roomId, gameId) {
  const lobby = lobbyManager.getLobby(roomId);
  if (!lobby || lobby.started) return;
  lobbyManager.setStarted(roomId);
  const initialState = gameStateManager.initGame(roomId, gameId, lobby.players);

  if (gameId === 'shadow_court') {
    // Send per-player state so each player only sees their own role
    const sockets = io.sockets.adapter.rooms.get(roomId);
    if (sockets) {
      for (const sid of sockets) {
        const playerState = gameStateManager.getPlayerState(roomId, sid);
        io.to(sid).emit('game:started', { gameId, players: lobby.players, state: playerState });
      }
    }
  } else {
    io.to(roomId).emit('game:started', { gameId, players: lobby.players, state: initialState });
  }
  console.log(`[Game] ${gameId} started in room ${roomId}`);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Mini Games running on http://localhost:${PORT}`);
});
