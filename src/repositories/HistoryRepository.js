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
      return {
        totalGames: 0,
        totalScore: 0,
        bestScore: 0,
        avgScore: 0,
        totalSongsGuessed: 0,
        totalSongsPlayed: 0,
        guessRate: 0,
        winRate: 0
      };
    }

    const totalScore = histories.reduce((sum, h) => sum + (h.score || 0), 0);
    const bestScore = Math.max(...histories.map(h => h.score || 0));
    const totalSongsGuessed = histories.reduce((sum, h) => sum + (h.correctCount || 0), 0);
    const totalSongsPlayed = histories.reduce((sum, h) => {
      const recordedRounds = (h.correctCount || 0) + (h.wrongCount || 0) + (h.skippedCount || 0);
      const songsInGame = h.status === 'LEFT' ? recordedRounds : Math.max(recordedRounds, h.totalRounds || 0);
      return sum + songsInGame;
    }, 0);
    const guessRate = totalSongsPlayed > 0
      ? Math.min(100, Math.round((totalSongsGuessed / totalSongsPlayed) * 100))
      : 0;

    return {
      totalGames,
      totalScore,
      bestScore,
      avgScore: Math.round(totalScore / totalGames),
      totalSongsGuessed,
      totalSongsPlayed,
      guessRate,
      winRate: guessRate
    };
  }
}

export const historyRepository = new HistoryRepository();
export default historyRepository;
