import { matchmakingService } from '../services/MatchmakingService.js';
import { gameService } from '../services/GameService.js';
import { gameRepository } from '../repositories/GameRepository.js';
import { reconnectService } from '../services/ReconnectService.js';
import { broadcastLobbyUpdate, broadcastLeaveOutcome } from './socketBroadcaster.js';

export class MultiplayerSocket {
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

    // Join room channel
    socket.on('game:join_room', async ({ gameId } = {}) => {
      try {
        if (!requireSocketAuth() || !gameId) return;
        const userId = socket.userId;

        if (socket.gameId && socket.gameId !== gameId) {
          socket.leave(`game:${socket.gameId}`);
        }

        socket.join(`game:${gameId}`);
        socket.gameId = gameId;

        const prePlayer = await gameRepository.getPlayer(gameId, userId);
        const wasDisconnected = prePlayer?.connectionStatus === 'DISCONNECTED';

        // Cancel any pending disconnect grace timer on rejoin/refresh
        const restored = await reconnectService.handleReconnect(gameId, userId);
        const game = await gameRepository.findById(gameId);

        if (game?.status === 'WAITING') {
          await broadcastLobbyUpdate(this.io, gameId);
        } else if (game?.status === 'PLAYING' && restored && wasDisconnected) {
          this.io.to(`game:${gameId}`).emit('player:status_change', {
            userId,
            connectionStatus: 'CONNECTED'
          });
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Leave room channel cleanly without mutating match membership
    socket.on('game:leave_room', ({ gameId } = {}) => {
      const targetId = gameId || socket.gameId;
      if (!targetId) return;
      socket.leave(`game:${targetId}`);
      if (socket.gameId === targetId) {
        socket.gameId = null;
      }
    });

    // Player toggles ready status
    socket.on('player:ready', async ({ gameId } = {}, ack) => {
      try {
        if (!requireSocketAuth() || !gameId) return;
        await matchmakingService.toggleReady(gameId, socket.userId);
        await broadcastLobbyUpdate(this.io, gameId);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
        socket.emit('error', { message: err.message });
      }
    });

    // Player switches team in 2v2 / Squad mode
    socket.on('player:switch_team', async ({ gameId, teamId } = {}, ack) => {
      try {
        if (!requireSocketAuth() || !gameId || !teamId) return;
        await matchmakingService.switchTeam(gameId, socket.userId, teamId);
        await broadcastLobbyUpdate(this.io, gameId);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
        socket.emit('error', { message: err.message });
      }
    });

    // Host starts multiplayer game (guarded by atomic STARTING lock)
    socket.on('game:start', async ({ gameId } = {}) => {
      try {
        if (!requireSocketAuth() || !gameId) return;
        const started = await gameService.startMultiplayerGame(gameId, socket.userId);
        this.io.to(`game:${gameId}`).emit('game:started', {
          gameId,
          status: 'PLAYING',
          gameSubtype: started?.gameSubtype || 'CLASSIC',
          currentRound: 1
        });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Player voluntarily leaves
    socket.on('game:leave', async ({ gameId } = {}) => {
      try {
        if (!requireSocketAuth() || !gameId) return;
        const userId = socket.userId;
        const outcome = await matchmakingService.leaveRoom(gameId, userId);
        socket.leave(`game:${gameId}`);
        if (socket.gameId === gameId) {
          socket.gameId = null;
        }
        await broadcastLeaveOutcome(this.io, gameId, userId, outcome.previousStatus);
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    // Direct realtime room invitation
    socket.on('invite:send', async ({ targetUserId, roomCode, gameId, hostName, hostAvatar, category } = {}) => {
      try {
        if (!requireSocketAuth() || !targetUserId || !roomCode) return;
        this.io.to(`user:${targetUserId}`).emit('invite:received', {
          roomCode,
          gameId,
          hostId: socket.userId,
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
