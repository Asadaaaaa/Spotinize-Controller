import { Op } from 'sequelize';
import { Game, GamePlayer, GameRound, Track, User, Guess } from '../models/index.js';

export class GameRepository {
  async create(gameData) {
    return await Game.create(gameData);
  }

  async findById(id) {
    return await Game.findByPk(id, {
      include: [
        {
          model: GamePlayer,
          as: 'players',
          include: [{ model: User, as: 'user', attributes: ['id', 'spotifyId', 'username', 'displayName', 'avatarUrl', 'level', 'equippedFrameId', 'equippedTitleId'] }]
        },
        {
          model: GameRound,
          as: 'rounds',
          include: [{ model: Track, as: 'track' }]
        },
        {
          model: User,
          as: 'host',
          attributes: ['id', 'spotifyId', 'username', 'displayName', 'avatarUrl', 'level', 'equippedFrameId', 'equippedTitleId']
        }
      ],
      order: [[{ model: GameRound, as: 'rounds' }, 'roundNumber', 'ASC']]
    });
  }

  async findByRoomCode(roomCode) {
    return await Game.findOne({
      where: { roomCode },
      include: [
        {
          model: GamePlayer,
          as: 'players',
          include: [{ model: User, as: 'user', attributes: ['id', 'spotifyId', 'username', 'displayName', 'avatarUrl', 'level', 'equippedFrameId', 'equippedTitleId'] }]
        },
        {
          model: GameRound,
          as: 'rounds',
          include: [{ model: Track, as: 'track' }]
        },
        {
          model: User,
          as: 'host',
          attributes: ['id', 'spotifyId', 'username', 'displayName', 'avatarUrl', 'level', 'equippedFrameId', 'equippedTitleId']
        }
      ],
      order: [[{ model: GameRound, as: 'rounds' }, 'roundNumber', 'ASC']]
    });
  }

  async update(id, updateData) {
    const game = await Game.findByPk(id);
    if (!game) return null;
    return await game.update(updateData);
  }

  // Player operations
  async addPlayer(gameId, userId, isHost = false) {
    return await GamePlayer.create({
      gameId,
      userId,
      isHost,
      score: 0,
      currentRound: 1,
      currentRevealLevel: 0.1,
      remainingAttempts: 3,
      totalThinkingTime: 0.0,
      roundThinkingTime: 0.0,
      status: 'THINKING',
      connectionStatus: 'CONNECTED'
    });
  }

  async getPlayer(gameId, userId) {
    return await GamePlayer.findOne({
      where: { gameId, userId },
      include: [{ model: User, as: 'user', attributes: ['id', 'spotifyId', 'username', 'displayName', 'avatarUrl', 'level', 'equippedFrameId', 'equippedTitleId'] }]
    });
  }

  async updatePlayer(gameId, userId, updateData) {
    const player = await GamePlayer.findOne({ where: { gameId, userId } });
    if (!player) return null;
    return await player.update(updateData);
  }

  async getPlayersByGame(gameId, gameStatus = null) {
    const order = gameStatus === 'WAITING'
      ? [['isHost', 'DESC'], ['createdAt', 'ASC']]
      : [['score', 'DESC'], ['totalThinkingTime', 'ASC'], ['isHost', 'DESC'], ['createdAt', 'ASC']];

    return await GamePlayer.findAll({
      where: { gameId },
      include: [{ model: User, as: 'user', attributes: ['id', 'spotifyId', 'username', 'displayName', 'avatarUrl', 'level', 'equippedFrameId', 'equippedTitleId'] }],
      order
    });
  }

  async findActiveGameForUser(userId) {
    if (!userId) return null;
    const record = await GamePlayer.findOne({
      where: {
        userId,
        status: { [Op.ne]: 'LEFT' }
      },
      include: [
        {
          model: Game,
          as: 'game',
          where: {
            status: { [Op.in]: ['WAITING', 'STARTING', 'PLAYING'] }
          },
          required: true
        }
      ],
      order: [['updatedAt', 'DESC']]
    });
    return record?.game || null;
  }

  // Round operations
  async createRound(gameId, roundNumber, trackId) {
    return await GameRound.create({
      gameId,
      roundNumber,
      trackId,
      status: 'PENDING'
    });
  }

  async getRound(gameId, roundNumber) {
    return await GameRound.findOne({
      where: { gameId, roundNumber },
      include: [{ model: Track, as: 'track' }]
    });
  }

  async updateRound(roundId, updateData) {
    const round = await GameRound.findByPk(roundId);
    if (!round) return null;
    return await round.update(updateData);
  }

  // Guess operations
  async recordGuess(guessData) {
    return await Guess.create(guessData);
  }

  async getGuessesForRound(roundId, userId = null) {
    const where = { roundId };
    if (userId) where.userId = userId;
    return await Guess.findAll({ where, order: [['attemptNumber', 'ASC']] });
  }
}

export const gameRepository = new GameRepository();
export default gameRepository;
