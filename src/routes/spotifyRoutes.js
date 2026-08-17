import express from 'express';
import { spotifyController } from '../controllers/SpotifyController.js';

const router = express.Router();

router.get('/search/tracks', (req, res) => spotifyController.searchTracks(req, res));
router.get('/search/artists', (req, res) => spotifyController.searchArtists(req, res));
router.get('/trends', (req, res) => spotifyController.getTrends(req, res));

export default router;
