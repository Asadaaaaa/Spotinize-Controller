import { SavedTrack } from '../models/index.js';
import { buildTrackKey } from '../services/FeedService.js';
import { imageCacheService } from '../services/ImageCacheService.js';
import { spotifyService } from '../services/SpotifyService.js';
import { trackRepository } from '../repositories/TrackRepository.js';

export class SavedTrackController {
  async getSavedTracks(req, res) {
    try {
      const userId = req.user.id;
      const tracks = await SavedTrack.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']]
      });
      return res.json({ tracks });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async toggleSavedTrack(req, res) {
    try {
      const userId = req.user.id;
      const { track, sourcePostId } = req.body;

      if (!track || !track.title) {
        return res.status(400).json({ error: 'Data lagu diperlukan' });
      }

      const title = String(track.title).trim();
      const artist = String(track.artist || 'Unknown Artist').trim();
      const spotifyId = track.spotifyId || track.id || null;
      const trackKey = buildTrackKey({ spotifyId, title, artist });

      const existing = await SavedTrack.findOne({
        where: { userId, trackKey }
      });

      if (existing) {
        await existing.destroy();
        return res.json({ isSaved: false, trackKey });
      }

      const rawCover = track.coverUrl || track.albumArt || track.cover || null;
      const cachedCover = await imageCacheService.resolveTrackArtwork(
        { spotifyId, title, artist, albumArt: rawCover },
        {
          allowRemoteFallback: true,
          searchFn: (q) => spotifyService.searchTracks(q, null, 5)
        }
      ).catch(() => rawCover);

      const upserted = await trackRepository.bulkUpsert([
        {
          spotifyId,
          title,
          artist,
          albumArt: cachedCover || rawCover,
          previewUrl: track.previewUrl || null
        }
      ]).catch(() => []);

      const dbTrack = upserted?.[0] || null;

      const created = await SavedTrack.create({
        userId,
        trackId: dbTrack?.id || track.trackId || null,
        title,
        artist,
        coverUrl: cachedCover || rawCover || dbTrack?.albumArt || null,
        previewUrl: track.previewUrl || dbTrack?.previewUrl || null,
        spotifyId: spotifyId || dbTrack?.spotifyId || null,
        trackKey,
        sourcePostId: sourcePostId || null
      });

      return res.json({ isSaved: true, trackKey, savedTrack: created });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

export const savedTrackController = new SavedTrackController();
export default savedTrackController;
