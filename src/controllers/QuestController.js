import { questService } from '../services/QuestService.js';

export class QuestController {
  async list(req, res) {
    try {
      const data = await questService.ensureUserQuests(req.user?.id || null);
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async claim(req, res) {
    try {
      const { questId } = req.params;
      const result = await questService.claimQuest(req.user.id, questId);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}

export const questController = new QuestController();
export default questController;
