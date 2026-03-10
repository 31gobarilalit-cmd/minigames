/**
 * GameStateManager
 * Server-side game state + move validation for every multiplayer game.
 * Add new games by adding a handler to the `handlers` map.
 */

// ──────────────────────────────────────────────
//  PROWL  (Sheep & Wolf — 20 sheep vs 2 wolves)
//  Cross-shaped board + 9-cell pen at top.
//  Wolves capture by jumping (mandatory). Sheep
//  win by filling the pen; wolves win by capturing 12+.
// ──────────────────────────────────────────────
const Prowl = {
  COLS: 7,
  ROWS: 10,

  // 42 valid positions on a 10×7 grid
  VALID: new Set([
    2,3,4, 9,10,11, 16,17,18,            // pen   (rows 0-2, cols 2-4)
    23,24,25, 30,31,32,                   // top arm (rows 3-4, cols 2-4)
    35,36,37,38,39,40,41,                 // middle (row 5)
    42,43,44,45,46,47,48,                 // middle (row 6)
    49,50,51,52,53,54,55,                 // middle (row 7)
    58,59,60, 65,66,67                    // bottom arm (rows 8-9, cols 2-4)
  ]),

  PEN: new Set([2,3,4,9,10,11,16,17,18]),

  // 8-directional adjacency (including diagonals)
  ADJACENCY: (() => {
    const COLS = 7;
    const valid = new Set([
      2,3,4, 9,10,11, 16,17,18,
      23,24,25, 30,31,32,
      35,36,37,38,39,40,41,
      42,43,44,45,46,47,48,
      49,50,51,52,53,54,55,
      58,59,60, 65,66,67
    ]);
    const adj = {};
    valid.forEach(pos => {
      const row = Math.floor(pos / COLS), col = pos % COLS;
      adj[pos] = [];
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const nr = row + dr, nc = col + dc, np = nr * COLS + nc;
        if (nr >= 0 && nr < 10 && nc >= 0 && nc < COLS && valid.has(np)) {
          adj[pos].push({ pos: np, dr, dc });
        }
      }
    });
    return adj;
  })(),

  init(players) {
    // 20 sheep fill rows 6-9 (bottom half)
    const sheepPositions = [
      42,43,44,45,46,47,48,   // row 6
      49,50,51,52,53,54,55,   // row 7
      58,59,60,               // row 8
      65,66,67                // row 9
    ];
    // 2 wolves start in the top arm
    return {
      wolves: [23, 25],
      sheep: new Set(sheepPositions),
      wolfPlayer: players[0].id,
      sheepPlayer: players[1].id,
      currentTurn: players[1].id,   // sheep move first
      captured: 0,
      winner: null,
      activeWolf: null               // wolf index during multi-jump
    };
  },

  processMove(state, playerId, move) {
    const { from, to } = move;
    if (!(state.sheep instanceof Set)) state.sheep = new Set(state.sheep);
    if (playerId !== state.currentTurn) return { error: 'Not your turn' };

    const isWolfTurn = state.currentTurn === state.wolfPlayer;
    if (isWolfTurn) {
      return this._processWolfMove(state, from, to);
    } else {
      return this._processSheepMove(state, from, to);
    }
  },

  _processSheepMove(state, from, to) {
    if (!state.sheep.has(from)) return { error: 'No sheep at that position' };

    const adj = this.ADJACENCY[from];
    const step = adj && adj.find(n => n.pos === to);
    if (!step) return { error: 'Invalid move' };
    if (step.dr > 0) return { error: 'Sheep cannot move backward' };
    if (state.sheep.has(to) || state.wolves.includes(to)) return { error: 'Cell occupied' };

    state.sheep.delete(from);
    state.sheep.add(to);

    // Sheep win: all 9 pen positions filled
    const penFilled = [...this.PEN].every(p => state.sheep.has(p));
    if (penFilled) {
      state.winner = state.sheepPlayer;
      return { state: this._serialize(state), gameOver: true, winner: state.sheepPlayer };
    }

    state.currentTurn = state.wolfPlayer;
    return { state: this._serialize(state) };
  },

  _processWolfMove(state, from, to) {
    const wolfIdx = state.wolves.indexOf(from);
    if (wolfIdx === -1) return { error: 'No wolf at that position' };

    // Multi-jump: must continue with the same wolf
    if (state.activeWolf !== null && state.activeWolf !== wolfIdx) {
      return { error: 'Must continue jumping with the same wolf' };
    }

    const allCaptures = this._getAllWolfCaptures(state);
    const mustCapture = allCaptures.length > 0;
    const captureMove = this._getCaptureMove(state, from, to);

    if (mustCapture && !captureMove) {
      return { error: 'A capture is available — you must jump!' };
    }

    if (captureMove) {
      // Execute capture
      state.sheep.delete(captureMove.over);
      state.wolves[wolfIdx] = to;
      state.captured++;

      // Wolf win: captured 12+ (fewer than 9 sheep remain)
      if (state.sheep.size < 9) {
        state.winner = state.wolfPlayer;
        state.activeWolf = null;
        return { state: this._serialize(state), gameOver: true, winner: state.wolfPlayer };
      }

      // Check for multi-jump from landing cell
      const moreCaps = this._getWolfCapturesFrom(state, to);
      if (moreCaps.length > 0) {
        state.activeWolf = wolfIdx;
        return { state: this._serialize(state) };
      }

      state.activeWolf = null;
      state.currentTurn = state.sheepPlayer;
      return { state: this._serialize(state) };
    }

    // Regular move (no captures available)
    const adj = this.ADJACENCY[from];
    const isAdj = adj && adj.some(n => n.pos === to);
    if (!isAdj) return { error: 'Invalid move' };
    if (state.sheep.has(to) || state.wolves.includes(to)) return { error: 'Cell occupied' };
    if (this.PEN.has(to)) return { error: 'Wolves cannot enter the pen' };

    state.wolves[wolfIdx] = to;
    state.activeWolf = null;
    state.currentTurn = state.sheepPlayer;
    return { state: this._serialize(state) };
  },

  _getCaptureMove(state, from, to) {
    const adj = this.ADJACENCY[from];
    if (!adj) return null;
    for (const { pos: midPos, dr, dc } of adj) {
      if (state.sheep.has(midPos)) {
        const landRow = Math.floor(from / this.COLS) + dr * 2;
        const landCol = from % this.COLS + dc * 2;
        const landPos = landRow * this.COLS + landCol;
        if (landPos === to && this.VALID.has(to) && !this.PEN.has(to) &&
            !state.sheep.has(to) && !state.wolves.includes(to)) {
          return { over: midPos };
        }
      }
    }
    return null;
  },

  _getWolfCapturesFrom(state, wolfPos) {
    const captures = [];
    const adj = this.ADJACENCY[wolfPos];
    if (!adj) return captures;
    for (const { pos: midPos, dr, dc } of adj) {
      if (state.sheep.has(midPos)) {
        const landRow = Math.floor(wolfPos / this.COLS) + dr * 2;
        const landCol = wolfPos % this.COLS + dc * 2;
        const landPos = landRow * this.COLS + landCol;
        if (landPos >= 0 && this.VALID.has(landPos) && !this.PEN.has(landPos) &&
            !state.sheep.has(landPos) && !state.wolves.includes(landPos)) {
          captures.push({ from: wolfPos, over: midPos, to: landPos });
        }
      }
    }
    return captures;
  },

  _getAllWolfCaptures(state) {
    const caps = [];
    state.wolves.forEach(wPos => {
      caps.push(...this._getWolfCapturesFrom(state, wPos));
    });
    return caps;
  },

  _serialize(state) {
    return {
      ...state,
      sheep: [...state.sheep],
      pen: [...this.PEN]
    };
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
        return { state: this._publicState(state), gameOver: true, winner: 'traitor', perPlayer: true };
      }
    }

    return { state: this._publicState(state), perPlayer: true };
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

  // Hex tile layout rows: 3, 4, 5, 4, 3 tiles
  TILE_ROWS: [3, 4, 5, 4, 3],

  // Each tile's 6 vertices, mapped to a shared vertex ID (54 unique vertices for standard board)
  TILE_VERTICES: (() => {
    // Standard Catan vertex mapping for 19 hex tiles
    // Rows of 3, 4, 5, 4, 3 tiles
    const tileVerts = [];
    // Vertex IDs are assigned per intersection point.
    // For simplicity, assign 6 vertex IDs per tile with shared edges.
    const rowSizes = [3, 4, 5, 4, 3];
    let vertexId = 0;
    const vertexMap = {}; // "row,col,corner" -> vertexId
    const getOrCreate = (key) => {
      if (!(key in vertexMap)) vertexMap[key] = vertexId++;
      return vertexMap[key];
    };

    let tileIdx = 0;
    rowSizes.forEach((count, row) => {
      for (let col = 0; col < count; col++) {
        // Each hex has 6 vertices: top, top-right, bottom-right, bottom, bottom-left, top-left
        const t  = getOrCreate(`${row},${col},top`);
        const tr = getOrCreate(`${row},${col},tr`);
        const br = getOrCreate(`${row},${col},br`);
        const b  = getOrCreate(`${row},${col},bot`);
        // Shared vertices with neighbors
        const bl = col > 0 ? getOrCreate(`${row},${col-1},br`) : getOrCreate(`${row},${col},bl`);
        const tl = col > 0 ? getOrCreate(`${row},${col-1},tr`) : getOrCreate(`${row},${col},tl`);

        // Share with row above
        if (row > 0) {
          // Map top vertices to bottom of row above
        }

        tileVerts.push([t, tr, br, b, bl, tl]);
        tileIdx++;
      }
    });
    return tileVerts;
  })(),

  _buildBoard() {
    const types = [...this.TILE_TYPES];
    const nums = [...this.NUMBERS];
    for (let i = types.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [types[i],types[j]]=[types[j],types[i]]; }
    for (let i = nums.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [nums[i],nums[j]]=[nums[j],nums[i]]; }
    let ni = 0;
    return types.map((type, i) => ({
      id: i, type,
      number: type === 'desert' ? null : nums[ni++],
      vertices: this.TILE_VERTICES[i] || []
    }));
  },

  processMove(state, playerId, move) {
    const { action } = move;
    if (state.currentTurn !== playerId) return { error: 'Not your turn' };
    const player = state.players.find(p => p.id === playerId);

    // ── Setup phase: free settlement + road placement ──
    if (state.phase === 'setup') {
      if (action === 'build_settlement') {
        player.settlements.push(move.vertex);
        player.vp++;

        // In second round of setup, give initial resources from adjacent tiles
        if (state.setupDone >= state.players.length) {
          state.tiles.forEach(tile => {
            if (tile.type !== 'desert' && tile.vertices.includes(move.vertex)) {
              player.resources[tile.type] = (player.resources[tile.type] || 0) + 1;
            }
          });
        }
        return { state };
      }
      if (action === 'build_road') {
        player.roads.push(move.edge);
        state.setupDone++;

        // Advance turn (snake draft: 1,2,3,3,2,1 for 3 players)
        const n = state.players.length;
        const idx = state.players.findIndex(p => p.id === playerId);
        if (state.setupDone < n) {
          // First round: forward
          state.currentTurn = state.players[(idx + 1) % n].id;
        } else if (state.setupDone < n * 2) {
          if (state.setupDone === n) {
            // Stay on same player for second settlement (reverse starts)
            state.currentTurn = state.players[n - 1].id;
          } else {
            // Second round: backward
            state.currentTurn = state.players[(idx - 1 + n) % n].id;
          }
        }
        if (state.setupDone >= n * 2) {
          state.phase = 'main';
          state.currentTurn = state.players[0].id;
        }
        return { state };
      }
      return { error: 'During setup, place a settlement then a road' };
    }

    // ── Main phase ──
    if (action === 'roll_dice') {
      if (state.diceRolled) return { error: 'Already rolled this turn' };
      const d1 = Math.ceil(Math.random()*6), d2 = Math.ceil(Math.random()*6);
      state.dice = [d1, d2];
      state.diceRolled = true;
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
      if (!this.RESOURCES.includes(give) || !this.RESOURCES.includes(receive)) return { error: 'Invalid resource' };
      if ((player.resources[give] || 0) < 4) return { error: 'Need 4 of the same resource' };
      player.resources[give] -= 4;
      player.resources[receive] = (player.resources[receive] || 0) + 1;
    }

    if (action === 'end_turn') {
      const idx = state.players.findIndex(p => p.id === playerId);
      state.currentTurn = state.players[(idx + 1) % state.players.length].id;
      state.diceRolled = false;
      state.dice = null;
      state.phase_action = null;
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
  HOME_COLS: { red: 0, blue: 13, green: 26, yellow: 39 }, // start positions on 52-cell track
  SAFE_CELLS: [0, 8, 13, 21, 26, 34, 39, 47],
  TRACK_SIZE: 52,
  HOME_STRETCH: 57, // positions 52-56 are the home column; 57 = finished

  init(players) {
    const pieces = {};
    players.forEach((p, i) => {
      const color = this.COLORS[i];
      // Each piece tracks 'steps' taken from its start position (0 = in yard, 1-51 = on track, 52-56 = home stretch, 57 = finished)
      pieces[p.id] = { color, steps: [0,0,0,0] }; // 0 = in yard
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

  // Convert a player's piece steps to absolute board position (for captures & display)
  _stepsToPos(color, steps) {
    if (steps === 0) return -1; // in yard
    if (steps > this.TRACK_SIZE) return -2; // in home stretch (safe, no captures)
    const start = this.HOME_COLS[color];
    return (start + steps - 1) % this.TRACK_SIZE;
  },

  processMove(state, playerId, move) {
    if (state.currentTurn !== playerId) return { error: 'Not your turn' };
    const { action } = move;
    const piece = state.pieces[playerId];

    if (action === 'roll') {
      if (!state.canRoll) return { error: 'Already rolled' };
      state.dice = Math.ceil(Math.random() * 6);
      state.canRoll = false;

      // Check if any piece can move; if not, auto-pass
      const hasMove = piece.steps.some((s, i) => {
        if (s === 0) return state.dice === 6; // need 6 to exit yard
        if (s >= this.HOME_STRETCH) return false; // already finished
        const newSteps = s + state.dice;
        return newSteps <= this.HOME_STRETCH; // can't overshoot home
      });
      if (!hasMove) {
        // No valid moves — auto-pass turn
        if (state.dice === 6) {
          state.canRoll = true;
        } else {
          const idx = state.players.findIndex(p => p.id === playerId);
          state.currentTurn = state.players[(idx+1) % state.players.length].id;
          state.canRoll = true;
        }
      }
    }

    if (action === 'move_piece') {
      if (state.canRoll) return { error: 'Roll first' };
      const { pieceIndex } = move;
      const steps = piece.steps[pieceIndex];

      if (steps === 0) {
        // In yard — need 6 to exit
        if (state.dice !== 6) return { error: 'Need a 6 to exit yard' };
        piece.steps[pieceIndex] = 1; // step onto start cell
        // Capture check at start position
        const boardPos = this._stepsToPos(piece.color, 1);
        this._captureAt(state, playerId, boardPos);
      } else if (steps >= this.HOME_STRETCH) {
        return { error: 'Piece already finished' };
      } else {
        const newSteps = steps + state.dice;
        if (newSteps > this.HOME_STRETCH) return { error: 'Would overshoot home' };
        piece.steps[pieceIndex] = newSteps;

        // Capture check only if on the shared track (not home stretch)
        if (newSteps <= this.TRACK_SIZE) {
          const boardPos = this._stepsToPos(piece.color, newSteps);
          this._captureAt(state, playerId, boardPos);
        }
      }

      // Check winner — all 4 pieces finished
      if (piece.steps.every(s => s >= this.HOME_STRETCH)) {
        state.winner = playerId;
        return { state: this._serializeState(state), gameOver: true, winner: playerId };
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

    return { state: this._serializeState(state) };
  },

  _captureAt(state, playerId, boardPos) {
    if (this.SAFE_CELLS.includes(boardPos)) return;
    Object.entries(state.pieces).forEach(([pid, p]) => {
      if (pid !== playerId) {
        p.steps.forEach((s, i) => {
          if (s > 0 && s <= this.TRACK_SIZE) {
            const otherPos = this._stepsToPos(p.color, s);
            if (otherPos === boardPos) {
              p.steps[i] = 0; // send back to yard
            }
          }
        });
      }
    });
  },

  _serializeState(state) {
    // Convert steps to board positions for the client to render
    const positions = {};
    Object.entries(state.pieces).forEach(([pid, piece]) => {
      positions[pid] = {
        color: piece.color,
        steps: piece.steps,
        positions: piece.steps.map(s => {
          if (s === 0) return -1;  // in yard
          if (s >= this.HOME_STRETCH) return 99;  // finished (at center)
          if (s > this.TRACK_SIZE) return s;       // home stretch: 53-56
          return this._stepsToPos(piece.color, s); // shared track: 0-51
        })
      };
    });
    return { ...state, pieces: positions };
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
    // Return a client-safe serialized copy (handles Sets, computed fields, etc.)
    return this._serializeForClient(gameId, state);
  }

  _serializeForClient(gameId, state) {
    const handler = handlers[gameId];
    if (!handler) return state;
    // Use the handler's own serialize method if available
    if (handler._serialize) return handler._serialize(state);
    if (handler._serializeState) return handler._serializeState(state);
    if (handler._publicState) return handler._publicState(state);
    return state;
  }

  processMove(roomId, playerId, move) {
    const entry = this.states.get(roomId);
    if (!entry) return { error: 'Game not found' };
    const handler = handlers[entry.gameId];
    if (!handler) return { error: 'Unknown game' };
    // Handlers mutate entry.state in place and return a serialized copy for clients.
    // We never overwrite entry.state with the serialized version.
    const result = handler.processMove(entry.state, playerId, move);
    return result;
  }

  resetGame(roomId) {
    const entry = this.states.get(roomId);
    if (!entry) return;
    const handler = handlers[entry.gameId];
    if (handler) entry.state = handler.reset(entry.players);
  }

  getState(roomId) {
    const entry = this.states.get(roomId);
    if (!entry) return null;
    return this._serializeForClient(entry.gameId, entry.state);
  }

  getPlayerState(roomId, playerId) {
    const entry = this.states.get(roomId);
    if (!entry) return null;
    // For Shadow Court, add the player's own role
    if (entry.gameId === 'shadow_court' && entry.state.assignments) {
      const pub = this._serializeForClient(entry.gameId, entry.state);
      return { ...pub, myRole: entry.state.assignments[playerId] };
    }
    return this._serializeForClient(entry.gameId, entry.state);
  }
}

module.exports = GameStateManager;
