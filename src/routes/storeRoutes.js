import express from 'express';
import { storeController } from '../controllers/StoreController.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/catalog', optionalAuth, (req, res) => storeController.getCatalog(req, res));
router.post('/buy', requireAuth, (req, res) => storeController.buyItem(req, res));
router.post('/buy-freeze', requireAuth, (req, res) => storeController.buyStreakFreeze(req, res));
router.post('/buy-ticket', requireAuth, (req, res) => storeController.buyGachaTicket(req, res));
router.get('/inventory', requireAuth, (req, res) => storeController.getInventory(req, res));
router.post('/equip', requireAuth, (req, res) => storeController.equipItem(req, res));
router.post('/unequip', requireAuth, (req, res) => storeController.unequipSlot(req, res));

export default router;
