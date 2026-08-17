import express from 'express';
import { profileController } from '../controllers/ProfileController.js';

const router = express.Router();

router.get('/leaderboard', (req, res) => profileController.getLeaderboard(req, res));
router.get('/by-username/:username', (req, res) => profileController.getProfileByUsername(req, res));
router.get('/username/:username', (req, res) => profileController.getProfileByUsername(req, res));
router.get('/:id', (req, res) => profileController.getProfile(req, res));
router.get('/:id/histories', (req, res) => profileController.getHistories(req, res));
router.get('/:id/spotify-recently-played', (req, res) => profileController.getSpotifyRecentlyPlayed(req, res));
router.post('/:id/update', (req, res) => profileController.updateProfile(req, res));
router.post('/:id/upload-avatar', (req, res) => profileController.uploadAvatar(req, res));

export default router;
