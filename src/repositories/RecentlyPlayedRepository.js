import { RecentlyPlayed } from '../models/index.js';
import { Op } from 'sequelize';

export class RecentlyPlayedRepository {
  async recordPlayed(userId, trackId, trackTitle, artistName, gameMode, category) {
    return await RecentlyPlayed.create({
      userId,
      trackId,
      trackTitle,
      artistName,
      gameMode,
      category,
      playedAt: new Date()
    });
  }

  async bulkRecord(records) {
    if (!records || records.length === 0) return [];
    return await RecentlyPlayed.bulkCreate(records);
  }

  async getRecentPlayedList(userId, category, cooldownHours = 48) {
    const sinceDate = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const where = {
      userId,
      playedAt: {
        [Op.gte]: sinceDate
      }
    };
    if (category) {
      where.category = category;
    }

    const recent = await RecentlyPlayed.findAll({
      where,
      attributes: ['trackId', 'trackTitle', 'artistName', 'playedAt'],
      order: [['playedAt', 'DESC']]
    });

    return recent;
  }
}

export const recentlyPlayedRepository = new RecentlyPlayedRepository();
export default recentlyPlayedRepository;
