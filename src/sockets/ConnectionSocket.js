import { reconnectService } from '../services/ReconnectService.js';
import { gameService } from '../services/GameService.js';
import { matchmakingService } from '../services/MatchmakingService.js';
import { gameRepository } from '../repositories/GameRepository.js';
import { broadcastLobbyUpdate, broadcastLeaveOutcome } from './socketBroadcaster.js';

export class ConnectionSocket {
  constructor(io) {
    this.io = io;
  }

  registerEvents(socket) {
    // User registers personal socket channel for notifications & invites
    socket.on('user:init', () => {
      if (socket.authenticated && socket.userId) {
        socket.join(`user:${socket.userId}`);
      }
    });

    // Reconnect intent
    socket.on('player:reconnect', async ({ gameId } = {}) => {
      try {
        if (!socket.authenticated || !socket.userId || !gameId) return;
        const userId = socket.userId;

        socket.join(`game:${gameId}`);
        socket.gameId = gameId;

        await reconnectService.handleReconnect(gameId, userId);
        const state = await gameService.getGameState(gameId, userId);

        socket.emit('player:reconnected', state);

        this.io.to(`game:${gameId}`).emit('player:status_change', {
          userId,
          connectionStatus: 'CONNECTED'
        });

        if (state?.status === 'WAITING') {
          await broadcastLobbyUpdate(this.io, gameId);
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Socket disconnection
    socket.on('disconnect', async () => {
      const { gameId, userId } = socket;
      if (!gameId || !userId) return;

      try {
        // If user still has another active socket in this room (e.g. fast browser refresh), skip disconnect
        const roomSet = this.io.sockets?.adapter?.rooms?.get(`game:${gameId}`);
        if (roomSet) {
          for (const sid of roomSet) {
            if (sid === socket.id) continue;
            const otherSocket = this.io.sockets.sockets.get(sid);
            if (otherSocket && otherSocket.userId === userId) {
              return;
            }
          }
        }

        const game = await gameRepository.findById(gameId);
        if (!game || game.mode !== 'MULTIPLAYER' || game.status === 'FINISHED' || game.status === 'ABANDONED') {
          return;
        }

        const player = await gameRepository.getPlayer(gameId, userId);
        if (!player || player.status === 'LEFT') {
          return;
        }

        console.log(`🔌 User ${userId} disconnected from ${game.status} game ${gameId}`);

        if (game.status === 'WAITING') {
          await reconnectService.handleDisconnect(gameId, userId, async (gId, uId) => {
            const freshGame = await gameRepository.findById(gId);
            if (!freshGame || freshGame.status !== 'WAITING') return;
            await matchmakingService.leaveRoom(gId, uId);
            await broadcastLeaveOutcome(this.io, gId, uId, 'WAITING', 'Lobby disconnect timeout');
          }, 20 * 1000);

          this.io.to(`game:${gameId}`).emit('player:status_change', {
            userId,
            connectionStatus: 'DISCONNECTED'
          });
          await broadcastLobbyUpdate(this.io, gameId);
          return;
        }

        if (game.status === 'PLAYING') {
          await reconnectService.handleDisconnect(gameId, userId, async (gId, uId) => {
            const freshGame = await gameRepository.findById(gId);
            if (!freshGame || freshGame.status !== 'PLAYING') return;

            await reconnectService.expireGracePeriod(gId, uId);
            await gameService.checkAndFinishMultiplayerGame(gId);
            await broadcastLeaveOutcome(this.io, gId, uId, 'PLAYING', 'Grace period expired');
          }, 5 * 60 * 1000);

          this.io.to(`game:${gameId}`).emit('player:status_change', {
            userId,
            connectionStatus: 'DISCONNECTED'
          });
        }
      } catch (err) {
        console.warn('[ConnectionSocket] disconnect handler notice:', err.message);
      }
    });
  }
}

export default ConnectionSocket;
