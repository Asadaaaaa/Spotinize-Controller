import { gameRepository } from '../repositories/GameRepository.js';
import { guessService } from './GuessService.js';
import { gameService } from './GameService.js';

const REVEAL_STEPS = [0.1, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0];

class SpeedBuzzService {
  constructor() {
    this.rooms = new Map();
  }

  _getRoom(gameId) {
    if (!this.rooms.has(gameId)) {
      this.rooms.set(gameId, {
        readyUsers: new Set(),
        started: false,
        currentRound: 1,
        revealIndex: 0,
        activeBuzzUserId: null,
        buzzExpiresAt: null,
        revealTimer: null,
        buzzTimeoutTimer: null,
        countdownTimer: null
      });
    }
    return this.rooms.get(gameId);
  }

  cleanupRoom(gameId) {
    const room = this.rooms.get(gameId);
    if (!room) return;
    if (room.revealTimer) clearTimeout(room.revealTimer);
    if (room.buzzTimeoutTimer) clearTimeout(room.buzzTimeoutTimer);
    if (room.countdownTimer) clearTimeout(room.countdownTimer);
    this.rooms.delete(gameId);
  }

  async handleClientReady(io, gameId, userId) {
    const game = await gameRepository.findById(gameId);
    if (!game || game.gameSubtype !== 'SPEED_BUZZ' || game.status !== 'PLAYING') return;

    const room = this._getRoom(gameId);
    room.readyUsers.add(userId);
    if (room.started) {
      io.to(`game:${gameId}`).emit('speedbuzz:state', {
        currentRound: room.currentRound,
        revealLevel: REVEAL_STEPS[room.revealIndex] || 0.1,
        activeBuzzUserId: room.activeBuzzUserId,
        buzzExpiresAt: room.buzzExpiresAt
      });
      return;
    }

    const activePlayers = (game.players || []).filter(p => p.status !== 'LEFT');
    const allReady = activePlayers.length > 0 && activePlayers.every(p => room.readyUsers.has(p.userId));

    if (allReady) {
      this._beginCountdownAndRound(io, gameId, 1);
    } else if (!room.countdownTimer) {
      // Safety fallback: auto-start after 5s even if 1 client is slow
      room.countdownTimer = setTimeout(() => {
        room.countdownTimer = null;
        if (!room.started) {
          this._beginCountdownAndRound(io, gameId, 1);
        }
      }, 5000);
    }
  }

  _beginCountdownAndRound(io, gameId, roundNumber) {
    const room = this._getRoom(gameId);
    if (room.revealTimer) clearTimeout(room.revealTimer);
    if (room.buzzTimeoutTimer) clearTimeout(room.buzzTimeoutTimer);
    if (room.countdownTimer) clearTimeout(room.countdownTimer);

    room.started = true;
    room.currentRound = roundNumber;
    room.revealIndex = 0;
    room.activeBuzzUserId = null;
    room.buzzExpiresAt = null;

    io.to(`game:${gameId}`).emit('speedbuzz:countdown', {
      roundNumber,
      seconds: 3
    });

    room.countdownTimer = setTimeout(async () => {
      room.countdownTimer = null;
      await gameRepository.update(gameId, { currentRound: roundNumber }).catch(() => {});
      const game = await gameRepository.findById(gameId).catch(() => null);
      if (!game || game.status !== 'PLAYING') {
        this.cleanupRoom(gameId);
        return;
      }

      for (const p of game.players || []) {
        if (p.status !== 'LEFT') {
          await gameRepository.updatePlayer(gameId, p.userId, {
            currentRound: roundNumber,
            currentRevealLevel: 0.1,
            remainingAttempts: 3,
            status: 'THINKING',
            roundStartedAt: new Date()
          }).catch(() => {});
        }
      }

      this._emitRevealAndScheduleNext(io, gameId);
    }, 3000);
  }

  _emitRevealAndScheduleNext(io, gameId) {
    const room = this.rooms.get(gameId);
    if (!room) return;
    if (room.revealTimer) clearTimeout(room.revealTimer);

    const revealLevel = REVEAL_STEPS[room.revealIndex] ?? 5.0;
    io.to(`game:${gameId}`).emit('speedbuzz:auto_reveal', {
      roundNumber: room.currentRound,
      revealLevel
    });

    if (room.revealIndex < REVEAL_STEPS.length - 1) {
      room.revealTimer = setTimeout(() => {
        if (room.activeBuzzUserId) return; // paused while someone is answering
        room.revealIndex += 1;
        this._emitRevealAndScheduleNext(io, gameId);
      }, 3500);
    } else {
      // Final 5.0s window expires after 10s -> move to next round with no winner
      room.revealTimer = setTimeout(() => {
        this._advanceAfterRoundEnd(io, gameId, null, null);
      }, 10000);
    }
  }

  async handleBuzz(io, gameId, userId) {
    const game = await gameRepository.findById(gameId);
    if (!game || game.gameSubtype !== 'SPEED_BUZZ' || game.status !== 'PLAYING') return;

    const room = this._getRoom(gameId);
    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player || player.status === 'LEFT') return;

    if (player.buzzLockoutUntil && new Date(player.buzzLockoutUntil) > new Date()) {
      const waitMs = new Date(player.buzzLockoutUntil).getTime() - Date.now();
      throw new Error(`Tunggu ${Math.ceil(waitMs / 1000)} detik (lockout salah tebak).`);
    }

    if (room.activeBuzzUserId) {
      throw new Error('Pemain lain sudah menekan Buzz lebih dulu!');
    }

    if (room.revealTimer) clearTimeout(room.revealTimer);

    room.activeBuzzUserId = userId;
    room.buzzExpiresAt = Date.now() + 8000;

    io.to(`game:${gameId}`).emit('speedbuzz:locked', {
      userId,
      displayName: player.user?.displayName || 'Player',
      revealLevel: REVEAL_STEPS[room.revealIndex] ?? 0.1,
      expiresAt: room.buzzExpiresAt
    });

    if (room.buzzTimeoutTimer) clearTimeout(room.buzzTimeoutTimer);
    room.buzzTimeoutTimer = setTimeout(async () => {
      if (room.activeBuzzUserId !== userId) return;
      await this._penalizeAndUnlock(io, gameId, userId, 'Waktu Buzz habis!');
    }, 8000);
  }

  async handleBuzzGuess(io, gameId, userId, guessedTrack) {
    const room = this.rooms.get(gameId);
    if (!room || room.activeBuzzUserId !== userId) {
      throw new Error('Tekan tombol BUZZ terlebih dahulu!');
    }

    if (room.buzzTimeoutTimer) clearTimeout(room.buzzTimeoutTimer);

    const game = await gameRepository.findById(gameId);
    const round = await gameRepository.getRound(gameId, room.currentRound);
    const player = await gameRepository.getPlayer(gameId, userId);
    if (!game || !round?.track || !player) {
      room.activeBuzzUserId = null;
      return;
    }

    const revealLevel = REVEAL_STEPS[room.revealIndex] ?? 1.0;
    const thinkingTime = player.roundStartedAt
      ? Math.max(0.2, (Date.now() - new Date(player.roundStartedAt).getTime()) / 1000)
      : 1.5;

    const result = guessService.processGuess(round.track, guessedTrack, 3, revealLevel, thinkingTime);

    await gameRepository.recordGuess({
      gameId,
      roundId: round.id,
      userId,
      guessedTitle: guessedTrack.title,
      guessedArtist: guessedTrack.artist,
      isCorrect: result.isCorrect,
      attemptNumber: 1,
      revealLevel,
      thinkingTime,
      pointsAwarded: result.isCorrect ? result.pointsAwarded + 25 : 0
    });

    if (result.isCorrect) {
      const speedBonus = 25;
      const totalAwarded = result.pointsAwarded + speedBonus;
      await gameRepository.updatePlayer(gameId, userId, {
        score: (player.score || 0) + totalAwarded,
        totalThinkingTime: Math.round(((player.totalThinkingTime || 0) + thinkingTime) * 100) / 100,
        status: 'GUESSED'
      });

      room.activeBuzzUserId = null;
      room.buzzExpiresAt = null;

      await this._advanceAfterRoundEnd(io, gameId, {
        userId,
        displayName: player.user?.displayName || 'Player',
        pointsAwarded: totalAwarded
      }, round.track);

      return { isCorrect: true, pointsAwarded: totalAwarded, targetTrack: round.track };
    }

    await this._penalizeAndUnlock(io, gameId, userId, 'Tebakan salah! Lockout 3 detik & -15 poin.');
    return { isCorrect: false, pointsAwarded: 0, lockedOutMs: 3000 };
  }

  async _penalizeAndUnlock(io, gameId, userId, reason) {
    const room = this.rooms.get(gameId);
    if (!room) return;

    const player = await gameRepository.getPlayer(gameId, userId);
    const lockoutUntil = new Date(Date.now() + 3000);
    if (player) {
      await gameRepository.updatePlayer(gameId, userId, {
        score: Math.max(0, (player.score || 0) - 15),
        buzzLockoutUntil: lockoutUntil
      });
    }

    room.activeBuzzUserId = null;
    room.buzzExpiresAt = null;

    const state = await gameService.getGameState(gameId, userId);
    io.to(`game:${gameId}`).emit('speedbuzz:lockout', {
      userId,
      reason,
      lockoutUntil: lockoutUntil.toISOString(),
      leaderboard: state?.leaderboard || []
    });

    this._emitRevealAndScheduleNext(io, gameId);
  }

  async _advanceAfterRoundEnd(io, gameId, winnerInfo, track) {
    const room = this.rooms.get(gameId);
    if (!room) return;
    if (room.revealTimer) clearTimeout(room.revealTimer);
    if (room.buzzTimeoutTimer) clearTimeout(room.buzzTimeoutTimer);

    const game = await gameRepository.findById(gameId);
    if (!game) return;

    const state = await gameService.getGameState(gameId, game.hostId);
    io.to(`game:${gameId}`).emit('speedbuzz:round_won', {
      roundNumber: room.currentRound,
      winner: winnerInfo,
      track: track ? { id: track.id, title: track.title, artist: track.artist, albumArt: track.albumArt } : null,
      leaderboard: state?.leaderboard || []
    });

    if (room.currentRound >= game.numberOfSongs) {
      this.cleanupRoom(gameId);
      await gameService.finishMultiplayerGame(gameId);
      const finalState = await gameService.getGameState(gameId, game.hostId);
      io.to(`game:${gameId}`).emit('game:finish', {
        leaderboard: finalState?.leaderboard || [],
        winner: finalState?.leaderboard?.[0] || null
      });
      return;
    }

    const nextRoundNum = room.currentRound + 1;
    setTimeout(() => {
      if (!this.rooms.has(gameId)) return;
      this._beginCountdownAndRound(io, gameId, nextRoundNum);
    }, 2800);
  }
}

export const speedBuzzService = new SpeedBuzzService();
export default speedBuzzService;
