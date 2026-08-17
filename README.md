# 🎮 Spotinize - Controller Backend

The OOP-architected backend controller & real-time WebSocket game engine for **Spotinize**.

---

## 🌟 Architecture & Core Capabilities

- **Clean OOP Architecture**: Separated into Models, Repositories, Services, Controllers, and Sockets.
- **SQLite with Sequelize ORM**: Zero-configuration embedded database storage with automated synchronization and relationship mapping.
- **Real-Time Multiplayer Engine**: Powered by Socket.IO with matchmaking rooms, 6-character room codes (`ROOMCODE`), grace period auto-reconnects, and synchronized round progression.
- **Dynamic Scoring & Reveal Engine**:
  - Base Reveal points: `0.1s (100) → 0.5s (90) → 1.0s (80) → 2.0s (65) → 3.0s (50) → 4.0s (35) → 5.0s (20)`.
  - Thinking time penalty decay algorithm.
  - Normalization & primary artist fuzzy matching with up to 3 attempts.
- **Multi-Tier Audio Pipeline**:
  - High-speed official HD preview integration (256kbps master).
  - Background `yt-dlp` scraping via SoundCloud (`scsearch1:`) & YouTube fallback.
  - `ffmpeg` sub-second slicing for `0.1s`, `0.5s`, `1.0s`, `2.0s`, `3.0s`, `4.0s`, `5.0s` audio snippets.
  - Batch game audio preloading for zero-latency gameplay across all rounds.
- **Real Player & Social Graph**:
  - Real-time registered player search and custom friend additions.
  - Live activity tracking for online/offline presence.
  - Global Leaderboard computed from real SQLite match statistics.
- **Spotify OAuth 2.0 & Guest Fallback**:
  - Full Spotify authorization code exchange.
  - Resilient profile fallback for development mode restrictions.
  - Guest authentication with instant bot avatars.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (ESM modules)
- **Framework**: Express.js
- **Database**: SQLite3 via Sequelize ORM
- **WebSockets**: Socket.IO
- **Audio Processing**: `ffmpeg` & `yt-dlp`
- **HTTP Client**: Axios

---

## ⚙️ Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

Configure the following variables in `.env`:
```env
PORT=3001
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_REDIRECT_URI=https://spotinize.sytes.net/auth/callback
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18+
- `ffmpeg` installed on the host system (`sudo apt install ffmpeg`)
- `yt-dlp` installed on the host system

### 2. Installation
```bash
# Navigate to the controller directory
cd /root/app/spotinize/controller

# Install dependencies
npm install
```

### 3. Running Locally
```bash
# Start server
npm start
```

### 4. Running with PM2 (Production)
```bash
pm2 start src/server.js --name "spotinize-controller"
pm2 save
```

---

## 📡 API Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/spotify/login` | Generates Spotify OAuth authorization URL |
| `POST` | `/api/auth/spotify/callback` | Exchanges code for tokens & profile session |
| `POST` | `/api/auth/guest` | Instant guest session creation |
| `POST` | `/api/game/solo/create` | Creates solo game & starts audio preloading |
| `POST` | `/api/game/multiplayer/create`| Creates room lobby with unique 6-digit code |
| `POST` | `/api/game/multiplayer/join` | Joins multiplayer room by code |
| `POST` | `/api/game/multiplayer/:id/start` | Host starts the multiplayer match |
| `GET` | `/api/game/:id` | Returns current game state and leaderboard |
| `POST` | `/api/game/:id/reveal` | Unlocks next progressive reveal stage |
| `POST` | `/api/game/:id/guess` | Evaluates song guess with 3 attempts limit |
| `POST` | `/api/game/:id/skip` | Skips current song (0 points) |
| `POST` | `/api/game/:id/next` | Advances to next round |
| `GET` | `/api/audio/clue/:trackId?duration=X` | Streams sliced audio MP3 |
| `GET` | `/api/profile/leaderboard` | Returns real global ranking table |
| `GET` | `/api/friends/:userId` | Returns real player list & friend suggestions |
| `GET` | `/api/friends/search?q=...` | Searches registered players in database |
| `POST` | `/api/friends/add` | Adds player to friends list |

---

## 📜 License
MIT License.
