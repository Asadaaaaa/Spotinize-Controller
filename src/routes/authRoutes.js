import express from 'express';
import { authController } from '../controllers/AuthController.js';

const router = express.Router();

router.post('/register', (req, res) => authController.register(req, res));
router.post('/login', (req, res) => authController.login(req, res));
router.post('/guest', (req, res) => authController.guestLogin(req, res));
router.get('/spotify/connect', (req, res) => authController.getSpotifyConnectUrl(req, res));
router.get('/spotify/login', (req, res) => authController.getSpotifyConnectUrl(req, res));
router.post('/spotify/callback', (req, res) => authController.handleSpotifyCallback(req, res));
router.post('/spotify/disconnect', (req, res) => authController.disconnectSpotify(req, res));
router.get('/me', (req, res) => authController.getMe(req, res));

export default router;
