import { gachaService } from '../services/GachaService.js';

export class GachaController {
  async getInfo(req, res) {
    try {
      const info = await gachaService.getGachaInfo(req.user?.id || null);
      return res.json(info);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async pull(req, res) {
    try {
      const { count = 1, useTicket = false, crateId = 'crate_groove' } = req.body;
      const result = await gachaService.pull(req.user.id, { count, useTicket: Boolean(useTicket), crateId });
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}

export const gachaController = new GachaController();
export default gachaController;
