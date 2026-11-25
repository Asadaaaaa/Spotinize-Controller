import express from 'express';
import { dailyController } from '../controllers/DailyController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/status', requireAuth, (req, res) => dailyController.getStatus(req, res));
router.post('/play', requireAuth, (req, res) => dailyController.play(req, res));

// Stateless Guest Daily Trial Routes (1x per browserId/guestToken, no DB user / no leaderboard)
router.get('/guest/status', (req, res) => dailyController.getGuestStatus(req, res));
router.post('/guest/play', (req, res) => dailyController.playGuest(req, res));
router.get('/guest/game/:gameId', (req, res) => dailyController.getGuestGameState(req, res));
router.post('/guest/game/:gameId/timer/start', (req, res) => dailyController.startGuestTimer(req, res));
router.post('/guest/game/:gameId/reveal', (req, res) => dailyController.revealGuestNext(req, res));
router.post('/guest/game/:gameId/guess', (req, res) => dailyController.submitGuestGuess(req, res));
router.post('/guest/game/:gameId/skip', (req, res) => dailyController.skipGuestRound(req, res));
router.post('/guest/game/:gameId/next', (req, res) => dailyController.nextGuestRound(req, res));

export default router;
