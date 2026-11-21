import { Op } from 'sequelize';
import { Game, GamePlayer } from '../models/index.js';
import { gameRepository } from '../repositories/GameRepository.js';
import { Timer } from '../utils/Timer.js';

export class ReconnectService {
  constructor() {
    this.graceTimers = new Map(); // key: `${gameId}:${userId}` -> setTimeout
  }

  /**
   * Handles player disconnection with configurable grace period.
   */
  async handleDisconnect(gameId, userId, onExpiredCallback = null, graceMs = 5 * 60 * 1000) {
    const key = `${gameId}:${userId}`;
    if (this.graceTimers.has(key)) {
      clearTimeout(this.graceTimers.get(key));
    }

    await gameRepository.updatePlayer(gameId, userId, {
      connectionStatus: 'DISCONNECTED',
      disconnectedAt: new Date()
    });

    const timer = setTimeout(async () => {
      console.log(`⏱️ Grace period expired for user ${userId} in game ${gameId}`);
      this.graceTimers.delete(key);
      try {
        if (onExpiredCallback) {
          await onExpiredCallback(gameId, userId);
        } else {
          await this.expireGracePeriod(gameId, userId);
        }
      } catch (err) {
        console.error('[ReconnectService] Error in disconnect expiry handler:', err.message);
      }
    }, graceMs);

    this.graceTimers.set(key, timer);
  }

  /**
   * Clears any pending disconnect timer for a single player in a game.
   */
  clearPlayerTimer(gameId, userId) {
    const key = `${gameId}:${userId}`;
    if (this.graceTimers.has(key)) {
      clearTimeout(this.graceTimers.get(key));
      this.graceTimers.delete(key);
    }
  }

  /**
   * Clears all pending disconnect timers associated with a game.
   */
  clearGameTimers(gameId) {
    const prefix = `${gameId}:`;
    for (const [key, timer] of this.graceTimers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.graceTimers.delete(key);
      }
    }
  }

  /**
   * Handles player reconnection. Only penalizes thinking time when PLAYING & THINKING.
   */
  async handleReconnect(gameId, userId) {
    this.clearPlayerTimer(gameId, userId);

    const game = await gameRepository.findById(gameId);
    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) return null;

    let updatedThinkingTime = player.totalThinkingTime;

    if (game?.status === 'PLAYING' && player.status === 'THINKING' && player.disconnectedAt) {
      const disconnectDuration = Timer.getElapsedSeconds(player.disconnectedAt, Date.now());
      updatedThinkingTime = Timer.applyDisconnectCap(player.totalThinkingTime, disconnectDuration);
    }

    await gameRepository.updatePlayer(gameId, userId, {
      connectionStatus: 'CONNECTED',
      disconnectedAt: null,
      totalThinkingTime: updatedThinkingTime
    });

    return await gameRepository.getPlayer(gameId, userId);
  }

  /**
   * Sets player to LEFT when 5-min grace period expires during PLAYING match.
   */
  async expireGracePeriod(gameId, userId) {
    const game = await gameRepository.findById(gameId);
    if (!game || game.status !== 'PLAYING') return;

    const player = await gameRepository.getPlayer(gameId, userId);
    if (player && player.status !== 'LEFT') {
      await gameRepository.updatePlayer(gameId, userId, {
        status: 'LEFT',
        connectionStatus: 'DISCONNECTED'
      });
    }
  }

  /**
   * Cleans up abandoned lobbies, stuck STARTING rooms, and stale DISCONNECTED players on startup / interval.
   */
  async sweepStaleSessions(matchmakingService, gameService) {
    const now = Date.now();
    try {
      // 1. Abandon WAITING rooms inactive for > 1 hour
      const staleWaitingCutoff = new Date(now - 60 * 60 * 1000);
      await Game.update(
        { status: 'ABANDONED', finishedAt: new Date() },
        {
          where: {
            status: 'WAITING',
            updatedAt: { [Op.lt]: staleWaitingCutoff }
          }
        }
      );

      // 2. Abandon games stuck in STARTING for > 2 minutes
      const staleStartingCutoff = new Date(now - 2 * 60 * 1000);
      await Game.update(
        { status: 'ABANDONED', finishedAt: new Date() },
        {
          where: {
            status: 'STARTING',
            updatedAt: { [Op.lt]: staleStartingCutoff }
          }
        }
      );

      // 3. Sweep stale DISCONNECTED players in PLAYING games (> 5 min)
      const playingCutoff = new Date(now - 5 * 60 * 1000);
      const stalePlayingPlayers = await GamePlayer.findAll({
        where: {
          connectionStatus: 'DISCONNECTED',
          status: { [Op.ne]: 'LEFT' },
          disconnectedAt: { [Op.lt]: playingCutoff }
        },
        include: [{
          model: Game,
          as: 'game',
          where: { status: 'PLAYING', mode: 'MULTIPLAYER' },
          required: true
        }]
      });

      const affectedPlayingGames = new Set();
      for (const p of stalePlayingPlayers) {
        await gameRepository.updatePlayer(p.gameId, p.userId, {
          status: 'LEFT',
          connectionStatus: 'DISCONNECTED'
        });
        affectedPlayingGames.add(p.gameId);
      }
      for (const gId of affectedPlayingGames) {
        await gameService.checkAndFinishMultiplayerGame(gId);
      }

      // 4. Sweep stale DISCONNECTED players in WAITING lobbies (> 1 min)
      const waitingPlayerCutoff = new Date(now - 60 * 1000);
      const staleLobbyPlayers = await GamePlayer.findAll({
        where: {
          connectionStatus: 'DISCONNECTED',
          disconnectedAt: { [Op.lt]: waitingPlayerCutoff }
        },
        include: [{
          model: Game,
          as: 'game',
          where: { status: 'WAITING', mode: 'MULTIPLAYER' },
          required: true
        }]
      });

      for (const p of staleLobbyPlayers) {
        await matchmakingService.leaveRoom(p.gameId, p.userId);
      }
    } catch (err) {
      console.warn('[ReconnectService] Sweep stale sessions notice:', err.message);
    }
  }
}

export const reconnectService = new ReconnectService();
export default reconnectService;
