import express from 'express';
import { rankedController } from '../controllers/RankedController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/summary', requireAuth, (req, res) => rankedController.getSummary(req, res));
router.post('/solo/start', requireAuth, (req, res) => rankedController.startSolo(req, res));
router.post('/duel/create', requireAuth, (req, res) => rankedController.createDuel(req, res));
router.post('/duel/:duelId/accept', requireAuth, (req, res) => rankedController.acceptDuel(req, res));

export default router;
