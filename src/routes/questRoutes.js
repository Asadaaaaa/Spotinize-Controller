import express from 'express';
import { questController } from '../controllers/QuestController.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', optionalAuth, (req, res) => questController.list(req, res));
router.post('/:questId/claim', requireAuth, (req, res) => questController.claim(req, res));

export default router;
