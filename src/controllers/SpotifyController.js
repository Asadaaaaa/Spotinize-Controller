import { spotifyService } from '../services/SpotifyService.js';

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
}

export const spotifyController = new SpotifyController();
export default spotifyController;
