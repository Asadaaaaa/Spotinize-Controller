import { gameRepository } from '../repositories/GameRepository.js';
import { reconnectService } from './ReconnectService.js';
import { gameService } from './GameService.js';

const ALLOWED_MP_SUBTYPES = new Set(['CLASSIC', 'SURVIVAL', 'ELIMINATION', 'SPEED_BUZZ', 'SQUAD_2V2']);

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

  async createRoom(hostId, { category = 'Global Trends', artistQuery = null, numberOfSongs = 5, gameSubtype = 'CLASSIC' }) {
    const cleanSubtype = ALLOWED_MP_SUBTYPES.has(String(gameSubtype || '').toUpperCase())
      ? String(gameSubtype).toUpperCase()
      : 'CLASSIC';

    let roomCode = this.generateRoomCode();
    let existing = await gameRepository.findByRoomCode(roomCode);
    while (existing) {
      roomCode = this.generateRoomCode();
      existing = await gameRepository.findByRoomCode(roomCode);
    }

    const game = await gameRepository.create({
      roomCode,
      mode: 'MULTIPLAYER',
      gameSubtype: cleanSubtype,
      category,
      artistQuery,
      numberOfSongs,
      status: 'WAITING',
      hostId
    });

    const hostPlayer = await gameRepository.addPlayer(game.id, hostId, true);
    if (cleanSubtype === 'SQUAD_2V2' && hostPlayer) {
      await hostPlayer.update({ teamId: 'A' });
    }

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

    const existingPlayer = game.players?.find(p => p.userId === userId);
    if (existingPlayer) {
      if (existingPlayer.status === 'LEFT') {
        throw new Error('Kamu sudah keluar dari game ini.');
      }
      return game;
    }

    if (game.status !== 'WAITING') {
      throw new Error('Game sudah dimulai! Tidak dapat bergabung.');
    }

    const maxPlayers = game.maxPlayers || 8;
    if ((game.players?.length || 0) >= maxPlayers) {
      throw new Error(`Room sudah penuh (maksimal ${maxPlayers} pemain).`);
    }

    const newPlayer = await gameRepository.addPlayer(game.id, userId, false);
    if (game.gameSubtype === 'SQUAD_2V2' && newPlayer) {
      const teamACount = (game.players || []).filter(p => p.teamId === 'A').length;
      const teamBCount = (game.players || []).filter(p => p.teamId === 'B').length;
      await newPlayer.update({ teamId: teamBCount < teamACount ? 'B' : 'A' });
    }

    return await gameRepository.findById(game.id);
  }

  async switchTeam(gameId, userId, teamId) {
    const game = await gameRepository.findById(gameId);
    if (!game) throw new Error('Game tidak ditemukan');
    if (game.status !== 'WAITING') throw new Error('Tim hanya bisa diganti saat di Lobby');
    if (game.gameSubtype !== 'SQUAD_2V2') throw new Error('Mode ini tidak menggunakan tim');

    const cleanTeam = String(teamId || '').toUpperCase();
    if (!['A', 'B'].includes(cleanTeam)) {
      throw new Error('Tim tidak valid (pilih A atau B)');
    }

    const updated = await gameRepository.updatePlayer(gameId, userId, { teamId: cleanTeam });
    if (!updated) throw new Error('Player tidak ditemukan');
    return updated;
  }

  async toggleReady(gameId, userId) {
    const game = await gameRepository.findById(gameId);
    if (!game) throw new Error('Game tidak ditemukan');
    if (game.status !== 'WAITING') {
      throw new Error('Game sudah dimulai atau selesai');
    }

    const player = await gameRepository.getPlayer(gameId, userId);
    if (!player) throw new Error('Player tidak ditemukan');
    if (player.isHost) {
      throw new Error('Host otomatis siap untuk memulai game');
    }

    return await gameRepository.updatePlayer(gameId, userId, {
      isReady: !player.isReady
    });
  }

  async leaveRoom(gameId, userId) {
    const player = await gameRepository.getPlayer(gameId, userId);
    const game = await gameRepository.findById(gameId);
    if (!player || !game) {
      return { game: game || null, previousStatus: game?.status || null, newHostId: null };
    }

    reconnectService.clearPlayerTimer(gameId, userId);
    const previousStatus = game.status;

    if (previousStatus === 'FINISHED' || previousStatus === 'ABANDONED') {
      return { game, previousStatus, newHostId: null };
    }

    if (previousStatus === 'WAITING') {
      await player.destroy();
      const remainingPlayers = await gameRepository.getPlayersByGame(gameId, 'WAITING');
      let newHostId = game.hostId;

      if (remainingPlayers.length === 0) {
        await gameRepository.update(gameId, { status: 'ABANDONED', finishedAt: new Date() });
        newHostId = null;
      } else if (player.isHost) {
        newHostId = remainingPlayers[0].userId;
        await gameRepository.updatePlayer(gameId, newHostId, { isHost: true, isReady: false });
        await gameRepository.update(gameId, { hostId: newHostId });
      }

      return {
        game: await gameRepository.findById(gameId),
        previousStatus,
        newHostId
      };
    }

    await gameRepository.updatePlayer(gameId, userId, {
      status: 'LEFT',
      connectionStatus: 'DISCONNECTED'
    });

    if (previousStatus === 'PLAYING') {
      await gameService.checkAndFinishMultiplayerGame(gameId);
    }

    return {
      game: await gameRepository.findById(gameId),
      previousStatus,
      newHostId: null
    };
  }
}

export const matchmakingService = new MatchmakingService();
export default matchmakingService;
