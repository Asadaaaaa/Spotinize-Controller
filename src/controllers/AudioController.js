import fs from 'fs';
import { audioService } from '../services/AudioService.js';
import { trackRepository } from '../repositories/TrackRepository.js';

export class AudioController {
  async getClueAudio(req, res) {
    try {
      const { trackId } = req.params;
      const duration = parseFloat(req.query.duration || 0.1);

      const track = await trackRepository.findById(trackId);
      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      const filePath = await audioService.getClueAudio(
        track.id,
        track.title,
        track.artist,
        duration,
        track.previewUrl
      );

      if (!fs.existsSync(filePath)) {
        return res.status(500).json({ error: 'Could not generate audio clue' });
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Accept-Ranges', 'bytes');

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': chunksize,
          'Content-Type': 'audio/mpeg'
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'audio/mpeg'
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (err) {
      console.error('[AudioController] Error serving clue audio:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  async getAudioStatus(req, res) {
    try {
      const { trackId } = req.params;
      const duration = parseFloat(req.query.duration || 0.1);

      const track = await trackRepository.findById(trackId);
      if (!track) {
        return res.status(404).json({ ready: false, error: 'Track not found' });
      }

      const isReady = audioService.isClueCached(track.id, track.title, track.artist, duration);
      return res.json({ ready: isReady });
    } catch (err) {
      return res.status(500).json({ ready: false, error: err.message });
    }
  }
}

export const audioController = new AudioController();
export default audioController;
