import express from 'express';
import { searchController } from '../controllers/SearchController.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', optionalAuth, (req, res) => searchController.unifiedSearch(req, res));
router.get('/trending', optionalAuth, (req, res) => searchController.getTrending(req, res));

export default router;
