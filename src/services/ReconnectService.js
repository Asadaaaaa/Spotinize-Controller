import { gameRepository } from '../repositories/GameRepository.js';
import { Timer } from '../utils/Timer.js';

export class ReconnectService {
  constructor() {
    this.graceTimers = new Map(); // key: `${gameId}:${userId}` -> setTimeout
  }

  /**
   * Handles player disconnection.
   */
  async handleDisconnect(gameId, userId, onExpiredCallback = null) {
    const key = `${gameId}:${userId}`;
    if (this.graceTimers.has(key)) {
      clearTimeout(this.graceTimers.get(key));
    }

    await gameRepository.updatePlayer(gameId, userId, {
      connectionStatus: 'DISCONNECTED',
      disconnectedAt: new Date()
    });

    // 5 minutes grace period (300,000 ms)
    const timer = setTimeout(async () => {
      console.log(`⏱️ Grace period expired for user ${userId} in game ${gameId}`);
      this.graceTimers.delete(key);
      await this.expireGracePeriod(gameId, userId);
      if (onExpiredCallback) {
        onExpiredCallback(gameId, userId);
      }
    }, 5 * 60 * 1000);

    this.graceTimers.set(key, timer);
  }

  /**
   * Handles player reconnection.
   */
  async handleReconnect(gameId, userId) {
    const key = `${gameId}:${userId}`;
    if (this.graceTimers.has(key)) {
      clearTimeout(this.graceTimers.get(key));
      this.graceTimers.delete(key);
    }

    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) return null;

    let updatedThinkingTime = player.totalThinkingTime;

    if (player.disconnectedAt) {
      const disconnectDuration = Timer.getElapsedSeconds(player.disconnectedAt, Date.now());
      // Max additional 10s thinking time cap per spec
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
   * Sets player to LEFT when 5-min grace period expires.
   */
  async expireGracePeriod(gameId, userId) {
    const player = await gameRepository.getPlayer(gameId, userId);
    if (player && player.status !== 'LEFT') {
      await gameRepository.updatePlayer(gameId, userId, {
        status: 'LEFT',
        connectionStatus: 'DISCONNECTED'
      });
    }
  }
}

export const reconnectService = new ReconnectService();
export default reconnectService;
