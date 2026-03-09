/**
 * GameStateManager
 * Server-side game state + move validation for every multiplayer game.
 * Add new games by adding a handler to the `handlers` map.
 */

// ──────────────────────────────────────────────
//  PROWL  (predator-vs-prey cross board)
// ──────────────────────────────────────────────
const Prowl = {
  // Cross-shaped board positions (33 valid cells on a plus grid)
  // Represented as flat index 0-48 (7x7), invalid cells are null in adjacency map
  ADJACENCY: (() => {
    // Build adjacency for a standard Fox & Geese cross board
    const adj = {};
    const valid = new Set([
      2,3,4,
      9,10,11,12,13,14,16,
      17,18,19,20,21,22,23,
      24,25,26,27,28,29,30,
      31,32,33,34,35,36,38,
      44,45,46
    ]);
    valid.forEach(pos => {
      const row = Math.floor(pos / 7), col = pos % 7;
      adj[pos] = [];
      [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dr,dc]) => {
        const nr = row+dr, nc = col+dc, np = nr*7+nc;
        if (nr>=0&&nr<7&&nc>=0&&nc<7&&valid.has(np)) adj[pos].push(np);
      });
    });
    return adj;
  })(),

  init(players) {
    // Fox starts at centre (pos 24); Geese fill top portion
    const geesePositions = [2,3,4,9,10,11,12,13,14,16,17,18,19,20,21,22];
    const foxPos = 24;
    return {
      fox: foxPos,
      geese: new Set(geesePositions),
      foxPlayer: players[0].id,
      geesePlayer: players[1].id,
      currentTurn: players[0].id,   // fox goes first
      captured: 0,
      winner: null
    };
  },

  processMove(state, playerId, move) {
    const { from, to } = move;
    const isFoxTurn = state.currentTurn === state.foxPlayer;

    if (playerId !== state.currentTurn) return { error: 'Not your turn' };

    if (isFoxTurn) {
      // Fox move
      if (state.fox !== from) return { error: 'Invalid fox position' };
      const adj = this.ADJACENCY[from] || [];

      // Check regular move
      if (adj.includes(to) && !state.geese.has(to)) {
        state.fox = to;
      } else {
        // Check capture (jump over goose)
        const captured = this._findCapture(from, to, state);
        if (!captured) return { error: 'Invalid move' };
        state.geese.delete(captured);
        state.fox = to;
        state.captured++;
      }
      // Fox wins by capturing enough geese
      if (state.captured >= 9 || state.geese.size <= 4) {
        state.winner = state.foxPlayer;
        return { state: this._serialize(state), gameOver: true, winner: state.foxPlayer };
      }
    } else {
      // Geese move (no captures)
      if (!state.geese.has(from)) return { error: 'Not a goose position' };
      const adj = this.ADJACENCY[from] || [];
      if (!adj.includes(to) || state.geese.has(to) || to === state.fox) return { error: 'Invalid move' };
      // Geese can only move forward (increasing row index)
      if (Math.floor(to/7) < Math.floor(from/7)) return { error: 'Geese can only move forward' };
      state.geese.delete(from);
      state.geese.add(to);

      // Geese win by cornering fox (no valid moves)
      const foxMoves = (this.ADJACENCY[state.fox] || []).filter(p => !state.geese.has(p));
      const foxCaptures = this._getAllCaptures(state);
      if (foxMoves.length === 0 && foxCaptures.length === 0) {
        state.winner = state.geesePlayer;
        return { state: this._serialize(state), gameOver: true, winner: state.geesePlayer };
      }
    }

    state.currentTurn = isFoxTurn ? state.geesePlayer : state.foxPlayer;
    return { state: this._serialize(state) };
  },

  _findCapture(from, to, state) {
    const mid = Math.floor((from + to) / 2);
    const adj = this.ADJACENCY[from] || [];
    const adjTo = this.ADJACENCY[to] || [];
    if (adj.includes(mid) && adjTo.includes(mid) && state.geese.has(mid) && !state.geese.has(to) && to !== state.fox) {
      return mid;
    }
    return null;
  },

  _getAllCaptures(state) {
    const caps = [];
    (this.ADJACENCY[state.fox] || []).forEach(mid => {
      if (state.geese.has(mid)) {
        (this.ADJACENCY[mid] || []).forEach(landing => {
          if (!state.geese.has(landing) && landing !== state.fox) caps.push({ mid, landing });
        });
      }
    });
    return caps;
  },

  _serialize(state) {
    return { ...state, geese: [...state.geese] };
  },

  reset(players) { return this.init(players); }
};

// ──────────────────────────────────────────────
//  SHADOW COURT  (social deduction)
// ──────────────────────────────────────────────
const ShadowCourt = {
  ROLES: ['traitor', 'investigator', 'councilor', 'councilor', 'councilor', 'councilor'],

  init(players) {
    const roles = this._assignRoles(players.length);
    const assignments = {};
    players.forEach((p, i) => { assignments[p.id] = roles[i]; });
    return {
      assignments,           // server-side only; clients only see own role
      phase: 'discussion',   // discussion | voting | reveal
      votes: {},
      eliminated: [],
      round: 1,
      traitorId: players[Object.values(assignments).indexOf('traitor')]?.id ||
                players.find((_, i) => roles[i] === 'traitor')?.id,
      winner: null,
      players: players.map(p => ({ id: p.id, nickname: p.nickname, alive: true }))
    };
  },

  _assignRoles(count) {
    const roles = ['traitor', 'investigator', ...Array(count - 2).fill('councilor')];
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    return roles;
  },

  processMove(state, playerId, move) {
    const { action } = move;

    if (action === 'vote') {
      if (state.phase !== 'voting') return { error: 'Not voting phase' };
      state.votes[playerId] = move.targetId;

      const alivePlayers = state.players.filter(p => p.alive);
      if (Object.keys(state.votes).length >= alivePlayers.length) {
        return this._resolveVote(state);
      }
    }

    if (action === 'start_vote') {
      state.phase = 'voting';
      state.votes = {};
    }

    if (action === 'traitor_eliminate') {
      if (state.assignments[playerId] !== 'traitor') return { error: 'Not the traitor' };
      const target = state.players.find(p => p.id === move.targetId && p.alive);
      if (!target) return { error: 'Invalid target' };
      target.alive = false;
      state.eliminated.push(move.targetId);

      const aliveCivilians = state.players.filter(p => p.alive && p.id !== state.traitorId);
      if (aliveCivilians.length === 0) {
        state.winner = 'traitor';
        return { state: this._clientState(state, playerId), gameOver: true, winner: 'traitor' };
      }
    }

    return { state: this._clientState(state, playerId) };
  },

  _resolveVote(state) {
    const tally = {};
    Object.values(state.votes).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
    const eliminated = Object.entries(tally).sort((a,b) => b[1]-a[1])[0][0];
    const target = state.players.find(p => p.id === eliminated);
    if (target) target.alive = false;
    state.eliminated.push(eliminated);
    state.phase = 'discussion';
    state.votes = {};
    state.round++;

    if (eliminated === state.traitorId) {
      state.winner = 'civilians';
      return { state: this._publicState(state), gameOver: true, winner: 'civilians' };
    }
    const aliveCivilians = state.players.filter(p => p.alive && p.id !== state.traitorId);
    if (aliveCivilians.length <= 1) {
      state.winner = 'traitor';
      return { state: this._publicState(state), gameOver: true, winner: 'traitor' };
    }
    return { state: this._publicState(state) };
  },

  _clientState(state, pid) {
    return { ...this._publicState(state), myRole: state.assignments[pid] };
  },

  _publicState(state) {
    const { assignments, ...pub } = state;
    if (pub.winner) pub.revealedAssignments = assignments;
    return pub;
  },

  reset(players) { return this.init(players); }
};

// ──────────────────────────────────────────────
//  REALM & TRADE  (resource settlement building)
// ──────────────────────────────────────────────
const RealmAndTrade = {
  RESOURCES: ['wood', 'brick', 'wheat', 'sheep', 'ore'],
  TILE_TYPES: ['wood','wood','wood','wood','brick','brick','brick','wheat','wheat','wheat','wheat','sheep','sheep','sheep','sheep','ore','ore','ore','desert'],
  NUMBERS: [2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12],

  init(players) {
    const tiles = this._buildBoard();
    const resources = {};
    players.forEach(p => {
      resources[p.id] = { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 };
    });
    return {
      tiles,
      players: players.map((p, i) => ({
        id: p.id, nickname: p.nickname, color: ['#E53935','#1565C0','#2E7D32','#F57F17'][i],
        vp: 0, resources: { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 },
        settlements: [], cities: [], roads: []
      })),
      currentTurn: players[0].id,
      phase: 'setup',        // setup | main
      setupTurns: players.length * 2,
      setupDone: 0,
      dice: null,
      robberTile: tiles.findIndex(t => t.type === 'desert'),
      winner: null
    };
  },

  _buildBoard() {
    const types = [...this.TILE_TYPES];
    const nums = [...this.NUMBERS];
    for (let i = types.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [types[i],types[j]]=[types[j],types[i]]; }
    for (let i = nums.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [nums[i],nums[j]]=[nums[j],nums[i]]; }
    let ni = 0;
    return types.map((type, i) => ({
      id: i, type,
      number: type === 'desert' ? null : nums[ni++],
      vertices: []  // simplified
    }));
  },

  processMove(state, playerId, move) {
    const { action } = move;
    if (state.currentTurn !== playerId) return { error: 'Not your turn' };
    const player = state.players.find(p => p.id === playerId);

    if (action === 'roll_dice') {
      const d1 = Math.ceil(Math.random()*6), d2 = Math.ceil(Math.random()*6);
      state.dice = [d1, d2];
      const total = d1 + d2;
      if (total === 7) {
        state.phase_action = 'move_robber';
      } else {
        this._distributeResources(state, total);
      }
    }

    if (action === 'build_settlement') {
      const cost = { wood:1, brick:1, wheat:1, sheep:1 };
      if (!this._canAfford(player, cost)) return { error: 'Not enough resources' };
      this._spend(player, cost);
      player.settlements.push(move.vertex);
      player.vp++;
      if (player.vp >= 10) {
        state.winner = playerId;
        return { state, gameOver: true, winner: playerId };
      }
    }

    if (action === 'build_city') {
      const cost = { ore:3, wheat:2 };
      if (!this._canAfford(player, cost)) return { error: 'Not enough resources' };
      const idx = player.settlements.indexOf(move.vertex);
      if (idx === -1) return { error: 'No settlement there' };
      this._spend(player, cost);
      player.settlements.splice(idx, 1);
      player.cities.push(move.vertex);
      player.vp++;
      if (player.vp >= 10) {
        state.winner = playerId;
        return { state, gameOver: true, winner: playerId };
      }
    }

    if (action === 'build_road') {
      const cost = { wood:1, brick:1 };
      if (!this._canAfford(player, cost)) return { error: 'Not enough resources' };
      this._spend(player, cost);
      player.roads.push(move.edge);
    }

    if (action === 'trade') {
      // Bank trade 4:1
      const { give, receive } = move;
      if ((player.resources[give] || 0) < 4) return { error: 'Need 4 of the same resource' };
      player.resources[give] -= 4;
      player.resources[receive] = (player.resources[receive] || 0) + 1;
    }

    if (action === 'end_turn') {
      const idx = state.players.findIndex(p => p.id === playerId);
      state.currentTurn = state.players[(idx + 1) % state.players.length].id;
    }

    return { state };
  },

  _distributeResources(state, roll) {
    state.tiles.forEach((tile, ti) => {
      if (tile.number === roll && ti !== state.robberTile) {
        state.players.forEach(p => {
          const adj = p.settlements.filter(v => tile.vertices.includes(v)).length
                    + p.cities.filter(v => tile.vertices.includes(v)).length * 2;
          if (adj > 0) p.resources[tile.type] = (p.resources[tile.type] || 0) + adj;
        });
      }
    });
  },

  _canAfford(player, cost) {
    return Object.entries(cost).every(([r, n]) => (player.resources[r] || 0) >= n);
  },

  _spend(player, cost) {
    Object.entries(cost).forEach(([r, n]) => { player.resources[r] -= n; });
  },

  reset(players) { return this.init(players); }
};

// ──────────────────────────────────────────────
//  HOMERUN  (cross-and-circle race)
// ──────────────────────────────────────────────
const Homerun = {
  COLORS: ['red','blue','green','yellow'],
  HOME_COLS: { red: 1, blue: 13, green: 27, yellow: 40 }, // start positions on 52-cell track
  SAFE_CELLS: [0, 8, 13, 21, 26, 34, 39, 47],

  init(players) {
    const pieces = {};
    players.forEach((p, i) => {
      const color = this.COLORS[i];
      pieces[p.id] = { color, home: [0,0,0,0], positions: [-1,-1,-1,-1] }; // -1 = in yard
    });
    return {
      players: players.map((p, i) => ({ id: p.id, nickname: p.nickname, color: this.COLORS[i] })),
      pieces,
      currentTurn: players[0].id,
      dice: null,
      canRoll: true,
      winner: null
    };
  },

  processMove(state, playerId, move) {
    if (state.currentTurn !== playerId) return { error: 'Not your turn' };
    const { action } = move;
    const piece = state.pieces[playerId];

    if (action === 'roll') {
      if (!state.canRoll) return { error: 'Already rolled' };
      state.dice = Math.ceil(Math.random() * 6);
      state.canRoll = false;
    }

    if (action === 'move_piece') {
      if (state.canRoll) return { error: 'Roll first' };
      const { pieceIndex } = move;
      const pos = piece.positions[pieceIndex];

      if (pos === -1) {
        // In yard — need 6 to exit
        if (state.dice !== 6) return { error: 'Need a 6 to exit yard' };
        const startPos = this.HOME_COLS[piece.color];
        piece.positions[pieceIndex] = startPos;
      } else {
        const newPos = (pos + state.dice) % 52;
        // Check if reached home column (simplified: 56 = home)
        if (pos + state.dice >= 56) {
          piece.positions[pieceIndex] = 56; // home!
        } else {
          // Capture check
          Object.entries(state.pieces).forEach(([pid, p]) => {
            if (pid !== playerId) {
              p.positions.forEach((pp, i) => {
                if (pp === newPos && !this.SAFE_CELLS.includes(newPos)) {
                  p.positions[i] = -1; // send home
                }
              });
            }
          });
          piece.positions[pieceIndex] = newPos;
        }
      }

      // Check winner
      if (piece.positions.every(p => p === 56)) {
        state.winner = playerId;
        return { state, gameOver: true, winner: playerId };
      }

      // Extra turn on 6
      if (state.dice === 6) {
        state.canRoll = true;
      } else {
        const idx = state.players.findIndex(p => p.id === playerId);
        state.currentTurn = state.players[(idx+1) % state.players.length].id;
        state.canRoll = true;
      }
    }

    return { state };
  },

  reset(players) { return this.init(players); }
};

// ──────────────────────────────────────────────
//  SERPENTS PATH  (numbered grid race)
// ──────────────────────────────────────────────
const SerpentsPath = {
  SNAKES:  { 99:78, 95:75, 92:88, 89:68, 74:53, 62:19, 64:60, 49:11, 46:25, 16:6 },
  LADDERS: { 2:38, 7:14, 8:31, 15:26, 21:42, 28:84, 36:44, 51:67, 71:91, 78:98, 87:94 },

  init(players) {
    const positions = {};
    players.forEach(p => { positions[p.id] = 0; });
    return {
      players: players.map(p => ({ id: p.id, nickname: p.nickname })),
      positions,
      currentTurn: players[0].id,
      dice: null,
      lastEvent: null,
      winner: null
    };
  },

  processMove(state, playerId, move) {
    if (state.currentTurn !== playerId) return { error: 'Not your turn' };
    if (move.action !== 'roll') return { error: 'Unknown action' };

    const roll = Math.ceil(Math.random() * 6);
    state.dice = roll;
    state.lastEvent = null;

    let pos = state.positions[playerId] + roll;
    if (pos > 100) pos = state.positions[playerId]; // bounce back

    if (this.SNAKES[pos]) {
      state.lastEvent = { type: 'snake', from: pos, to: this.SNAKES[pos] };
      pos = this.SNAKES[pos];
    } else if (this.LADDERS[pos]) {
      state.lastEvent = { type: 'ladder', from: pos, to: this.LADDERS[pos] };
      pos = this.LADDERS[pos];
    }

    state.positions[playerId] = pos;

    if (pos === 100) {
      state.winner = playerId;
      return { state, gameOver: true, winner: playerId };
    }

    // Next player's turn
    const idx = state.players.findIndex(p => p.id === playerId);
    state.currentTurn = state.players[(idx+1) % state.players.length].id;
    return { state };
  },

  reset(players) { return this.init(players); }
};

// ──────────────────────────────────────────────
//  GameStateManager
// ──────────────────────────────────────────────
const handlers = {
  prowl: Prowl,
  shadow_court: ShadowCourt,
  realm_and_trade: RealmAndTrade,
  homerun: Homerun,
  serpents_path: SerpentsPath
};

class GameStateManager {
  constructor() {
    this.states = new Map();   // roomId -> { gameId, state, players }
  }

  initGame(roomId, gameId, players) {
    const handler = handlers[gameId];
    if (!handler) return null;
    const state = handler.init(players);
    this.states.set(roomId, { gameId, state, players });
    return state;
  }

  processMove(roomId, playerId, move) {
    const entry = this.states.get(roomId);
    if (!entry) return { error: 'Game not found' };
    const handler = handlers[entry.gameId];
    if (!handler) return { error: 'Unknown game' };
    const result = handler.processMove(entry.state, playerId, move);
    if (!result.error) entry.state = result.state || entry.state;
    return result;
  }

  resetGame(roomId) {
    const entry = this.states.get(roomId);
    if (!entry) return;
    const handler = handlers[entry.gameId];
    if (handler) entry.state = handler.reset(entry.players);
  }

  getState(roomId) {
    return this.states.get(roomId)?.state || null;
  }
}

module.exports = GameStateManager;
