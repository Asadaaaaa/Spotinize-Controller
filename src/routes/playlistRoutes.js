import express from 'express';
import { playlistController } from '../controllers/PlaylistController.js';

const router = express.Router();

router.get('/me', (req, res) => playlistController.getUserPlaylists(req, res));

export default router;
