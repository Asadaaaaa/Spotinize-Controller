import express from 'express';
import { gameController } from '../controllers/GameController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/demo-track', (req, res) => gameController.getDemoTrack(req, res));
router.get('/active', requireAuth, (req, res) => gameController.getActiveGame(req, res));
router.post('/solo/create', requireAuth, (req, res) => gameController.createSolo(req, res));
router.post('/multiplayer/create', requireAuth, (req, res) => gameController.createMultiplayer(req, res));
router.post('/multiplayer/join', requireAuth, (req, res) => gameController.joinMultiplayer(req, res));
router.post('/multiplayer/:gameId/start', requireAuth, (req, res) => gameController.startMultiplayer(req, res));
router.get('/:gameId', requireAuth, (req, res) => gameController.getGameState(req, res));
router.post('/:gameId/timer/start', requireAuth, (req, res) => gameController.startTimer(req, res));
router.post('/:gameId/reveal', requireAuth, (req, res) => gameController.revealNext(req, res));
router.post('/:gameId/guess', requireAuth, (req, res) => gameController.submitGuess(req, res));
router.post('/:gameId/skip', requireAuth, (req, res) => gameController.skipRound(req, res));
router.post('/:gameId/next', requireAuth, (req, res) => gameController.nextRound(req, res));
router.post('/:gameId/leave', requireAuth, (req, res) => gameController.leaveGame(req, res));
router.post('/:gameId/ready', requireAuth, (req, res) => gameController.toggleReady(req, res));
router.post('/:gameId/team', requireAuth, (req, res) => gameController.switchTeam(req, res));

export default router;
