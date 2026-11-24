import express from 'express';
import { savedTrackController } from '../controllers/SavedTrackController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', requireAuth, (req, res) => savedTrackController.getSavedTracks(req, res));
router.post('/toggle', requireAuth, (req, res) => savedTrackController.toggleSavedTrack(req, res));

export default router;
