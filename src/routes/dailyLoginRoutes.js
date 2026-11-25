import express from 'express';
import { dailyLoginController } from '../controllers/DailyLoginController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/status', requireAuth, (req, res) => dailyLoginController.getStatus(req, res));
router.post('/claim', requireAuth, (req, res) => dailyLoginController.claim(req, res));

export default router;
