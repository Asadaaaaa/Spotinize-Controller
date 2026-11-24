import { Game, GameRound, ChallengeEntry, Post, User } from '../models/index.js';
import { gameRepository } from '../repositories/GameRepository.js';
import { trackRepository } from '../repositories/TrackRepository.js';
import { userRepository } from '../repositories/UserRepository.js';
import { historyRepository } from '../repositories/HistoryRepository.js';
import { notificationRepository } from '../repositories/NotificationRepository.js';
import { spotifyService } from './SpotifyService.js';
import { recentlyPlayedService } from './RecentlyPlayedService.js';
import { revealService } from './RevealService.js';
import { guessService } from './GuessService.js';
import { audioService } from './AudioService.js';
import { streakService } from './StreakService.js';
import { feedService } from './FeedService.js';
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
        rawTracks = await spotifyService.getTopTracks('Global Trends');
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
   * Creates an Async Challenge Solo Game replaying the exact same track sequence as sourceGameId.
   */
  async createChallengeGame(userId, sourceGameId, challengePostId) {
    const sourceGame = await gameRepository.findById(sourceGameId);
    if (!sourceGame) {
      throw new Error('Game sumber tantangan tidak ditemukan');
    }

    const sourceRounds = [...(sourceGame.rounds || [])].sort((a, b) => a.roundNumber - b.roundNumber);
    if (sourceRounds.length === 0) {
      throw new Error('Set lagu tantangan tidak tersedia');
    }

    const game = await gameRepository.create({
      mode: 'SOLO',
      category: sourceGame.category,
      artistQuery: sourceGame.artistQuery,
      numberOfSongs: sourceRounds.length,
      currentRound: 1,
      status: 'PLAYING',
      hostId: userId,
      challengePostId
    });

    await gameRepository.addPlayer(game.id, userId, true);

    const tracks = [];
    for (let i = 0; i < sourceRounds.length; i++) {
      const r = sourceRounds[i];
      await gameRepository.createRound(game.id, i + 1, r.trackId);
      if (r.track) tracks.push(r.track);
    }

    if (tracks.length > 0) {
      audioService.preloadGameAudio(tracks).catch(err => {
        console.warn('[GameService] Challenge preload notice:', err.message);
      });
    }

    return await this.getGameState(game.id, userId);
  }

  /**
   * Starts a Multiplayer Game with atomic STARTING lock to prevent duplicate rounds.
   */
  async startMultiplayerGame(gameId, hostUserId) {
    const game = await gameRepository.findById(gameId);
    if (!game) throw new Error('Game tidak ditemukan');
    if (game.hostId !== hostUserId) throw new Error('Hanya host yang dapat memulai game');

    // If game is already playing, return it safely
    if (game.status === 'PLAYING') {
      return game;
    }
    if (game.status === 'STARTING') {
      throw new Error('Game sedang dimulai, mohon tunggu sebentar...');
    }
    if (game.status !== 'WAITING') {
      throw new Error('Game tidak dapat dimulai.');
    }

    // Get all players in the room
    const players = await gameRepository.getPlayersByGame(gameId, 'WAITING');
    if (players.length < 2) {
      throw new Error('Minimal 2 pemain diperlukan untuk memulai game Multiplayer!');
    }
    const playerIds = players.map(p => p.userId);

    // Validate that ALL non-host players are Ready
    const nonHostPlayers = players.filter(p => !p.isHost);
    const unreadyPlayers = nonHostPlayers.filter(p => !p.isReady);
    if (unreadyPlayers.length > 0) {
      throw new Error('Semua pemain harus siap (Ready) sebelum game dapat dimulai!');
    }

    // Atomic transition WAITING -> STARTING
    const [affected] = await Game.update(
      { status: 'STARTING' },
      { where: { id: gameId, status: 'WAITING' } }
    );

    if (affected === 0) {
      const refreshed = await gameRepository.findById(gameId);
      if (refreshed?.status === 'PLAYING') return refreshed;
      throw new Error('Game sedang dimulai, mohon tunggu sebentar...');
    }

    try {
      let rawTracks = [];
      if (game.category === 'My Songs') {
        rawTracks = await spotifyService.getUserPersonalTracks(hostUserId);
        if (!rawTracks || rawTracks.length === 0) {
          rawTracks = await spotifyService.getTopTracks('Global Trends');
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

      const shuffled = this._shuffle(eligibleTracks);
      const selectedTracks = shuffled.slice(0, Math.min(game.numberOfSongs, shuffled.length));

      if (selectedTracks.length === 0) {
        throw new Error('Tidak ada lagu yang tersedia untuk kategori ini.');
      }

      const savedTracks = await trackRepository.bulkUpsert(selectedTracks);

      // Clean any stray rounds before creating ordered 1..N rounds
      await GameRound.destroy({ where: { gameId } });

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
          score: 0,
          currentRound: 1,
          currentRevealLevel: 0.1,
          remainingAttempts: 3,
          status: 'THINKING',
          roundStartedAt: null,
          roundThinkingTime: 0,
          totalThinkingTime: 0,
          rank: null
        });
      }

      return await gameRepository.findById(gameId);
    } catch (err) {
      await GameRound.destroy({ where: { gameId } });
      await Game.update({ status: 'WAITING' }, { where: { id: gameId, status: 'STARTING' } });
      throw err;
    }
  }

  /**
   * Triggers thinking timer start when player clicks initial Play
   */
  async startRoundTimer(gameId, userId, roundNumber) {
    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) return null;

    if (!player.roundStartedAt && player.status === 'THINKING') {
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
    if (game.status !== 'PLAYING') throw new Error('Game tidak sedang berlangsung');

    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) throw new Error('Player tidak ditemukan');

    if (player.status === 'GUESSED' || player.status === 'SKIPPED' || player.status === 'LEFT' || player.remainingAttempts <= 0) {
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

    // If this was the final round and round ended for this player, check if all players are done
    if (game.mode === 'MULTIPLAYER' && result.isRoundOver && player.currentRound >= game.numberOfSongs) {
      await this.checkAndFinishMultiplayerGame(gameId);
    }

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
    const game = await gameRepository.findById(gameId);
    if (!game) throw new Error('Game tidak ditemukan');
    if (game.status !== 'PLAYING') throw new Error('Game tidak sedang berlangsung');

    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) throw new Error('Player tidak ditemukan');
    if (player.status !== 'THINKING') {
      throw new Error('Round ini sudah selesai untuk kamu');
    }

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

    if (game.mode === 'MULTIPLAYER' && player.currentRound >= game.numberOfSongs) {
      await this.checkAndFinishMultiplayerGame(gameId);
    }

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

    if (game.status === 'FINISHED') {
      return await this.getGameState(gameId, userId);
    }

    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) throw new Error('Player tidak ditemukan');

    if (player.status === 'THINKING') {
      return await this.getGameState(gameId, userId);
    }

    const nextRoundNumber = player.currentRound + 1;

    if (nextRoundNumber > game.numberOfSongs) {
      if (game.mode === 'SOLO') {
        return await this.finishSoloGame(gameId, userId);
      } else {
        await this.checkAndFinishMultiplayerGame(gameId);
        return await this.getGameState(gameId, userId);
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

    const rounds = [...(game.rounds || [])].sort((a, b) => a.roundNumber - b.roundNumber);
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

    // Check previous best before updating stats
    const prevUser = await userRepository.findById(userId);
    const prevBestScore = prevUser?.bestScore || 0;

    // Update User Stats
    await userRepository.updateStats(userId, {
      score: player.score,
      isWin: true,
      thinkingTime: player.totalThinkingTime,
      songsGuessed: correctCount,
      totalSongsPlayed: game.numberOfSongs,
      category: game.category
    });

    // Record Daily Streak & Auto-Activity for Personal Best (non-blocking)
    streakService.recordActivity(userId).catch(() => {});
    if (player.score > prevBestScore && player.score > 0) {
      feedService.createAutoActivity(userId, 'personal_best', {
        score: player.score,
        category: game.category,
        gameId
      }).catch(() => {});
    }

    // Record Async Challenge entry if this game was launched from a Challenge post
    if (game.challengePostId) {
      try {
        const existingEntry = await ChallengeEntry.findOne({
          where: { postId: game.challengePostId, userId }
        });

        if (!existingEntry) {
          await ChallengeEntry.create({
            postId: game.challengePostId,
            userId,
            gameId,
            score: player.score,
            thinkingTime: player.totalThinkingTime
          });
        } else if (
          player.score > existingEntry.score ||
          (player.score === existingEntry.score && player.totalThinkingTime < existingEntry.thinkingTime)
        ) {
          await existingEntry.update({
            gameId,
            score: player.score,
            thinkingTime: player.totalThinkingTime
          });
        }

        const challengePost = await Post.findByPk(game.challengePostId);
        if (challengePost && challengePost.userId !== userId) {
          const targetScore = challengePost.metadataJson?.targetScore || 0;
          if (player.score > targetScore && prevUser) {
            await notificationRepository.create({
              userId: challengePost.userId,
              senderId: userId,
              type: 'CHALLENGE_BEATEN',
              title: `${prevUser.displayName} mengalahkan skormu!`,
              message: `${prevUser.displayName} mencetak ${player.score} poin di tantangan ${game.category} (skormu: ${targetScore}).`,
              data: { postId: challengePost.id, score: player.score }
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('[GameService] Challenge entry record notice:', e.message);
      }
    }

    return await this.getGameState(gameId, userId);
  }

  /**
   * Finishes Multiplayer game atomically and computes rankings & stats
   */
  async finishMultiplayerGame(gameId) {
    const [affected] = await Game.update(
      { status: 'FINISHED', finishedAt: new Date() },
      { where: { id: gameId, status: 'PLAYING' } }
    );

    if (affected === 0) {
      return await gameRepository.findById(gameId);
    }

    const game = await gameRepository.findById(gameId);
    const players = await gameRepository.getPlayersByGame(gameId);

    // Sort ranking: non-LEFT first, then highest score, then lowest totalThinkingTime
    const sortedPlayers = [...players].sort((a, b) => {
      const aLeft = a.status === 'LEFT' ? 1 : 0;
      const bLeft = b.status === 'LEFT' ? 1 : 0;
      if (aLeft !== bLeft) return aLeft - bLeft;
      if (b.score !== a.score) return b.score - a.score;
      return a.totalThinkingTime - b.totalThinkingTime;
    });

    const rounds = [...(game.rounds || [])].sort((a, b) => a.roundNumber - b.roundNumber);
    const playedTracks = rounds.map(r => r.track).filter(Boolean);
    const activeUserIds = [];

    for (let i = 0; i < sortedPlayers.length; i++) {
      const p = sortedPlayers[i];
      const rank = i + 1;
      const isWinner = rank === 1 && p.status !== 'LEFT';

      let correctCount = 0;
      let wrongCount = 0;
      let skippedCount = 0;

      for (const r of rounds) {
        if (p.status === 'LEFT' && r.roundNumber > p.currentRound) continue;
        const guesses = await gameRepository.getGuessesForRound(r.id, p.userId);
        if (guesses.some(g => g.isCorrect)) {
          correctCount++;
        } else if (guesses.length >= 3) {
          wrongCount++;
        } else if (r.roundNumber < p.currentRound || p.status === 'SKIPPED' || p.status !== 'THINKING') {
          skippedCount++;
        }
      }

      await gameRepository.updatePlayer(gameId, p.userId, { rank });
      if (p.status !== 'LEFT') {
        activeUserIds.push(p.userId);
      }

      // Record history with complete breakdown
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
        correctCount,
        wrongCount,
        skippedCount,
        totalThinkingTime: p.totalThinkingTime,
        status: isWinner ? 'WINNER' : (p.status === 'LEFT' ? 'LEFT' : 'COMPLETED')
      });

      // Update User Stats
      const prevUser = await userRepository.findById(p.userId);
      const prevBestScore = prevUser?.bestScore || 0;

      const recordedInGame = correctCount + wrongCount + skippedCount;
      await userRepository.updateStats(p.userId, {
        score: p.score,
        isWin: isWinner,
        thinkingTime: p.totalThinkingTime,
        songsGuessed: correctCount,
        totalSongsPlayed: p.status === 'LEFT' ? recordedInGame : game.numberOfSongs,
        category: game.category
      });

      if (p.status !== 'LEFT') {
        streakService.recordActivity(p.userId).catch(() => {});
        if (isWinner && p.score > 0) {
          feedService.createAutoActivity(p.userId, 'multiplayer_win', {
            score: p.score,
            category: game.category,
            playerCount: players.length,
            gameId
          }).catch(() => {});
        } else if (p.score > prevBestScore && p.score > 0) {
          feedService.createAutoActivity(p.userId, 'personal_best', {
            score: p.score,
            category: game.category,
            gameId
          }).catch(() => {});
        }
      }
    }

    if (activeUserIds.length > 0 && playedTracks.length > 0) {
      await recentlyPlayedService.commitPlayedTracks(activeUserIds, playedTracks, 'MULTIPLAYER', game.category);
    }

    return await gameRepository.findById(gameId);
  }

  async checkAndFinishMultiplayerGame(gameId) {
    const game = await gameRepository.findById(gameId);
    if (!game || game.status !== 'PLAYING') return game;

    const players = await gameRepository.getPlayersByGame(gameId);
    const activePlayers = players.filter(p => p.status !== 'LEFT');

    if (activePlayers.length === 0) {
      await gameRepository.update(gameId, {
        status: 'ABANDONED',
        finishedAt: new Date()
      });
      return await gameRepository.findById(gameId);
    }

    // If only 1 active player left in a multiplayer match, they automatically win!
    if (activePlayers.length === 1 && players.length > 1) {
      return await this.finishMultiplayerGame(gameId);
    }

    // Check if all active players completed all songs
    const allCompleted = activePlayers.every(p => p.currentRound >= game.numberOfSongs && p.status !== 'THINKING');
    if (allCompleted) {
      return await this.finishMultiplayerGame(gameId);
    }

    return game;
  }

  /**
   * Retrieves the active WAITING/STARTING/PLAYING game for a user (if any)
   */
  async getActiveGame(userId) {
    const activeGame = await gameRepository.findActiveGameForUser(userId);
    if (!activeGame) return null;

    if (activeGame.status === 'WAITING') {
      const ageMs = Date.now() - new Date(activeGame.updatedAt).getTime();
      if (ageMs > 60 * 60 * 1000) {
        await gameRepository.update(activeGame.id, { status: 'ABANDONED', finishedAt: new Date() });
        return null;
      }
    }

    return await this.getGameState(activeGame.id, userId);
  }

  /**
   * Retrieves full game state for client view
   */
  async getGameState(gameId, userId) {
    const game = await gameRepository.findById(gameId);
    if (!game) return null;

    const rounds = [...(game.rounds || [])].sort((a, b) => a.roundNumber - b.roundNumber);
    const player = game.players?.find(p => p.userId === userId) || null;
    const currentRoundObj = rounds.find(r => r.roundNumber === (player ? player.currentRound : game.currentRound));

    // Sanitized track metadata for client during play (hide title & artist until round over)
    const isRoundOver = player ? (player.status === 'GUESSED' || player.status === 'WRONG' || player.status === 'SKIPPED') : false;

    let trackInfo = null;
    if (currentRoundObj?.track) {
      trackInfo = {
        id: currentRoundObj.track.id,
        spotifyId: currentRoundObj.track.spotifyId,
        previewUrl: currentRoundObj.track.previewUrl,
        title: (isRoundOver || game.status === 'FINISHED') ? currentRoundObj.track.title : '???',
        artist: (isRoundOver || game.status === 'FINISHED') ? currentRoundObj.track.artist : '???',
        albumArt: (isRoundOver || game.status === 'FINISHED') ? currentRoundObj.track.albumArt : null
      };
    }

    const leaderboard = (game.players || [])
      .map(p => ({
        userId: p.userId,
        displayName: p.user?.displayName || 'Player',
        avatarUrl: p.user?.avatarUrl || null,
        score: p.score,
        status: p.status,
        connectionStatus: p.connectionStatus,
        totalThinkingTime: p.totalThinkingTime,
        currentRound: p.currentRound,
        rank: p.rank,
        isReady: !!p.isReady,
        isHost: !!p.isHost,
        createdAt: p.createdAt
      }))
      .sort((a, b) => {
        if (game.status === 'WAITING') {
          return (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0) || new Date(a.createdAt) - new Date(b.createdAt);
        }
        const aLeft = a.status === 'LEFT' ? 1 : 0;
        const bLeft = b.status === 'LEFT' ? 1 : 0;
        if (aLeft !== bLeft) return aLeft - bLeft;
        return b.score - a.score || a.totalThinkingTime - b.totalThinkingTime;
      })
      .map(({ createdAt, ...entry }) => entry);

    const isWaitingForOthers = Boolean(
      game.mode === 'MULTIPLAYER' &&
      game.status === 'PLAYING' &&
      player &&
      player.currentRound >= game.numberOfSongs &&
      player.status !== 'THINKING' &&
      player.status !== 'LEFT'
    );

    // Include complete ordered track list when game is FINISHED (for FinalResultPage & ShareInstagramModal)
    let tracks = [];
    if (game.status === 'FINISHED') {
      tracks = await Promise.all(rounds.map(async (r) => {
        let isCorrect = false;
        let userResult = 'SKIPPED';
        if (userId) {
          const guesses = await gameRepository.getGuessesForRound(r.id, userId);
          if (guesses.some(g => g.isCorrect)) {
            isCorrect = true;
            userResult = 'GUESSED';
          } else if (guesses.length >= 3) {
            userResult = 'WRONG';
          }
        }
        return {
          roundNumber: r.roundNumber,
          id: r.track?.id || r.trackId,
          spotifyId: r.track?.spotifyId || null,
          title: r.track?.title || 'Unknown Track',
          artist: r.track?.artist || 'Unknown Artist',
          album: r.track?.album || null,
          albumArt: r.track?.albumArt || null,
          isCorrect,
          userResult
        };
      }));
    }

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
      gameTrackIds: rounds.map(r => r.trackId).filter(Boolean),
      tracks,
      leaderboard,
      isWaitingForOthers,
      isFinished: game.status === 'FINISHED'
    };
  }
}

export const gameService = new GameService();
export default gameService;
