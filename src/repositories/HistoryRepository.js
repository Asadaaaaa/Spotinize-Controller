import { GameHistory } from '../models/index.js';

export class HistoryRepository {
  async create(historyData) {
    return await GameHistory.create(historyData);
  }

  async getByUser(userId, limit = 20) {
    return await GameHistory.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  async getSummary(userId) {
    const histories = await GameHistory.findAll({ where: { userId } });
    const totalGames = histories.length;
    if (totalGames === 0) {
      return { totalGames: 0, totalScore: 0, bestScore: 0, avgScore: 0, winCount: 0, winRate: 0 };
    }

    const totalScore = histories.reduce((sum, h) => sum + h.score, 0);
    const bestScore = Math.max(...histories.map(h => h.score));
    const winCount = histories.filter(h => h.status === 'WINNER' || h.rank === 1).length;

    return {
      totalGames,
      totalScore,
      bestScore,
      avgScore: Math.round(totalScore / totalGames),
      winCount,
      winRate: Math.round((winCount / totalGames) * 100)
    };
  }
}

export const historyRepository = new HistoryRepository();
export default historyRepository;
