import { dailyLoginService } from '../services/DailyLoginService.js';

export class DailyLoginController {
  async getStatus(req, res) {
    try {
      const status = await dailyLoginService.getStatus(req.user?.id || null);
      return res.json(status);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async claim(req, res) {
    try {
      const result = await dailyLoginService.claimToday(req.user.id);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}

export const dailyLoginController = new DailyLoginController();
export default dailyLoginController;
