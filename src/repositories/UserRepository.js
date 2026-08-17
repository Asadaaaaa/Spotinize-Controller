import { User } from '../models/index.js';
import { Op } from 'sequelize';

export class UserRepository {
  async findById(id) {
    return await User.findByPk(id);
  }

  async findByUsername(username) {
    if (!username) return null;
    return await User.findOne({
      where: {
        username: username.toLowerCase().trim()
      }
    });
  }

  async findBySpotifyId(spotifyId) {
    if (!spotifyId) return null;
    return await User.findOne({ where: { spotifyId } });
  }

  async create(userData) {
    const payload = {
      ...userData,
      username: userData.username.toLowerCase().trim()
    };
    return await User.create(payload);
  }

  async update(id, updateData) {
    const user = await this.findById(id);
    if (!user) return null;
    return await user.update(updateData);
  }

  async linkSpotify(id, spotifyProfile, tokens = {}) {
    const user = await this.findById(id);
    if (!user) return null;

    const updatePayload = {
      spotifyId: spotifyProfile.id,
      spotifyConnected: true,
      email: spotifyProfile.email || user.email,
      avatarUrl: spotifyProfile.images?.[0]?.url || user.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`,
      spotifyUrl: spotifyProfile.external_urls?.spotify || user.spotifyUrl,
      accessToken: tokens.accessToken || user.accessToken,
      refreshToken: tokens.refreshToken || user.refreshToken,
      tokenExpiresAt: tokens.expiresAt || user.tokenExpiresAt
    };

    return await user.update(updatePayload);
  }

  async updateStats(id, { score = 0, isWin = false, thinkingTime = 0, songsGuessed = 0, category = null }) {
    const user = await this.findById(id);
    if (!user) return null;

    const newGamesPlayed = (user.gamesPlayed || 0) + 1;
    const newTotalScore = (user.totalScore || 0) + score;
    const newBestScore = Math.max(user.bestScore || 0, score);
    const newAverageScore = Math.round(newTotalScore / newGamesPlayed);
    const currentWins = Math.round(((user.winRate || 0) / 100) * (user.gamesPlayed || 0)) + (isWin ? 1 : 0);
    const newWinRate = Math.round((currentWins / newGamesPlayed) * 100);
    const newTotalSongs = (user.totalSongsGuessed || 0) + songsGuessed;

    const updatePayload = {
      gamesPlayed: newGamesPlayed,
      totalScore: newTotalScore,
      bestScore: newBestScore,
      averageScore: newAverageScore,
      winRate: newWinRate,
      totalSongsGuessed: newTotalSongs
    };

    if (category) {
      updatePayload.favoriteCategory = category;
    }

    return await user.update(updatePayload);
  }

  async getLeaderboard(limit = 20) {
    return await User.findAll({
      where: {
        gamesPlayed: {
          [Op.gt]: 0
        }
      },
      order: [
        ['bestScore', 'DESC'],
        ['totalScore', 'DESC'],
        ['winRate', 'DESC'],
        ['gamesPlayed', 'DESC']
      ],
      limit,
      attributes: ['id', 'username', 'displayName', 'avatarUrl', 'bestScore', 'totalScore', 'gamesPlayed', 'winRate']
    });
  }
}

export const userRepository = new UserRepository();
export default userRepository;
