import { rankedService } from '../services/RankedService.js';
import { gameService } from '../services/GameService.js';

export class RankedController {
  async getSummary(req, res) {
    try {
      const [summary, pendingDuels] = await Promise.all([
        rankedService.getUserRankedSummary(req.user.id),
        rankedService.getPendingDuels(req.user.id)
      ]);
      return res.json({ summary, pendingDuels });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async startSolo(req, res) {
    try {
      const gameState = await rankedService.startSoloRanked(req.user.id, gameService);
      return res.json(gameState);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async createDuel(req, res) {
    try {
      const { opponentId } = req.body;
      const result = await rankedService.createAsyncDuel(req.user.id, opponentId, gameService);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async acceptDuel(req, res) {
    try {
      const { duelId } = req.params;
      const result = await rankedService.acceptAsyncDuel(duelId, req.user.id, gameService);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}

export const rankedController = new RankedController();
export default rankedController;
