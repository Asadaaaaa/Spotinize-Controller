import express from 'express';
import { audioController } from '../controllers/AudioController.js';

const router = express.Router();

router.get('/clue/:trackId', (req, res) => audioController.getClueAudio(req, res));
router.get('/status/:trackId', (req, res) => audioController.getAudioStatus(req, res));

export default router;
