import { cosmeticService } from '../services/CosmeticService.js';
import { economyService, STREAK_FREEZE_PRICE, MAX_STREAK_FREEZES, GACHA_TICKET_PRICE } from '../services/EconomyService.js';
import { User } from '../models/index.js';

export class StoreController {
  async getCatalog(req, res) {
    try {
      const userId = req.user?.id || null;
      const [items, user] = await Promise.all([
        cosmeticService.getStoreCatalog(userId),
        userId
          ? User.findByPk(userId, {
              attributes: ['id', 'notesBalance', 'gachaTickets', 'streakFreezes', 'equippedFrameId', 'equippedVinylId', 'equippedTitleId']
            })
          : Promise.resolve(null)
      ]);

      return res.json({
        items,
        utilities: [
          {
            code: 'streak_freeze',
            name: 'Streak Freeze',
            description: `Melindungi Daily Streak secara otomatis jika absen 1 hari (maksimal simpan ${MAX_STREAK_FREEZES}).`,
            priceNotes: STREAK_FREEZE_PRICE,
            maxQuantity: MAX_STREAK_FREEZES,
            currentQuantity: user?.streakFreezes || 0
          },
          {
            code: 'gacha_ticket',
            name: 'Gacha Ticket',
            description: 'Tiket untuk 1x pull di Sound Crate Gacha.',
            priceNotes: GACHA_TICKET_PRICE,
            currentQuantity: user?.gachaTickets || 0
          }
        ],
        wallet: {
          notesBalance: user?.notesBalance || 0,
          gachaTickets: user?.gachaTickets || 0,
          streakFreezes: user?.streakFreezes || 0,
          equippedFrameId: user?.equippedFrameId || null,
          equippedVinylId: user?.equippedVinylId || null,
          equippedTitleId: user?.equippedTitleId || null
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async buyItem(req, res) {
    try {
      const userId = req.user.id;
      const { itemId } = req.body;
      if (!itemId) return res.status(400).json({ error: 'itemId diperlukan' });

      const result = await economyService.purchaseStoreItem(userId, itemId);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async buyStreakFreeze(req, res) {
    try {
      const result = await economyService.buyStreakFreeze(req.user.id);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async buyGachaTicket(req, res) {
    try {
      const { quantity = 1 } = req.body;
      const result = await economyService.buyGachaTicket(req.user.id, quantity);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async getInventory(req, res) {
    try {
      const items = await cosmeticService.getUserInventory(req.user.id);
      return res.json({ items });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async equipItem(req, res) {
    try {
      const { itemId } = req.body;
      if (!itemId) return res.status(400).json({ error: 'itemId diperlukan' });
      const item = await cosmeticService.equipItem(req.user.id, itemId);
      return res.json({ equipped: item });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async unequipSlot(req, res) {
    try {
      const { type } = req.body;
      await cosmeticService.unequipSlot(req.user.id, type);
      return res.json({ success: true });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}

export const storeController = new StoreController();
export default storeController;
