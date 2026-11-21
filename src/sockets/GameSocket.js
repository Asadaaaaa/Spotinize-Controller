import { gameService } from '../services/GameService.js';
import { broadcastGameFinish } from './socketBroadcaster.js';

export class GameSocket {
  constructor(io) {
    this.io = io;
  }

  registerEvents(socket) {
    const requireSocketAuth = () => {
      if (!socket.authenticated || !socket.userId) {
        socket.emit('error', { message: 'Autentikasi socket diperlukan.' });
        return false;
      }
      return true;
    };

    // Player triggers initial playback -> starts timer
    socket.on('player:play', async ({ gameId, roundNumber } = {}) => {
      try {
        if (!requireSocketAuth() || !gameId) return;
        const userId = socket.userId;
        const player = await gameService.startRoundTimer(gameId, userId, roundNumber);

        this.io.to(`game:${gameId}`).emit('status:update', {
          userId,
          status: 'THINKING',
          currentRound: player?.currentRound
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Player requests progressive reveal
    socket.on('player:reveal', async ({ gameId } = {}) => {
      try {
        if (!requireSocketAuth() || !gameId) return;
        const player = await gameService.revealNext(gameId, socket.userId);
        socket.emit('player:reveal_success', {
          revealLevel: player.currentRevealLevel
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Player submits a guess
    socket.on('player:guess', async ({ gameId, track } = {}) => {
      try {
        if (!requireSocketAuth() || !gameId) return;
        const userId = socket.userId;
        const result = await gameService.submitGuess(gameId, userId, track);

        if (result.isCorrect) {
          socket.emit('player:correct', result);
          this.io.to(`game:${gameId}`).emit('score:update', {
            userId,
            score: result.player.score,
            totalThinkingTime: result.player.totalThinkingTime,
            status: 'GUESSED',
            currentRound: result.player.currentRound
          });
        } else {
          socket.emit('player:wrong', result);
          this.io.to(`game:${gameId}`).emit('status:update', {
            userId,
            status: result.isRoundOver ? 'WRONG' : 'THINKING',
            currentRound: result.player.currentRound
          });
        }

        const updatedState = await gameService.getGameState(gameId, userId);
        if (updatedState) {
          this.io.to(`game:${gameId}`).emit('ranking:update', {
            leaderboard: updatedState.leaderboard
          });

          if (updatedState.status === 'FINISHED' || updatedState.isFinished) {
            broadcastGameFinish(this.io, gameId, updatedState.leaderboard);
          }
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Player skips round
    socket.on('player:skip', async ({ gameId } = {}) => {
      try {
        if (!requireSocketAuth() || !gameId) return;
        const userId = socket.userId;
        const result = await gameService.skipRound(gameId, userId);
        socket.emit('player:skip_success', result);

        this.io.to(`game:${gameId}`).emit('status:update', {
          userId,
          status: 'SKIPPED',
          currentRound: result.player.currentRound
        });

        const updatedState = await gameService.getGameState(gameId, userId);
        if (updatedState) {
          this.io.to(`game:${gameId}`).emit('ranking:update', {
            leaderboard: updatedState.leaderboard
          });

          if (updatedState.status === 'FINISHED' || updatedState.isFinished) {
            broadcastGameFinish(this.io, gameId, updatedState.leaderboard);
          }
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Advance to next round (individual player only — never broadcast game:round:start room-wide)
    socket.on('game:next', async ({ gameId } = {}) => {
      try {
        if (!requireSocketAuth() || !gameId) return;
        const userId = socket.userId;
        const state = await gameService.nextRound(gameId, userId);

        if (state.isFinished || state.status === 'FINISHED') {
          broadcastGameFinish(this.io, gameId, state.leaderboard);
        } else {
          socket.emit('game:state', state);
          if (state.mode === 'MULTIPLAYER') {
            this.io.to(`game:${gameId}`).emit('status:update', {
              userId,
              status: state.player?.status || 'THINKING',
              currentRound: state.currentRound
            });
            this.io.to(`game:${gameId}`).emit('ranking:update', {
              leaderboard: state.leaderboard
            });
          }
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });
  }
}

export default GameSocket;
