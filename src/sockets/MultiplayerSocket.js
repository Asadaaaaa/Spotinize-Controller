import { matchmakingService } from '../services/MatchmakingService.js';
import { gameService } from '../services/GameService.js';
import { gameRepository } from '../repositories/GameRepository.js';

export class MultiplayerSocket {
  constructor(io) {
    this.io = io;
  }

  registerEvents(socket) {
    // Join room channel
    socket.on('game:join_room', async ({ gameId, userId }) => {
      try {
        socket.join(`game:${gameId}`);
        socket.userId = userId;
        socket.gameId = gameId;

        const players = await gameRepository.getPlayersByGame(gameId);
        const playerList = players.map(p => ({
          userId: p.userId,
          displayName: p.user?.displayName || 'Player',
          avatarUrl: p.user?.avatarUrl || null,
          isReady: !!p.isReady,
          isHost: !!p.isHost
        }));

        this.io.to(`game:${gameId}`).emit('lobby:update', {
          players: playerList
        });
        this.io.to(`game:${gameId}`).emit('game:player_joined', {
          players: playerList
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Player toggles ready status
    socket.on('player:ready', async ({ gameId, userId }) => {
      try {
        await matchmakingService.toggleReady(gameId, userId);
        const players = await gameRepository.getPlayersByGame(gameId);
        
        const playerList = players.map(p => ({
          userId: p.userId,
          displayName: p.user?.displayName || 'Player',
          avatarUrl: p.user?.avatarUrl || null,
          isReady: !!p.isReady,
          isHost: !!p.isHost
        }));

        this.io.to(`game:${gameId}`).emit('lobby:update', {
          players: playerList
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Host starts multiplayer game
    socket.on('game:start', async ({ gameId, hostId }) => {
      try {
        await gameService.startMultiplayerGame(gameId, hostId);
        this.io.to(`game:${gameId}`).emit('game:started', {
          gameId,
          status: 'PLAYING',
          currentRound: 1
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Player voluntarily leaves
    socket.on('game:leave', async ({ gameId, userId }) => {
      try {
        await matchmakingService.leaveRoom(gameId, userId);
        socket.leave(`game:${gameId}`);

        this.io.to(`game:${gameId}`).emit('player:left', { userId });

        const updatedState = await gameService.getGameState(gameId, userId);
        if (updatedState) {
          this.io.to(`game:${gameId}`).emit('ranking:update', {
            leaderboard: updatedState.leaderboard
          });

          // Check if only 1 player remains -> auto winner!
          const activePlayers = updatedState.leaderboard.filter(p => p.status !== 'LEFT');
          if (activePlayers.length === 1) {
            await gameService.finishMultiplayerGame(gameId);
            this.io.to(`game:${gameId}`).emit('game:finish', {
              leaderboard: updatedState.leaderboard,
              winner: activePlayers[0]
            });
          }
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Direct realtime room invitation
    socket.on('invite:send', async ({ targetUserId, roomCode, gameId, hostId, hostName, hostAvatar, category }) => {
      try {
        if (!targetUserId || !roomCode) return;
        this.io.to(`user:${targetUserId}`).emit('invite:received', {
          roomCode,
          gameId,
          hostId,
          hostName,
          hostAvatar,
          category: category || 'Global Trends',
          timestamp: new Date()
        });
      } catch (err) {
        console.warn('Socket invite:send notice:', err.message);
      }
    });
  }
}

export default MultiplayerSocket;
