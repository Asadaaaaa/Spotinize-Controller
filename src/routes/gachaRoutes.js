import express from 'express';
import { gachaController } from '../controllers/GachaController.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/info', optionalAuth, (req, res) => gachaController.getInfo(req, res));
router.post('/pull', requireAuth, (req, res) => gachaController.pull(req, res));

export default router;
