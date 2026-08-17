import { gameService } from '../services/GameService.js';
import { matchmakingService } from '../services/MatchmakingService.js';
import { spotifyService } from '../services/SpotifyService.js';
import { trackRepository } from '../repositories/TrackRepository.js';

export class GameController {
  async getDemoTrack(req, res) {
    try {
      const tracks = await spotifyService.getTopTracks('Global Trends');
      if (!tracks || tracks.length === 0) {
        return res.status(404).json({ error: 'No trending tracks available' });
      }

      // Top 1 Trending Track
      const targetTrack = tracks[0];
      const savedTracks = await trackRepository.bulkUpsert([targetTrack]);
      const saved = savedTracks[0];

      // 3 Decoys from subsequent tracks
      const decoys = tracks.slice(1, 8).filter(t => t.title.toLowerCase() !== targetTrack.title.toLowerCase()).slice(0, 3);
      
      const rawOptions = [
        { title: targetTrack.title, artist: targetTrack.artist, isCorrect: true },
        ...decoys.map(d => ({ title: d.title, artist: d.artist, isCorrect: false }))
      ];

      // Shuffle options (Fisher-Yates)
      for (let i = rawOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rawOptions[i], rawOptions[j]] = [rawOptions[j], rawOptions[i]];
      }

      return res.json({
        track: {
          id: saved.id,
          title: saved.title,
          artist: saved.artist,
          album: saved.album,
          albumArt: saved.albumArt,
          previewUrl: saved.previewUrl
        },
        options: rawOptions.map((opt, idx) => ({ id: idx + 1, title: opt.title, artist: opt.artist, isCorrect: opt.isCorrect })),
        clueDurations: [0.1, 0.5, 1.0, 2.0, 3.0, 5.0]
      });
    } catch (err) {
      console.error('[GameController] getDemoTrack error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  async createSolo(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      if (!userId) return res.status(401).json({ error: 'User ID is required' });

      const { category, artistQuery, numberOfSongs } = req.body;
      const gameState = await gameService.createSoloGame(userId, {
        category: category || 'Global Trends',
        artistQuery,
        numberOfSongs: parseInt(numberOfSongs || 5, 10)
      });

      return res.json(gameState);
    } catch (err) {
      console.error('Create solo game error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  async createMultiplayer(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      if (!userId) return res.status(401).json({ error: 'User ID is required' });

      const { category, artistQuery, numberOfSongs } = req.body;
      const game = await matchmakingService.createRoom(userId, {
        category: category || 'Global Trends',
        artistQuery,
        numberOfSongs: parseInt(numberOfSongs || 5, 10)
      });

      const gameState = await gameService.getGameState(game.id, userId);
      return res.json(gameState);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async joinMultiplayer(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      const { roomCode } = req.body;

      if (!userId) return res.status(401).json({ error: 'User ID is required' });
      if (!roomCode) return res.status(400).json({ error: 'Room code is required' });

      const game = await matchmakingService.joinRoom(roomCode, userId);
      const gameState = await gameService.getGameState(game.id, userId);
      return res.json(gameState);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async startMultiplayer(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      const { gameId } = req.params;

      const game = await gameService.startMultiplayerGame(gameId, userId);
      const gameState = await gameService.getGameState(game.id, userId);

      // Broadcast game:started to all players in the room
      const io = req.app?.get('io');
      if (io) {
        io.to(`game:${gameId}`).emit('game:started', {
          gameId,
          status: 'PLAYING',
          currentRound: 1
        });
      }

      return res.json(gameState);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async getGameState(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.query.userId;
      const { gameId } = req.params;

      const state = await gameService.getGameState(gameId, userId);
      if (!state) return res.status(404).json({ error: 'Game not found' });

      return res.json(state);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async startTimer(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      const { gameId } = req.params;

      const player = await gameService.startRoundTimer(gameId, userId);
      return res.json({ player });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async revealNext(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      const { gameId } = req.params;

      const player = await gameService.revealNext(gameId, userId);
      return res.json({ player });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async submitGuess(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      const { gameId } = req.params;
      const { track } = req.body; // { title, artist, spotifyId }

      if (!track || !track.title) {
        return res.status(400).json({ error: 'Track information is required' });
      }

      const result = await gameService.submitGuess(gameId, userId, track);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async skipRound(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      const { gameId } = req.params;

      const result = await gameService.skipRound(gameId, userId);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async nextRound(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      const { gameId } = req.params;

      await gameService.nextRound(gameId, userId);

      // Always return the canonical getGameState format
      const gameState = await gameService.getGameState(gameId, userId);

      // If game just finished, broadcast to all players in the room
      if (gameState.status === 'FINISHED' || gameState.isFinished) {
        const io = req.app?.get('io');
        if (io) {
          io.to(`game:${gameId}`).emit('game:finish', {
            leaderboard: gameState.leaderboard
          });
        }
      }

      return res.json(gameState);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async leaveGame(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      const { gameId } = req.params;

      const game = await matchmakingService.leaveRoom(gameId, userId);
      return res.json({ success: true, game });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async toggleReady(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      const { gameId } = req.params;

      const player = await matchmakingService.toggleReady(gameId, userId);
      return res.json({ player });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

export const gameController = new GameController();
export default gameController;
