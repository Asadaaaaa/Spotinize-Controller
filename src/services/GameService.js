import { gameRepository } from '../repositories/GameRepository.js';
import { trackRepository } from '../repositories/TrackRepository.js';
import { userRepository } from '../repositories/UserRepository.js';
import { historyRepository } from '../repositories/HistoryRepository.js';
import { spotifyService } from './SpotifyService.js';
import { recentlyPlayedService } from './RecentlyPlayedService.js';
import { revealService } from './RevealService.js';
import { guessService } from './GuessService.js';
import { audioService } from './AudioService.js';
import { Timer } from '../utils/Timer.js';

export class GameService {
  /**
   * Shuffles an array randomly (Fisher-Yates)
   */
  _shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Creates a Solo Game Session
   */
  async createSoloGame(userId, { category = 'Global Trends', artistQuery = null, numberOfSongs = 5 }) {
    let rawTracks = [];
    if (category === 'My Songs') {
      rawTracks = await spotifyService.getUserPersonalTracks(userId);
      if (!rawTracks || rawTracks.length === 0) {
        throw new Error('Tidak dapat memuat lagu dari Spotify kamu. Pastikan akun Spotify kamu sudah terhubung di menu profil!');
      }
    } else {
      rawTracks = await spotifyService.getTopTracks(category, artistQuery);
    }
    
    // Filter recently played tracks within 24h
    const eligibleTracks = await recentlyPlayedService.filterEligibleTracks(
      rawTracks,
      userId,
      'SOLO',
      category,
      numberOfSongs
    );

    // Shuffle & Pick unique tracks (No duplicate tracks in a single game)
    const shuffled = this._shuffle(eligibleTracks);
    const selectedTracks = shuffled.slice(0, Math.min(numberOfSongs, shuffled.length));

    if (selectedTracks.length === 0) {
      throw new Error('Tidak ada lagu yang tersedia untuk kategori ini.');
    }

    // Persist tracks to DB
    const savedTracks = await trackRepository.bulkUpsert(selectedTracks);

    // Create Game
    const game = await gameRepository.create({
      mode: 'SOLO',
      category,
      artistQuery,
      numberOfSongs: selectedTracks.length,
      currentRound: 1,
      status: 'PLAYING',
      hostId: userId
    });

    // Add Host Player
    await gameRepository.addPlayer(game.id, userId, true);

    // Create GameRounds
    for (let i = 0; i < savedTracks.length; i++) {
      const track = savedTracks[i];
      await gameRepository.createRound(game.id, i + 1, track.id);
    }

    // Immediately record to recently_played so next game never repeats these songs
    recentlyPlayedService.commitPlayedTracks([userId], savedTracks, 'SOLO', category);

    // Preload audio clips in background (non-blocking so client enters room immediately)
    audioService.preloadGameAudio(savedTracks).catch(err => {
      console.warn('[GameService] Background preload notice:', err.message);
    });

    return await this.getGameState(game.id, userId);
  }

  /**
   * Starts a Multiplayer Game
   */
  async startMultiplayerGame(gameId, hostUserId) {
    const game = await gameRepository.findById(gameId);
    if (!game) throw new Error('Game tidak ditemukan');
    if (game.hostId !== hostUserId) throw new Error('Hanya host yang dapat memulai game');

    // If game is already playing, return it safely
    if (game.status === 'PLAYING') {
      return game;
    }

    // Get all player IDs in the room
    const players = await gameRepository.getPlayersByGame(gameId);
    const playerIds = players.map(p => p.userId);

    // Validate that ALL non-host players are Ready
    const nonHostPlayers = players.filter(p => !p.isHost);
    const unreadyPlayers = nonHostPlayers.filter(p => !p.isReady);
    if (unreadyPlayers.length > 0) {
      throw new Error('Semua pemain harus siap (Ready) sebelum game dapat dimulai!');
    }

    let rawTracks = [];
    if (game.category === 'My Songs') {
      rawTracks = await spotifyService.getUserPersonalTracks(hostUserId);
      if (!rawTracks || rawTracks.length === 0) {
        throw new Error('Tidak dapat memuat lagu dari Spotify Host. Pastikan Host sudah menghubungkan akun Spotify di profil!');
      }
    } else {
      rawTracks = await spotifyService.getTopTracks(game.category, game.artistQuery);
    }

    const eligibleTracks = await recentlyPlayedService.filterEligibleTracks(
      rawTracks,
      hostUserId,
      'MULTIPLAYER',
      game.category,
      game.numberOfSongs
    );

    const savedTracks = await trackRepository.bulkUpsert(eligibleTracks.slice(0, game.numberOfSongs));

    // Create Rounds
    for (let i = 0; i < savedTracks.length; i++) {
      const track = savedTracks[i];
      await gameRepository.createRound(game.id, i + 1, track.id);
    }

    // Record to recently_played for all players in room
    recentlyPlayedService.commitPlayedTracks(playerIds, savedTracks, 'MULTIPLAYER', game.category);

    // Preload audio clips in background (non-blocking so client enters room immediately)
    audioService.preloadGameAudio(savedTracks).catch(err => {
      console.warn('[GameService] Background preload notice:', err.message);
    });

    await gameRepository.update(gameId, {
      status: 'PLAYING',
      currentRound: 1,
      numberOfSongs: savedTracks.length
    });

    // Reset players for round 1
    for (const p of players) {
      await gameRepository.updatePlayer(gameId, p.userId, {
        currentRound: 1,
        currentRevealLevel: 0.1,
        remainingAttempts: 3,
        status: 'THINKING',
        roundStartedAt: null,
        roundThinkingTime: 0
      });
    }

    return await gameRepository.findById(gameId);
  }

  /**
   * Triggers thinking timer start when player clicks initial Play
   */
  async startRoundTimer(gameId, userId, roundNumber) {
    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) return null;

    if (!player.roundStartedAt) {
      await gameRepository.updatePlayer(gameId, userId, {
        roundStartedAt: new Date(),
        status: 'THINKING'
      });
    }

    return await gameRepository.getPlayer(gameId, userId);
  }

  /**
   * Request next reveal level (0.1 -> 0.5 -> 1 -> 2 -> 3 -> 4 -> 5)
   */
  async revealNext(gameId, userId) {
    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) throw new Error('Player tidak ditemukan');

    if (!revealService.canReveal(player.currentRevealLevel)) {
      return player;
    }

    const nextLevel = revealService.revealNext(player.currentRevealLevel);
    await gameRepository.updatePlayer(gameId, userId, {
      currentRevealLevel: nextLevel
    });

    // Start round timer if not already started
    if (!player.roundStartedAt) {
      await gameRepository.updatePlayer(gameId, userId, {
        roundStartedAt: new Date()
      });
    }

    return await gameRepository.getPlayer(gameId, userId);
  }

  /**
   * Submits a guess for the current round
   */
  async submitGuess(gameId, userId, guessedTrack) {
    const game = await gameRepository.findById(gameId);
    if (!game) throw new Error('Game tidak ditemukan');

    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) throw new Error('Player tidak ditemukan');

    if (player.status === 'GUESSED' || player.status === 'SKIPPED' || player.remainingAttempts <= 0) {
      throw new Error('Round ini sudah selesai untuk kamu');
    }

    const round = await gameRepository.getRound(gameId, player.currentRound);
    if (!round || !round.track) throw new Error('Round track tidak ditemukan');

    // Calculate thinking time
    const roundStart = player.roundStartedAt || new Date();
    const thinkingTime = Timer.getElapsedSeconds(roundStart, Date.now());

    // Process guess
    const attemptNumber = 4 - player.remainingAttempts;
    const result = guessService.processGuess(
      round.track,
      guessedTrack,
      player.remainingAttempts,
      player.currentRevealLevel,
      thinkingTime
    );

    // Record guess
    await gameRepository.recordGuess({
      gameId,
      roundId: round.id,
      userId,
      guessedTitle: guessedTrack.title,
      guessedArtist: guessedTrack.artist,
      isCorrect: result.isCorrect,
      attemptNumber,
      revealLevel: player.currentRevealLevel,
      thinkingTime,
      pointsAwarded: result.pointsAwarded
    });

    const newScore = player.score + result.pointsAwarded;
    const newTotalThinkingTime = Math.round((player.totalThinkingTime + thinkingTime) * 100) / 100;
    const newStatus = result.isCorrect ? 'GUESSED' : (result.isRoundOver ? 'WRONG' : 'THINKING');

    await gameRepository.updatePlayer(gameId, userId, {
      score: newScore,
      remainingAttempts: result.remainingAttempts,
      totalThinkingTime: newTotalThinkingTime,
      roundThinkingTime: thinkingTime,
      status: newStatus
    });

    return {
      ...result,
      targetTrack: result.isRoundOver ? round.track : null,
      player: await gameRepository.getPlayer(gameId, userId)
    };
  }

  /**
   * Skips current round (Score = 0)
   */
  async skipRound(gameId, userId) {
    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) throw new Error('Player tidak ditemukan');

    const round = await gameRepository.getRound(gameId, player.currentRound);
    if (!round) throw new Error('Round tidak ditemukan');

    const roundStart = player.roundStartedAt || new Date();
    const thinkingTime = Timer.getElapsedSeconds(roundStart, Date.now());

    await gameRepository.updatePlayer(gameId, userId, {
      status: 'SKIPPED',
      remainingAttempts: 0,
      totalThinkingTime: Math.round((player.totalThinkingTime + thinkingTime) * 100) / 100,
      roundThinkingTime: thinkingTime
    });

    return {
      isRoundOver: true,
      targetTrack: round.track,
      player: await gameRepository.getPlayer(gameId, userId)
    };
  }

  /**
   * Advance to next round or finish game
   */
  async nextRound(gameId, userId) {
    const game = await gameRepository.findById(gameId);
    if (!game) throw new Error('Game tidak ditemukan');

    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) throw new Error('Player tidak ditemukan');

    const nextRoundNumber = player.currentRound + 1;

    if (nextRoundNumber > game.numberOfSongs) {
      // Game is finished for this player / all players
      if (game.mode === 'SOLO') {
        return await this.finishSoloGame(gameId, userId);
      } else {
        // Multiplayer check if all players reached end
        return await this.checkAndFinishMultiplayerGame(gameId);
      }
    }

    // Reset player state for next round
    await gameRepository.updatePlayer(gameId, userId, {
      currentRound: nextRoundNumber,
      currentRevealLevel: 0.1,
      remainingAttempts: 3,
      roundStartedAt: null,
      roundThinkingTime: 0,
      status: 'THINKING'
    });

    return await this.getGameState(gameId, userId);
  }

  /**
   * Finishes a Solo game and records stats & history
   */
  async finishSoloGame(gameId, userId) {
    await gameRepository.update(gameId, {
      status: 'FINISHED',
      finishedAt: new Date()
    });

    const player = await gameRepository.getPlayer(gameId, userId);
    const game = await gameRepository.findById(gameId);

    // Calculate correct / wrong / skipped from guesses
    const rounds = game.rounds || [];
    const playedTracks = rounds.map(r => r.track).filter(Boolean);

    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;

    for (const r of rounds) {
      const guesses = await gameRepository.getGuessesForRound(r.id, userId);
      if (guesses.some(g => g.isCorrect)) {
        correctCount++;
      } else if (guesses.length >= 3) {
        wrongCount++;
      } else {
        skippedCount++;
      }
    }

    // Record GameHistory
    await historyRepository.create({
      userId,
      gameId,
      mode: 'SOLO',
      category: game.category,
      artistQuery: game.artistQuery,
      score: player.score,
      rank: 1,
      roundReached: game.numberOfSongs,
      totalRounds: game.numberOfSongs,
      correctCount,
      wrongCount,
      skippedCount,
      totalThinkingTime: player.totalThinkingTime,
      status: 'COMPLETED'
    });

    // Commit Recently Played
    await recentlyPlayedService.commitPlayedTracks([userId], playedTracks, 'SOLO', game.category);

    // Update User Stats
    await userRepository.updateStats(userId, {
      score: player.score,
      isWin: true,
      thinkingTime: player.totalThinkingTime,
      songsGuessed: correctCount,
      category: game.category
    });

    return await this.getGameState(gameId, userId);
  }

  /**
   * Finishes Multiplayer game and computes rankings
   */
  async finishMultiplayerGame(gameId) {
    const game = await gameRepository.findById(gameId);
    if (!game || game.status === 'FINISHED') return game;

    await gameRepository.update(gameId, {
      status: 'FINISHED',
      finishedAt: new Date()
    });

    const players = await gameRepository.getPlayersByGame(gameId);
    
    // Sort ranking: 1st by highest score, 2nd by lowest totalThinkingTime
    const sortedPlayers = [...players].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.totalThinkingTime - b.totalThinkingTime;
    });

    const playedTracks = (game.rounds || []).map(r => r.track).filter(Boolean);
    const activeUserIds = [];

    for (let i = 0; i < sortedPlayers.length; i++) {
      const p = sortedPlayers[i];
      const rank = i + 1;
      const isWinner = rank === 1 && p.status !== 'LEFT';

      await gameRepository.updatePlayer(gameId, p.userId, { rank });
      activeUserIds.push(p.userId);

      // Record history
      await historyRepository.create({
        userId: p.userId,
        gameId,
        mode: 'MULTIPLAYER',
        category: game.category,
        artistQuery: game.artistQuery,
        score: p.score,
        rank,
        roundReached: p.currentRound,
        totalRounds: game.numberOfSongs,
        totalThinkingTime: p.totalThinkingTime,
        status: isWinner ? 'WINNER' : (p.status === 'LEFT' ? 'LEFT' : 'COMPLETED')
      });

      // Update User Stats
      await userRepository.updateStats(p.userId, {
        score: p.score,
        isWin: isWinner,
        thinkingTime: p.totalThinkingTime,
        category: game.category
      });
    }

    // Commit Recently Played only if game finished normally
    await recentlyPlayedService.commitPlayedTracks(activeUserIds, playedTracks, 'MULTIPLAYER', game.category);

    return await gameRepository.findById(gameId);
  }

  async checkAndFinishMultiplayerGame(gameId) {
    const game = await gameRepository.findById(gameId);
    const players = await gameRepository.getPlayersByGame(gameId);
    const activePlayers = players.filter(p => p.status !== 'LEFT');

    // If only 1 active player left, they automatically win! (Section 43)
    if (activePlayers.length <= 1 && players.length > 1) {
      return await this.finishMultiplayerGame(gameId);
    }

    // Check if all players completed all songs
    const allCompleted = activePlayers.every(p => p.currentRound >= game.numberOfSongs && p.status !== 'THINKING');
    if (allCompleted) {
      return await this.finishMultiplayerGame(gameId);
    }

    return game;
  }

  /**
   * Retrieves full game state for client view
   */
  async getGameState(gameId, userId) {
    const game = await gameRepository.findById(gameId);
    if (!game) return null;

    const player = game.players?.find(p => p.userId === userId) || null;
    const currentRoundObj = game.rounds?.find(r => r.roundNumber === (player ? player.currentRound : game.currentRound));

    // Sanitized track metadata for client during play (hide title & artist until round over)
    const isRoundOver = player ? (player.status === 'GUESSED' || player.status === 'WRONG' || player.status === 'SKIPPED') : false;

    let trackInfo = null;
    if (currentRoundObj?.track) {
      trackInfo = {
        id: currentRoundObj.track.id,
        spotifyId: currentRoundObj.track.spotifyId,
        previewUrl: currentRoundObj.track.previewUrl,
        // Only show title & artist & art if round is finished or game is finished!
        title: (isRoundOver || game.status === 'FINISHED') ? currentRoundObj.track.title : '???',
        artist: (isRoundOver || game.status === 'FINISHED') ? currentRoundObj.track.artist : '???',
        albumArt: (isRoundOver || game.status === 'FINISHED') ? currentRoundObj.track.albumArt : null
      };
    }

    // Leaderboard sorted by score DESC, thinkingTime ASC
    const leaderboard = (game.players || [])
      .map(p => ({
        userId: p.userId,
        displayName: p.user?.displayName || 'Player',
        avatarUrl: p.user?.avatarUrl || null,
        score: p.score,
        status: p.status,
        connectionStatus: p.connectionStatus,
        totalThinkingTime: p.totalThinkingTime,
        rank: p.rank,
        isReady: !!p.isReady,
        isHost: !!p.isHost
      }))
      .sort((a, b) => b.score - a.score || a.totalThinkingTime - b.totalThinkingTime);

    return {
      id: game.id,
      roomCode: game.roomCode,
      mode: game.mode,
      category: game.category,
      artistQuery: game.artistQuery,
      numberOfSongs: game.numberOfSongs,
      currentRound: player ? player.currentRound : game.currentRound,
      status: game.status,
      hostId: game.hostId,
      isHost: player ? player.isHost : false,
      player: player ? {
        score: player.score,
        currentRevealLevel: player.currentRevealLevel,
        remainingAttempts: player.remainingAttempts,
        status: player.status,
        totalThinkingTime: player.totalThinkingTime,
        roundThinkingTime: player.roundThinkingTime
      } : null,
      currentTrack: trackInfo,
      gameTrackIds: (game.rounds || []).map(r => r.trackId).filter(Boolean),
      leaderboard,
      isFinished: game.status === 'FINISHED'
    };
  }
}

export const gameService = new GameService();
export default gameService;
