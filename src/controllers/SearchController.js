import { followRepository } from '../repositories/FollowRepository.js';
import { spotifyService } from '../services/SpotifyService.js';
import { feedService } from '../services/FeedService.js';

export class SearchController {
  async unifiedSearch(req, res) {
    try {
      const q = (req.query.q || '').trim();
      const type = (req.query.type || 'all').toLowerCase();
      const viewerId = req.user?.id || null;
      const io = req.app?.get('io');

      if (!q) {
        return res.json({ users: [], tracks: [], posts: [] });
      }

      const [users, tracks, posts] = await Promise.all([
        (type === 'all' || type === 'users')
          ? followRepository.searchUsers(q, viewerId, io, 15)
          : Promise.resolve([]),
        (type === 'all' || type === 'tracks')
          ? spotifyService.searchTracks(q, null, 12).catch(() => [])
          : Promise.resolve([]),
        (type === 'all' || type === 'posts')
          ? feedService.searchPosts(q, viewerId, 10).catch(() => [])
          : Promise.resolve([])
      ]);

      return res.json({
        users,
        tracks: tracks || [],
        posts: posts || []
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getTrending(req, res) {
    try {
      const viewerId = req.user?.id || null;
      const io = req.app?.get('io');

      const [globalRaw, indoRaw, suggestedUsers] = await Promise.all([
        spotifyService.getTopTracks('Global Trends').catch(() => []),
        spotifyService.getTopTracks('Indonesia Trends').catch(() => []),
        followRepository.getSuggestedUsers(viewerId, io, 8).catch(() => [])
      ]);

      const formatTrendTrack = (t, idx) => ({
        rank: idx + 1,
        id: t.id || null,
        spotifyId: t.spotifyId || t.id || null,
        title: t.title,
        artist: t.artist,
        albumArt: t.albumArt || t.coverUrl || null,
        previewUrl: t.previewUrl || null
      });

      return res.json({
        globalTrends: (globalRaw || []).slice(0, 5).map(formatTrendTrack),
        indonesiaTrends: (indoRaw || []).slice(0, 5).map(formatTrendTrack),
        suggestedUsers
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

export const searchController = new SearchController();
export default searchController;
