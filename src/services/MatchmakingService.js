import { gameRepository } from '../repositories/GameRepository.js';
import { userRepository } from '../repositories/UserRepository.js';

export class MatchmakingService {
  /**
   * Generates a 6-character alphanumeric room code
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async createRoom(hostId, { category = 'Global Trends', artistQuery = null, numberOfSongs = 5 }) {
    let roomCode = this.generateRoomCode();
    // Check collision
    let existing = await gameRepository.findByRoomCode(roomCode);
    while (existing) {
      roomCode = this.generateRoomCode();
      existing = await gameRepository.findByRoomCode(roomCode);
    }

    const game = await gameRepository.create({
      roomCode,
      mode: 'MULTIPLAYER',
      category,
      artistQuery,
      numberOfSongs,
      status: 'WAITING',
      hostId
    });

    await gameRepository.addPlayer(game.id, hostId, true);
    return await gameRepository.findById(game.id);
  }

  async joinRoom(roomCode, userId) {
    const game = await gameRepository.findByRoomCode(roomCode.toUpperCase().trim());
    if (!game) {
      throw new Error('Room tidak ditemukan. Cek kembali kodenya!');
    }

    if (game.status === 'FINISHED' || game.status === 'ABANDONED') {
      throw new Error('Room game ini sudah selesai.');
    }

    // If player already in game, return it
    const existingPlayer = game.players?.find(p => p.userId === userId);
    if (existingPlayer) {
      return game;
    }

    if (game.status !== 'WAITING') {
      throw new Error('Game sudah dimulai! Kamu hanya bisa masuk sebagai penonton.');
    }

    await gameRepository.addPlayer(game.id, userId, false);
    return await gameRepository.findById(game.id);
  }

  async toggleReady(gameId, userId) {
    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) throw new Error('Player tidak ditemukan');

    const updated = await gameRepository.updatePlayer(gameId, userId, {
      isReady: !player.isReady
    });
    return updated;
  }

  async leaveRoom(gameId, userId) {
    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) return null;

    const game = await gameRepository.findById(gameId);
    if (!game) return null;

    if (game.status === 'WAITING') {
      await player.destroy();
      // If host left, assign new host or delete
      const remainingPlayers = await gameRepository.getPlayersByGame(gameId);
      if (remainingPlayers.length === 0) {
        await gameRepository.update(gameId, { status: 'ABANDONED' });
      } else if (player.isHost) {
        await gameRepository.updatePlayer(gameId, remainingPlayers[0].userId, { isHost: true });
        await gameRepository.update(gameId, { hostId: remainingPlayers[0].userId });
      }
    } else {
      await gameRepository.updatePlayer(gameId, userId, { status: 'LEFT' });
    }

    return await gameRepository.findById(gameId);
  }
}

export const matchmakingService = new MatchmakingService();
export default matchmakingService;
