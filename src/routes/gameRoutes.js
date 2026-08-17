import express from 'express';
import { gameController } from '../controllers/GameController.js';

const router = express.Router();

router.get('/demo-track', (req, res) => gameController.getDemoTrack(req, res));
router.post('/solo/create', (req, res) => gameController.createSolo(req, res));
router.post('/multiplayer/create', (req, res) => gameController.createMultiplayer(req, res));
router.post('/multiplayer/join', (req, res) => gameController.joinMultiplayer(req, res));
router.post('/multiplayer/:gameId/start', (req, res) => gameController.startMultiplayer(req, res));
router.get('/:gameId', (req, res) => gameController.getGameState(req, res));
router.post('/:gameId/timer/start', (req, res) => gameController.startTimer(req, res));
router.post('/:gameId/reveal', (req, res) => gameController.revealNext(req, res));
router.post('/:gameId/guess', (req, res) => gameController.submitGuess(req, res));
router.post('/:gameId/skip', (req, res) => gameController.skipRound(req, res));
router.post('/:gameId/next', (req, res) => gameController.nextRound(req, res));
router.post('/:gameId/leave', (req, res) => gameController.leaveGame(req, res));
router.post('/:gameId/ready', (req, res) => gameController.toggleReady(req, res));

export default router;
