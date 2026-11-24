import { spotifyService } from '../services/SpotifyService.js';
import { trackDetailService } from '../services/TrackDetailService.js';

export class SpotifyController {
  async searchTracks(req, res) {
    try {
      const { q, limit } = req.query;
      const tracks = await spotifyService.searchTracks(q, null, limit || 5);
      return res.json({ tracks });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async searchArtists(req, res) {
    try {
      const { q, limit } = req.query;
      const artists = await spotifyService.searchArtists(q, null, limit || 6);
      return res.json({ artists });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getTrends(req, res) {
    try {
      const { category, artist } = req.query;
      const tracks = await spotifyService.getTopTracks(category || 'Global Trends', artist);
      return res.json({ tracks });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getTrackDetail(req, res) {
    try {
      const { id, spotifyId, title, artist, coverUrl, previewUrl } = req.query;
      const detail = await trackDetailService.getTrackDetail({
        id: id || null,
        spotifyId: spotifyId || null,
        title,
        artist,
        coverUrl: coverUrl || null,
        previewUrl: previewUrl || null
      });
      return res.json({ track: detail });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}

export const spotifyController = new SpotifyController();
export default spotifyController;
