# 🎮 Mini Games Platform

A browser-based multiplayer mini-games platform built with **Node.js**, **Express**, and **Socket.IO**.

## Games Included

| Game | Type | Players |
|------|------|---------|
| 🦊 Prowl | Multiplayer | 2 |
| 🎭 Shadow Court | Multiplayer | 3–6 |
| 🏰 Realm & Trade | Multiplayer | 3–4 |
| 🎲 Homerun | Multiplayer | 2–4 |
| 🐍 Serpent's Path | Multiplayer | 2–4 |

---

## ⚡ Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v16 or higher
- npm (comes with Node.js)

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Start the Server

```bash
npm start
```

Or for development (auto-restart on changes):
```bash
npm run dev
```

### 3. Open the Game

Open your browser and go to:
```
http://localhost:3000
```

---

## 📁 Folder Structure

```
Mini Games/
├── backend/
│   ├── server.js          ← Main Express + Socket.IO server
│   ├── gameRegistry.js    ← Register all games here
│   ├── lobbyManager.js    ← Public & private lobby logic
│   ├── gameStateManager.js← Server-side game logic for all games
│   └── package.json
│
└── frontend/
    ├── index.html         ← Home page (game grid)
    ├── lobby.html         ← Lobby (public/private rooms)
    ├── game.html          ← Game page
    ├── css/
    │   ├── main.css       ← Global dark theme styles
    │   ├── lobby.css      ← Lobby-specific styles
    │   └── game.css       ← Game page styles
    └── js/
        ├── main.js        ← Home page logic
        ├── lobby.js       ← Socket.IO lobby client
        ├── gameClient.js  ← Game page socket + overlay logic
        └── games/
            ├── prowl.js
            ├── shadow_court.js
            ├── realm_and_trade.js
            ├── homerun.js
            └── serpents_path.js
```

---

## 🎮 How to Play

### Public Lobby
1. Click a game → **Public Lobby**
2. Enter your nickname → **Find Match**
3. Wait for enough players to join
4. Game starts automatically!

### Private Lobby
1. Click a game → **Create Private**
2. Enter nickname + optional password
3. Share the **Room Code** with friends
4. Friends click **Join Private** and enter code + password
5. All press **Ready Up** → game starts!

---

## 🔧 Adding a New Game

### Step 1: Register in `backend/gameRegistry.js`
```js
my_new_game: {  // Use original names only
  id: 'my_new_game',
  name: 'My New Game',
  description: 'A cool new game!',
  thumbnail: '🕹️',
  type: 'multiplayer',   // or 'singleplayer'
  minPlayers: 2,
  maxPlayers: 4,
  tags: ['strategy'],
  color: '#9C27B0'
}
```

### Step 2: Add logic in `backend/gameStateManager.js`
```js
const MyNewGame = {
  init(players) { return { /* initial state */ }; },
  processMove(state, playerId, move) { return { state }; },
  reset(players) { return this.init(players); }
};
// Add to handlers:
const handlers = { ..., my_new_game: MyNewGame };
```

### Step 3: Create frontend renderer at `frontend/js/games/my_new_game.js`
```js
window.GameRenderer = (() => {
  function init(session, sendMove) { /* build DOM/canvas */ }
  function update(state)           { /* render new state */ }
  function reset()                 { /* clean up */ }
  return { init, update, reset };
})();
```

That's it! The platform auto-discovers the game.

---

## 🌐 Multiplayer Tech

- **Socket.IO** — real-time bidirectional events
- **Lobbies** — public (auto-match) and private (room code + password)
- **State sync** — server is authoritative; clients receive state updates
- **Disconnect handling** — players are notified when someone leaves

---

## 📝 Notes

- All game state is managed server-side (no cheating)
- Nicknames are saved in `localStorage`
- The server runs on port **3000** by default (change in `server.js`)
