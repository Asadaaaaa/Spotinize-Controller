import { gameService } from '../services/GameService.js';
import { gameRepository } from '../repositories/GameRepository.js';

export class GameSocket {
  constructor(io) {
    this.io = io;
  }

  registerEvents(socket) {
    // Player triggers initial playback -> starts timer
    socket.on('player:play', async ({ gameId, userId, roundNumber }) => {
      try {
        await gameService.startRoundTimer(gameId, userId, roundNumber);
        const player = await gameRepository.getPlayer(gameId, userId);
        
        // Notify room that player is thinking
        this.io.to(`game:${gameId}`).emit('status:update', {
          userId,
          status: 'THINKING'
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Player requests progressive reveal (0.1s -> 0.5s -> 1s -> 2s -> 3s -> 4s -> 5s)
    socket.on('player:reveal', async ({ gameId, userId }) => {
      try {
        const player = await gameService.revealNext(gameId, userId);
        socket.emit('player:reveal_success', {
          revealLevel: player.currentRevealLevel
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Player submits a guess
    socket.on('player:guess', async ({ gameId, userId, track }) => {
      try {
        const result = await gameService.submitGuess(gameId, userId, track);

        if (result.isCorrect) {
          // Send success payload to guessing player
          socket.emit('player:correct', result);

          // Broadcast status & score update to entire room (Section 38 & 39)
          this.io.to(`game:${gameId}`).emit('score:update', {
            userId,
            score: result.player.score,
            totalThinkingTime: result.player.totalThinkingTime,
            status: 'GUESSED'
          });
        } else {
          // Wrong guess
          socket.emit('player:wrong', result);

          this.io.to(`game:${gameId}`).emit('status:update', {
            userId,
            status: result.isRoundOver ? 'WRONG' : 'THINKING'
          });
        }

        // Broadcast updated rankings
        const updatedState = await gameService.getGameState(gameId, userId);
        this.io.to(`game:${gameId}`).emit('ranking:update', {
          leaderboard: updatedState.leaderboard
        });

        // Check if all players finished round in multiplayer
        if (updatedState.mode === 'MULTIPLAYER') {
          const allDone = updatedState.leaderboard.every(p => p.status !== 'THINKING');
          if (allDone) {
            this.io.to(`game:${gameId}`).emit('game:round:finish', {
              roundNumber: updatedState.currentRound
            });
          }
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Player skips round
    socket.on('player:skip', async ({ gameId, userId }) => {
      try {
        const result = await gameService.skipRound(gameId, userId);
        socket.emit('player:skip_success', result);

        this.io.to(`game:${gameId}`).emit('status:update', {
          userId,
          status: 'SKIPPED'
        });

        const updatedState = await gameService.getGameState(gameId, userId);
        this.io.to(`game:${gameId}`).emit('ranking:update', {
          leaderboard: updatedState.leaderboard
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Advance to next round
    socket.on('game:next', async ({ gameId, userId }) => {
      try {
        const state = await gameService.nextRound(gameId, userId);
        
        if (state.isFinished) {
          this.io.to(`game:${gameId}`).emit('game:finish', {
            leaderboard: state.leaderboard
          });
        } else {
          socket.emit('game:state', state);
          this.io.to(`game:${gameId}`).emit('game:round:start', {
            currentRound: state.currentRound
          });
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });
  }
}

export default GameSocket;
