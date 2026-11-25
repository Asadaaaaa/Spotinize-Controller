import express from 'express';
import { dailyController } from '../controllers/DailyController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/status', requireAuth, (req, res) => dailyController.getStatus(req, res));
router.post('/play', requireAuth, (req, res) => dailyController.play(req, res));

export default router;
