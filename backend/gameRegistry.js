/**
 * ============================================================
 *  GAME REGISTRY
 *  To add a new game: add an entry to the `games` object below.
 *  The frontend auto-reads this via GET /api/games
 *
 *  NOTE: All game names, descriptions, and branding are original.
 *  Underlying gameplay mechanics are in the public domain.
 * ============================================================
 */

const games = {

  /**
   * PROWL
   * Original name for the public-domain Fox & Geese / Fox & Hounds
   * board game mechanic (predator vs prey on a cross-shaped grid).
   * Mechanic dates to medieval Europe — fully public domain.
   */
  prowl: {
    id: 'prowl',
    name: 'Prowl',
    description: 'Two wolves hunt a flock of twenty sheep on a cross-shaped board. Sheep must fill the pen to win — wolves must capture enough to stop them!',
    thumbnail: '🐺',
    type: 'multiplayer',
    minPlayers: 2,
    maxPlayers: 2,
    tags: ['strategy', 'board', 'classic'],
    color: '#E07B39'
  },

  /**
   * SHADOW COURT
   * Original name for a social deduction game.
   * Genre and mechanics (hidden roles, voting) are public domain.
   * No affiliation with IO Interactive's Hitman® franchise.
   */
  shadow_court: {
    id: 'shadow_court',
    name: 'Shadow Court',
    description: 'Loyalists vs Conspirators in a battle of legislation and deceit. Pass loyal decrees or corrupt the court — but beware the Mastermind hiding among you.',
    thumbnail: '🎭',
    type: 'multiplayer',
    minPlayers: 5,
    maxPlayers: 10,
    tags: ['social', 'deduction', 'party'],
    color: '#1A1A2E'
  },

  /**
   * REALM & TRADE
   * Original name for a resource-collection settlement-building board game.
   * Hex grid + resource trading mechanics are public domain.
   * No affiliation with Catan GmbH or their Catan® trademark.
   */
  realm_and_trade: {
    id: 'realm_and_trade',
    name: 'Realm & Trade',
    description: 'Settle uncharted lands, harvest resources, and build an empire. Strike deals or race alone — first to 10 glory points claims the realm.',
    thumbnail: '🏰',
    type: 'multiplayer',
    minPlayers: 3,
    maxPlayers: 4,
    tags: ['strategy', 'trading', 'board'],
    color: '#2E7D32'
  },

  /**
   * HOMERUN
   * Original name for a cross-and-circle race board game mechanic.
   * The pachisi/cross-and-circle race mechanic is public domain.
   * No affiliation with Hasbro's Ludo® or Mattel's branded versions.
   */
  homerun: {
    id: 'homerun',
    name: 'Homerun',
    description: 'Roll the dice, race four tokens around the board, and bring them safely home. Block rivals, survive captures, and be first to win.',
    thumbnail: '🎲',
    type: 'multiplayer',
    minPlayers: 2,
    maxPlayers: 4,
    tags: ['dice', 'racing', 'family'],
    color: '#7B1FA2'
  },

  /**
   * SERPENT'S PATH
   * Original name for the classic snakes-and-ladders race mechanic.
   * The numbered-grid dice race with shortcuts/setbacks is public domain.
   * No affiliation with Hasbro's Chutes and Ladders® or Milton Bradley branded versions.
   */
  serpents_path: {
    id: 'serpents_path',
    name: "Serpent's Path",
    description: 'Climb the golden ladders, dread the serpents\' bite. Roll your way to square 100 — but fortune can flip in an instant.',
    thumbnail: '🐍',
    type: 'multiplayer',
    minPlayers: 2,
    maxPlayers: 4,
    tags: ['dice', 'luck', 'family'],
    color: '#00897B'
  }

};

module.exports = {
  getAllGames: () => Object.values(games),
  getGame: (id) => games[id] || null,
  registerGame: (cfg) => { if (!cfg.id) throw new Error('Game must have an id'); games[cfg.id] = cfg; }
};
