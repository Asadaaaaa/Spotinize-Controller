import { Game, GameRound, ChallengeEntry, Post, User, GameHistory, DailyAttempt } from '../models/index.js';
import { gameRepository } from '../repositories/GameRepository.js';
import { trackRepository } from '../repositories/TrackRepository.js';
import { userRepository } from '../repositories/UserRepository.js';
import { historyRepository } from '../repositories/HistoryRepository.js';
import { notificationRepository } from '../repositories/NotificationRepository.js';
import { spotifyService } from './SpotifyService.js';
import { recentlyPlayedService } from './RecentlyPlayedService.js';
import { revealService } from './RevealService.js';
import { guessService } from './GuessService.js';
import { scoringService } from './ScoringService.js';
import { audioService } from './AudioService.js';
import { streakService } from './StreakService.js';
import { feedService } from './FeedService.js';
import { cosmeticService } from './CosmeticService.js';
import { dailyChallengeService } from './DailyChallengeService.js';
import { rankedService } from './RankedService.js';
import { leaderboardService } from './LeaderboardService.js';
import { progressionService } from './ProgressionService.js';
import { questService } from './QuestService.js';
import { rivalryService } from './RivalryService.js';
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

    if (game.gameSubtype === 'SQUAD_2V2') {
      const teamA = players.filter(p => p.teamId === 'A');
      const teamB = players.filter(p => p.teamId === 'B');
      if (teamA.length === 0 || teamB.length === 0) {
        throw new Error('Mode 2v2 Squad membutuhkan minimal 1 pemain di Tim A dan Tim B!');
      }
    }

    // For ELIMINATION with < 5 players, automatically use SURVIVAL (3 Lives) rules
    const effectiveSubtype = (game.gameSubtype === 'ELIMINATION' && players.length < 5)
      ? 'SURVIVAL'
      : (game.gameSubtype || 'CLASSIC');

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
        gameSubtype: effectiveSubtype,
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
          lives: 3,
          isEliminated: false,
          buzzLockoutUntil: null,
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

    if (player.isEliminated) {
      throw new Error('Kamu sudah tereliminasi dan berada di mode Spectator.');
    }

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

    let nextLives = player.lives ?? 3;
    let nextEliminated = !!player.isEliminated;
    if (game.mode === 'MULTIPLAYER' && game.gameSubtype === 'SURVIVAL' && !result.isCorrect && result.isRoundOver) {
      nextLives = Math.max(0, nextLives - 1);
      if (nextLives <= 0) nextEliminated = true;
    }

    await gameRepository.updatePlayer(gameId, userId, {
      score: newScore,
      remainingAttempts: result.remainingAttempts,
      totalThinkingTime: newTotalThinkingTime,
      roundThinkingTime: thinkingTime,
      status: newStatus,
      lives: nextLives,
      isEliminated: nextEliminated
    });

    if (game.mode === 'MULTIPLAYER' && result.isRoundOver) {
      if (nextEliminated || player.currentRound >= game.numberOfSongs || game.gameSubtype === 'ELIMINATION') {
        await this.checkAndFinishMultiplayerGame(gameId);
      }
    }

    return {
      ...result,
      lives: nextLives,
      isEliminated: nextEliminated,
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

    let nextLives = player.lives ?? 3;
    let nextEliminated = !!player.isEliminated;
    if (game.mode === 'MULTIPLAYER' && game.gameSubtype === 'SURVIVAL') {
      nextLives = Math.max(0, nextLives - 1);
      if (nextLives <= 0) nextEliminated = true;
    }

    await gameRepository.updatePlayer(gameId, userId, {
      status: 'SKIPPED',
      remainingAttempts: 0,
      totalThinkingTime: Math.round((player.totalThinkingTime + thinkingTime) * 100) / 100,
      roundThinkingTime: thinkingTime,
      lives: nextLives,
      isEliminated: nextEliminated
    });

    if (game.mode === 'MULTIPLAYER') {
      if (nextEliminated || player.currentRound >= game.numberOfSongs || game.gameSubtype === 'ELIMINATION') {
        await this.checkAndFinishMultiplayerGame(gameId);
      }
    }

    return {
      isRoundOver: true,
      lives: nextLives,
      isEliminated: nextEliminated,
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

    if (player.isEliminated) {
      return await this.getGameState(gameId, userId);
    }

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

  async _evaluatePlayerRounds(rounds, userId, playerStatus, playerRound) {
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    let totalWrongGuesses = 0;
    let sniper01Count = 0;
    let fastGuessesCount = 0;

    for (const r of rounds) {
      if (playerStatus === 'LEFT' && r.roundNumber > playerRound) continue;
      const guesses = await gameRepository.getGuessesForRound(r.id, userId);
      const wrongInRound = guesses.filter(g => !g.isCorrect).length;
      totalWrongGuesses += wrongInRound;

      const hit = guesses.find(g => g.isCorrect);
      if (hit) {
        correctCount++;
        if (hit.revealLevel <= 0.1) sniper01Count++;
        if (hit.revealLevel <= 0.5) fastGuessesCount++;
      } else if (guesses.length >= 3) {
        wrongCount++;
      } else if (playerStatus !== 'THINKING' || r.roundNumber < playerRound) {
        skippedCount++;
      }
    }

    return { correctCount, wrongCount, skippedCount, totalWrongGuesses, sniper01Count, fastGuessesCount };
  }

  async _runPostGameGamification(userId, game, player, stats, { isWinner = false, rank = 1 } = {}) {
    const gameSubtype = game.gameSubtype || 'CLASSIC';
    const isOfficialEligible = leaderboardService.isOfficialEligible({
      mode: game.mode,
      gameSubtype,
      category: game.category,
      numberOfSongs: game.numberOfSongs
    });

    const perfectBonus = player.status !== 'LEFT'
      ? scoringService.calculatePerfectRunBonus(stats.correctCount, stats.totalWrongGuesses, game.numberOfSongs)
      : 0;
    const perfectRun = perfectBonus > 0;
    const finalScore = (player.score || 0) + perfectBonus;

    if (perfectBonus > 0) {
      await gameRepository.updatePlayer(game.id, userId, { score: finalScore });
    }

    const prevUser = await userRepository.findById(userId);
    const prevBestScore = prevUser?.bestScore || 0;
    const prevPowerScore = prevUser?.allTimePowerScore || 0;

    let rpResult = null;
    if (game.mode === 'SOLO' && gameSubtype === 'RANKED_SOLO') {
      rpResult = await rankedService.processRankedResult(userId, {
        score: finalScore,
        correctCount: stats.correctCount,
        totalRounds: game.numberOfSongs,
        perfectRun,
        seasonId: game.seasonId
      }).catch(() => null);
    }

    if (gameSubtype === 'RANKED_ASYNC' && game.rankedDuelId) {
      await rankedService.finalizeDuelLeg(game.rankedDuelId, userId, finalScore).catch(() => {});
    }

    let dailyResult = null;
    if (gameSubtype === 'DAILY') {
      dailyResult = await dailyChallengeService.finalizeDailyAttempt(game, userId, {
        score: finalScore,
        correctCount: stats.correctCount,
        totalThinkingTime: player.totalThinkingTime
      }).catch(() => null);
    }

    let progression = null;
    if (player.status !== 'LEFT') {
      progression = await progressionService.awardGameProgression(userId, {
        category: game.category,
        gameSubtype,
        correctCount: stats.correctCount,
        sniper01Count: stats.sniper01Count,
        perfectRun,
        isWin: isWinner
      }).catch(() => null);
    }

    await historyRepository.create({
      userId,
      gameId: game.id,
      mode: game.mode,
      gameSubtype,
      category: game.category,
      artistQuery: game.artistQuery,
      score: finalScore,
      rank,
      roundReached: player.currentRound,
      totalRounds: game.numberOfSongs,
      correctCount: stats.correctCount,
      wrongCount: stats.wrongCount,
      skippedCount: stats.skippedCount,
      totalThinkingTime: player.totalThinkingTime,
      status: game.mode === 'MULTIPLAYER'
        ? (isWinner ? 'WINNER' : (player.status === 'LEFT' ? 'LEFT' : 'COMPLETED'))
        : 'COMPLETED',
      isOfficialEligible,
      perfectRun,
      xpEarned: progression?.xpEarned || 0,
      notesEarned: progression?.notesEarned || 0,
      rpDelta: rpResult?.rpDelta ?? null
    });

    const recordedInGame = stats.correctCount + stats.wrongCount + stats.skippedCount;
    await userRepository.updateStats(userId, {
      score: finalScore,
      isWin: isWinner,
      thinkingTime: player.totalThinkingTime,
      songsGuessed: stats.correctCount,
      totalSongsPlayed: player.status === 'LEFT' ? recordedInGame : game.numberOfSongs,
      category: game.category === 'Spotinize Daily' || game.category === 'Solo Ranked' ? null : game.category
    });

    if (player.status !== 'LEFT') {
      streakService.recordActivity(userId).catch(() => {});
      questService.recordGameCompletionQuests(userId, {
        gameSubtype,
        mode: game.mode,
        fastGuessesCount: stats.fastGuessesCount,
        correctCount: stats.correctCount,
        totalRounds: game.numberOfSongs
      }).catch(() => {});

      const newPowerScore = await leaderboardService.recalculateUserPowerScore(userId).catch(() => prevPowerScore);
      if (newPowerScore > prevPowerScore) {
        rivalryService.notifyLeaderboardOvertaken(userId, prevPowerScore, newPowerScore).catch(() => {});
      }
      if (dailyResult) {
        rivalryService.notifyDailyBeaten(userId, dailyResult.dailyDate, finalScore, dailyResult.dailyNumber).catch(() => {});
      }

      if (game.mode === 'MULTIPLAYER' && isWinner && finalScore > 0) {
        feedService.createAutoActivity(userId, 'multiplayer_win', {
          score: finalScore,
          category: game.category,
          gameId: game.id
        }).catch(() => {});
      } else if (finalScore > prevBestScore && finalScore > 0) {
        feedService.createAutoActivity(userId, 'personal_best', {
          score: finalScore,
          category: game.category,
          gameId: game.id
        }).catch(() => {});
      }
    }

    return {
      finalScore,
      perfectRun,
      perfectBonus,
      rpResult,
      dailyResult,
      progression
    };
  }

  /**
   * Finishes a Solo game and records stats & history
   */
  async finishSoloGame(gameId, userId) {
    const [affected] = await Game.update(
      { status: 'FINISHED', finishedAt: new Date() },
      { where: { id: gameId, status: 'PLAYING' } }
    );

    if (affected === 0) {
      return await this.getGameState(gameId, userId);
    }

    const player = await gameRepository.getPlayer(gameId, userId);
    const game = await gameRepository.findById(gameId);

    const rounds = [...(game.rounds || [])].sort((a, b) => a.roundNumber - b.roundNumber);
    const playedTracks = rounds.map(r => r.track).filter(Boolean);
    const stats = await this._evaluatePlayerRounds(rounds, userId, player.status, player.currentRound);

    await recentlyPlayedService.commitPlayedTracks([userId], playedTracks, 'SOLO', game.category);
    const prevUser = await userRepository.findById(userId);
    const postGame = await this._runPostGameGamification(userId, game, player, stats, { isWinner: true, rank: 1 });

    // Record Async Challenge entry if this game was launched from a Challenge post
    if (game.challengePostId) {
      try {
        const finalScore = postGame.finalScore;
        const existingEntry = await ChallengeEntry.findOne({
          where: { postId: game.challengePostId, userId }
        });

        if (!existingEntry) {
          await ChallengeEntry.create({
            postId: game.challengePostId,
            userId,
            gameId,
            score: finalScore,
            thinkingTime: player.totalThinkingTime
          });
        } else if (
          finalScore > existingEntry.score ||
          (finalScore === existingEntry.score && player.totalThinkingTime < existingEntry.thinkingTime)
        ) {
          await existingEntry.update({
            gameId,
            score: finalScore,
            thinkingTime: player.totalThinkingTime
          });
        }

        const challengePost = await Post.findByPk(game.challengePostId);
        if (challengePost && challengePost.userId !== userId) {
          const targetScore = challengePost.metadataJson?.targetScore || 0;
          if (finalScore > targetScore && prevUser) {
            await notificationRepository.create({
              userId: challengePost.userId,
              senderId: userId,
              type: 'CHALLENGE_BEATEN',
              title: `${prevUser.displayName} mengalahkan skormu!`,
              message: `${prevUser.displayName} mencetak ${finalScore} poin di tantangan ${game.category} (skormu: ${targetScore}).`,
              data: { postId: challengePost.id, score: finalScore }
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
    const rounds = [...(game.rounds || [])].sort((a, b) => a.roundNumber - b.roundNumber);
    const playedTracks = rounds.map(r => r.track).filter(Boolean);

    // Pre-calculate stats & apply Perfect Run Bonus before final ranking
    const playerData = [];
    for (const p of players) {
      const stats = await this._evaluatePlayerRounds(rounds, p.userId, p.status, p.currentRound);
      const perfectBonus = p.status !== 'LEFT'
        ? scoringService.calculatePerfectRunBonus(stats.correctCount, stats.totalWrongGuesses, game.numberOfSongs)
        : 0;
      const effectiveScore = (p.score || 0) + perfectBonus;
      playerData.push({ player: p, stats, effectiveScore });
    }

    let winningTeam = null;
    if (game.gameSubtype === 'SQUAD_2V2') {
      const teamStats = { A: [], B: [] };
      for (const item of playerData) {
        if (item.player.status !== 'LEFT' && (item.player.teamId === 'A' || item.player.teamId === 'B')) {
          teamStats[item.player.teamId].push(item.effectiveScore);
        }
      }
      const avgA = teamStats.A.length ? teamStats.A.reduce((a, b) => a + b, 0) / teamStats.A.length : -1;
      const avgB = teamStats.B.length ? teamStats.B.reduce((a, b) => a + b, 0) / teamStats.B.length : -1;
      winningTeam = avgA >= avgB ? 'A' : 'B';
    }

    const sortedPlayers = [...playerData].sort((a, b) => {
      const aLeft = a.player.status === 'LEFT' ? 1 : 0;
      const bLeft = b.player.status === 'LEFT' ? 1 : 0;
      if (aLeft !== bLeft) return aLeft - bLeft;
      if (game.gameSubtype === 'SURVIVAL' || game.gameSubtype === 'ELIMINATION') {
        const aElim = a.player.isEliminated ? 1 : 0;
        const bElim = b.player.isEliminated ? 1 : 0;
        if (aElim !== bElim) return aElim - bElim;
      }
      if (b.effectiveScore !== a.effectiveScore) return b.effectiveScore - a.effectiveScore;
      return a.player.totalThinkingTime - b.player.totalThinkingTime;
    });

    const activeUserIds = [];
    for (let i = 0; i < sortedPlayers.length; i++) {
      const { player: p, stats } = sortedPlayers[i];
      const rank = i + 1;
      const isWinner = game.gameSubtype === 'SQUAD_2V2'
        ? (p.status !== 'LEFT' && p.teamId === winningTeam)
        : (rank === 1 && p.status !== 'LEFT' && !p.isEliminated);

      await gameRepository.updatePlayer(gameId, p.userId, { rank });
      if (p.status !== 'LEFT') activeUserIds.push(p.userId);

      await this._runPostGameGamification(p.userId, game, p, stats, { isWinner, rank });
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

    if (activePlayers.length === 1 && players.length > 1) {
      return await this.finishMultiplayerGame(gameId);
    }

    // Survival / Elimination: check surviving players
    if (game.gameSubtype === 'SURVIVAL' || game.gameSubtype === 'ELIMINATION') {
      const survivors = activePlayers.filter(p => !p.isEliminated);
      if (survivors.length <= 1 && activePlayers.length > 1) {
        return await this.finishMultiplayerGame(gameId);
      }

      if (game.gameSubtype === 'ELIMINATION' && survivors.length > 1) {
        const minRound = Math.min(...survivors.map(p => p.currentRound));
        const allFinishedMinRound = survivors.every(p => p.currentRound > minRound || p.status !== 'THINKING');
        if (allFinishedMinRound && minRound < game.numberOfSongs) {
          // Eliminate lowest-scoring survivor at this stage
          const candidates = [...survivors].sort((a, b) => a.score - b.score || b.totalThinkingTime - a.totalThinkingTime);
          const victim = candidates[0];
          if (victim) {
            await gameRepository.updatePlayer(gameId, victim.userId, { isEliminated: true, lives: 0 });
            if (survivors.length - 1 <= 1) {
              return await this.finishMultiplayerGame(gameId);
            }
          }
        }
      }
    }

    const nonEliminated = activePlayers.filter(p => !p.isEliminated);
    const allCompleted = nonEliminated.length === 0 || nonEliminated.every(p => p.currentRound >= game.numberOfSongs && p.status !== 'THINKING');
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

    const rawLeaderboard = (game.players || [])
      .map(p => ({
        userId: p.userId,
        username: p.user?.username || null,
        displayName: p.user?.displayName || 'Player',
        avatarUrl: p.user?.avatarUrl || null,
        level: p.user?.level || 1,
        equippedFrameId: p.user?.equippedFrameId || null,
        equippedTitleId: p.user?.equippedTitleId || null,
        score: p.score,
        status: p.status,
        connectionStatus: p.connectionStatus,
        totalThinkingTime: p.totalThinkingTime,
        currentRound: p.currentRound,
        rank: p.rank,
        lives: p.lives ?? 3,
        isEliminated: !!p.isEliminated,
        teamId: p.teamId || null,
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

    const leaderboard = await cosmeticService.hydrateUsersCosmetics(rawLeaderboard).catch(() => rawLeaderboard);

    let teamStandings = null;
    if (game.gameSubtype === 'SQUAD_2V2') {
      const teamA = leaderboard.filter(p => p.teamId === 'A' && p.status !== 'LEFT');
      const teamB = leaderboard.filter(p => p.teamId === 'B' && p.status !== 'LEFT');
      const sumA = teamA.reduce((s, p) => s + (p.score || 0), 0);
      const sumB = teamB.reduce((s, p) => s + (p.score || 0), 0);
      teamStandings = {
        A: { totalScore: sumA, avgScore: teamA.length ? Math.round(sumA / teamA.length) : 0, count: teamA.length },
        B: { totalScore: sumB, avgScore: teamB.length ? Math.round(sumB / teamB.length) : 0, count: teamB.length }
      };
    }

    const isWaitingForOthers = Boolean(
      game.mode === 'MULTIPLAYER' &&
      game.status === 'PLAYING' &&
      player &&
      !player.isEliminated &&
      player.currentRound >= game.numberOfSongs &&
      player.status !== 'THINKING' &&
      player.status !== 'LEFT'
    );

    let tracks = [];
    let v07Summary = null;
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

      if (userId) {
        const [historyRow, dailyAttemptRow, rankedSummary, freshUser] = await Promise.all([
          GameHistory.findOne({ where: { gameId, userId }, order: [['createdAt', 'DESC']] }),
          game.gameSubtype === 'DAILY' && game.dailyDate
            ? DailyAttempt.findOne({ where: { dailyDate: game.dailyDate, userId } })
            : Promise.resolve(null),
          game.gameSubtype === 'RANKED_SOLO'
            ? rankedService.getUserRankedSummary(userId).catch(() => null)
            : Promise.resolve(null),
          User.findByPk(userId, { attributes: ['xp', 'level', 'notesBalance', 'gachaTickets'] })
        ]);

        v07Summary = {
          gameSubtype: game.gameSubtype || 'CLASSIC',
          perfectRun: Boolean(historyRow?.perfectRun),
          xpEarned: historyRow?.xpEarned || 0,
          notesEarned: historyRow?.notesEarned || 0,
          rpDelta: historyRow?.rpDelta ?? null,
          rankedSummary,
          dailyResult: dailyAttemptRow ? {
            dailyDate: dailyAttemptRow.dailyDate,
            emojiGrid: dailyAttemptRow.emojiGrid,
            score: dailyAttemptRow.score
          } : null,
          userLevel: freshUser?.level || 1,
          levelState: progressionService.computeLevelState(freshUser?.xp || 0),
          notesBalance: freshUser?.notesBalance || 0
        };
      }
    }

    return {
      id: game.id,
      roomCode: game.roomCode,
      mode: game.mode,
      gameSubtype: game.gameSubtype || 'CLASSIC',
      dailyDate: game.dailyDate || null,
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
        lives: player.lives ?? 3,
        isEliminated: !!player.isEliminated,
        teamId: player.teamId || null,
        totalThinkingTime: player.totalThinkingTime,
        roundThinkingTime: player.roundThinkingTime
      } : null,
      currentTrack: trackInfo,
      gameTrackIds: rounds.map(r => r.trackId).filter(Boolean),
      tracks,
      leaderboard,
      teamStandings,
      v07Summary,
      isWaitingForOthers,
      isFinished: game.status === 'FINISHED'
    };
  }
}

export const gameService = new GameService();
export default gameService;
