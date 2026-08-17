import { reconnectService } from '../services/ReconnectService.js';
import { gameService } from '../services/GameService.js';

export class ConnectionSocket {
  constructor(io) {
    this.io = io;
  }

  registerEvents(socket) {
    // User registers personal socket channel for notifications & invites
    socket.on('user:init', ({ userId }) => {
      if (userId) {
        socket.join(`user:${userId}`);
        socket.userId = userId;
      }
    });

    // Reconnect intent
    socket.on('player:reconnect', async ({ gameId, userId }) => {
      try {
        socket.join(`game:${gameId}`);
        socket.userId = userId;
        socket.gameId = gameId;

        const restoredPlayer = await reconnectService.handleReconnect(gameId, userId);
        const state = await gameService.getGameState(gameId, userId);

        socket.emit('player:reconnected', state);

        this.io.to(`game:${gameId}`).emit('player:status_change', {
          userId,
          connectionStatus: 'CONNECTED'
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Socket disconnection
    socket.on('disconnect', async () => {
      const { gameId, userId } = socket;
      if (!gameId || !userId) return;

      console.log(`🔌 User ${userId} disconnected from game ${gameId}`);

      await reconnectService.handleDisconnect(gameId, userId, async (gId, uId) => {
        // Callback when 5-min grace period expires
        this.io.to(`game:${gId}`).emit('player:left', {
          userId: uId,
          reason: 'Grace period expired'
        });

        const state = await gameService.getGameState(gId, uId);
        if (state) {
          this.io.to(`game:${gId}`).emit('ranking:update', {
            leaderboard: state.leaderboard
          });

          // Check single player remaining
          const activePlayers = state.leaderboard.filter(p => p.status !== 'LEFT');
          if (activePlayers.length === 1) {
            await gameService.finishMultiplayerGame(gId);
            this.io.to(`game:${gId}`).emit('game:finish', {
              leaderboard: state.leaderboard,
              winner: activePlayers[0]
            });
          }
        }
      });

      this.io.to(`game:${gameId}`).emit('player:status_change', {
        userId,
        connectionStatus: 'DISCONNECTED'
      });
    });
  }
}

export default ConnectionSocket;
