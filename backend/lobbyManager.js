/**
 * LobbyManager
 * Handles public matchmaking queues and private rooms.
 */
class LobbyManager {
  constructor() {
    this.lobbies = new Map();
    this.publicQueues = new Map();
  }

  joinPublicLobby(gameId, player, targetPlayers) {
    const queueKey = this._queueKey(gameId, targetPlayers);
    const queue = this.publicQueues.get(queueKey) || [];

    for (const roomId of queue) {
      const lobby = this.lobbies.get(roomId);
      if (lobby && !lobby.started && lobby.players.length < lobby.targetPlayers) {
        lobby.players.push(player);
        return { roomId };
      }
    }

    const roomId = `pub_${gameId}_${targetPlayers}_${Date.now()}`;
    this.lobbies.set(roomId, {
      roomId,
      gameId,
      players: [player],
      maxPlayers: targetPlayers,
      targetPlayers,
      isPrivate: false,
      password: null,
      started: false,
      createdAt: Date.now()
    });

    if (!this.publicQueues.has(queueKey)) this.publicQueues.set(queueKey, []);
    this.publicQueues.get(queueKey).push(roomId);
    return { roomId };
  }

  createPrivateLobby(roomId, gameId, player, password, maxPlayers) {
    this.lobbies.set(roomId, {
      roomId,
      gameId,
      players: [player],
      maxPlayers,
      targetPlayers: maxPlayers,
      isPrivate: true,
      password: password || '',
      started: false,
      createdAt: Date.now()
    });
  }

  getLobby(roomId) { return this.lobbies.get(roomId) || null; }
  addPlayerToLobby(roomId, player) { const lobby = this.lobbies.get(roomId); if (lobby) lobby.players.push(player); }
  removePlayer(roomId, playerId) { const lobby = this.lobbies.get(roomId); if (lobby) lobby.players = lobby.players.filter((player) => player.id !== playerId); }
  setStarted(roomId) { const lobby = this.lobbies.get(roomId); if (lobby) lobby.started = true; }
  endGame(roomId) { const lobby = this.lobbies.get(roomId); if (lobby) lobby.started = false; }

  toggleReady(roomId, playerId) {
    const lobby = this.lobbies.get(roomId);
    if (!lobby) return;
    const player = lobby.players.find((entry) => entry.id === playerId);
    if (player) player.ready = !player.ready;
  }

  resetReadyStates(roomId) {
    const lobby = this.lobbies.get(roomId);
    if (!lobby) return;
    lobby.players.forEach((player) => { player.ready = false; });
    lobby.started = false;
  }

  deleteLobby(roomId) {
    const lobby = this.lobbies.get(roomId);
    if (lobby && !lobby.isPrivate) {
      const queueKey = this._queueKey(lobby.gameId, lobby.targetPlayers || lobby.maxPlayers);
      const queue = this.publicQueues.get(queueKey);
      if (queue) {
        const index = queue.indexOf(roomId);
        if (index !== -1) queue.splice(index, 1);
        if (queue.length === 0) this.publicQueues.delete(queueKey);
      }
    }
    this.lobbies.delete(roomId);
  }

  _queueKey(gameId, targetPlayers) {
    return `${gameId}:${targetPlayers}`;
  }
}

module.exports = LobbyManager;
