/**
 * LobbyManager
 * Handles public matchmaking queues and private rooms.
 */
class LobbyManager {
  constructor() {
    this.lobbies = new Map();       // roomId -> lobby
    this.publicQueues = new Map();  // gameId -> [roomId, ...]
  }

  /* ── Public matchmaking ── */
  joinPublicLobby(gameId, player, maxPlayers) {
    const queue = this.publicQueues.get(gameId) || [];
    for (const roomId of queue) {
      const lobby = this.lobbies.get(roomId);
      if (lobby && !lobby.started && lobby.players.length < maxPlayers) {
        lobby.players.push(player);
        return { roomId };
      }
    }
    // Create new public room
    const roomId = `pub_${gameId}_${Date.now()}`;
    this.lobbies.set(roomId, {
      roomId, gameId, players: [player], maxPlayers,
      isPrivate: false, password: null, started: false, createdAt: Date.now()
    });
    if (!this.publicQueues.has(gameId)) this.publicQueues.set(gameId, []);
    this.publicQueues.get(gameId).push(roomId);
    return { roomId };
  }

  /* ── Private room ── */
  createPrivateLobby(roomId, gameId, player, password, maxPlayers) {
    this.lobbies.set(roomId, {
      roomId, gameId, players: [player], maxPlayers,
      isPrivate: true, password: password || '', started: false, createdAt: Date.now()
    });
  }

  /* ── Helpers ── */
  getLobby(roomId)           { return this.lobbies.get(roomId) || null; }
  addPlayerToLobby(roomId, p){ const l = this.lobbies.get(roomId); if (l) l.players.push(p); }
  removePlayer(roomId, pid)  { const l = this.lobbies.get(roomId); if (l) l.players = l.players.filter(p => p.id !== pid); }
  setStarted(roomId)         { const l = this.lobbies.get(roomId); if (l) l.started = true; }
  endGame(roomId)            { const l = this.lobbies.get(roomId); if (l) l.started = false; }

  toggleReady(roomId, pid) {
    const l = this.lobbies.get(roomId);
    if (!l) return;
    const p = l.players.find(p => p.id === pid);
    if (p) p.ready = !p.ready;
  }

  resetReadyStates(roomId) {
    const l = this.lobbies.get(roomId);
    if (!l) return;
    l.players.forEach(p => p.ready = false);
    l.started = false;
  }

  deleteLobby(roomId) {
    const l = this.lobbies.get(roomId);
    if (l) {
      const q = this.publicQueues.get(l.gameId);
      if (q) { const i = q.indexOf(roomId); if (i !== -1) q.splice(i, 1); }
    }
    this.lobbies.delete(roomId);
  }
}

module.exports = LobbyManager;
