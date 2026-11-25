import { dailyChallengeService } from '../services/DailyChallengeService.js';
import { gameService } from '../services/GameService.js';

export class DailyController {
  async getStatus(req, res) {
    try {
      const status = await dailyChallengeService.getTodayStatus(req.user?.id || null);
      return res.json(status);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async play(req, res) {
    try {
      const result = await dailyChallengeService.startOrResumeDaily(req.user.id, gameService);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}

export const dailyController = new DailyController();
export default dailyController;
