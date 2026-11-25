import express from 'express';
import { gachaController } from '../controllers/GachaController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/info', requireAuth, (req, res) => gachaController.getInfo(req, res));
router.post('/pull', requireAuth, (req, res) => gachaController.pull(req, res));

export default router;
