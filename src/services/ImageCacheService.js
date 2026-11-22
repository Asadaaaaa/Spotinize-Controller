import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';
import { Track, SearchCache } from '../models/index.js';
import { Normalizer } from '../utils/Normalizer.js';
import { TrackMatcher } from '../utils/TrackMatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGE_CACHE_DIR = path.resolve(__dirname, '../../image_cache');

export class ImageCacheService {
  constructor() {
    if (!fs.existsSync(IMAGE_CACHE_DIR)) {
      fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
    }
  }

  getImagePath(filename) {
    return path.join(IMAGE_CACHE_DIR, filename);
  }

  /**
   * Checks whether a URL points to a valid image already cached on local disk.
   */
  isLocalCachedImage(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('/api/image/')) {
      return false;
    }
    const filename = path.basename(url.split('?')[0]);
    if (!filename) return false;
    const localPath = path.join(IMAGE_CACHE_DIR, filename);
    return fs.existsSync(localPath) && fs.statSync(localPath).size > 200;
  }

  /**
   * Caches a remote artwork image URL onto local disk and returns local serving path.
   */
  async cacheImage(remoteUrl) {
    if (!remoteUrl || typeof remoteUrl !== 'string') return null;
    if (this.isLocalCachedImage(remoteUrl)) return remoteUrl;
    if (remoteUrl.startsWith('/api/image/')) return null;

    try {
      const hash = crypto.createHash('md5').update(remoteUrl).digest('hex');
      const filename = `${hash}.jpg`;
      const localPath = path.join(IMAGE_CACHE_DIR, filename);
      const localUrl = `/api/image/${filename}`;

      // If already on disk, return local url immediately without hitting remote URL
      if (fs.existsSync(localPath) && fs.statSync(localPath).size > 200) {
        return localUrl;
      }

      const response = await axios.get(remoteUrl, {
        responseType: 'arraybuffer',
        timeout: 4500,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      if (response.status === 200 && response.data?.byteLength > 100) {
        fs.writeFileSync(localPath, Buffer.from(response.data));
        return localUrl;
      }
    } catch (err) {
      // Fall back gracefully if remote download fails
    }

    return remoteUrl;
  }

  /**
   * Looks up locally cacheable artwork from the MySQL `tracks` table before touching 3rd-party APIs.
   */
  async _findArtworkInTracksTable({ spotifyId, title, artist }) {
    try {
      if (spotifyId) {
        const bySpotifyId = await Track.findOne({ where: { spotifyId } });
        if (bySpotifyId?.albumArt) {
          const cached = await this.cacheImage(bySpotifyId.albumArt);
          if (this.isLocalCachedImage(cached)) {
            if (cached !== bySpotifyId.albumArt) {
              await bySpotifyId.update({ albumArt: cached }).catch(() => {});
            }
            return cached;
          }
        }
      }

      const normTitle = Normalizer.normalizeTitle(title);
      const titleClauses = [];
      if (title && title.trim()) {
        titleClauses.push({ title: { [Op.like]: `%${title.trim()}%` } });
        const baseTitle = title.split(/[\(\[]/)[0].trim();
        if (baseTitle && baseTitle !== title.trim()) {
          titleClauses.push({ title: { [Op.like]: `%${baseTitle}%` } });
        }
      }
      if (normTitle && normTitle.length >= 2) {
        titleClauses.push({ title: { [Op.like]: `%${normTitle}%` } });
      }

      if (titleClauses.length > 0) {
        const candidates = await Track.findAll({
          where: { [Op.or]: titleClauses },
          limit: 15
        });

        for (const row of candidates) {
          if (!row.albumArt) continue;
          if (TrackMatcher.isMatch({ title, artist, spotifyId }, row)) {
            const cached = await this.cacheImage(row.albumArt);
            if (this.isLocalCachedImage(cached)) {
              if (cached !== row.albumArt) {
                await row.update({ albumArt: cached }).catch(() => {});
              }
              return cached;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[ImageCacheService] Track table lookup notice:', err.message);
    }
    return null;
  }

  /**
   * Looks up locally cacheable artwork from the MySQL `search_caches` table.
   */
  async _findArtworkInSearchCaches({ spotifyId, title, artist }) {
    try {
      const terms = [];
      const baseTitle = (title || '').split(/[\(\[]/)[0].trim().toLowerCase();
      const primaryArtist = Normalizer.normalizeArtist(artist || '');
      if (baseTitle.length >= 2) terms.push({ query: { [Op.like]: `%${baseTitle}%` } });
      if (primaryArtist.length >= 2) terms.push({ query: { [Op.like]: `%${primaryArtist}%` } });
      if (terms.length === 0) return null;

      const cacheEntries = await SearchCache.findAll({
        where: { [Op.or]: terms },
        order: [['updatedAt', 'DESC']],
        limit: 15
      });

      for (const entry of cacheEntries) {
        let items = entry.results;
        if (typeof items === 'string') {
          try {
            items = JSON.parse(items);
          } catch (e) {
            items = [];
          }
        }
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          if (!item?.albumArt) continue;
          const matchesId = spotifyId && item.spotifyId && item.spotifyId === spotifyId;
          const matchesTrack = title && TrackMatcher.isMatch({ title, artist, spotifyId }, item);
          if (matchesId || matchesTrack) {
            const cached = await this.cacheImage(item.albumArt);
            if (this.isLocalCachedImage(cached)) {
              return cached;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[ImageCacheService] SearchCache lookup notice:', err.message);
    }
    return null;
  }

  async _syncCachedTrackRow({ spotifyId, title, artist }, localCachedUrl) {
    if (!this.isLocalCachedImage(localCachedUrl)) return;
    try {
      if (spotifyId) {
        const byId = await Track.findOne({ where: { spotifyId } });
        if (byId && !this.isLocalCachedImage(byId.albumArt)) {
          await byId.update({ albumArt: localCachedUrl });
        }
      }
      if (title) {
        const baseTitle = title.split(/[\(\[]/)[0].trim();
        const rows = await Track.findAll({
          where: { title: { [Op.like]: `%${baseTitle}%` } },
          limit: 10
        });
        for (const row of rows) {
          if (!this.isLocalCachedImage(row.albumArt) && TrackMatcher.isMatch({ title, artist, spotifyId }, row)) {
            await row.update({ albumArt: localCachedUrl });
          }
        }
      }
    } catch (e) {}
  }

  /**
   * Resolves artwork using local disk cache -> tracks table -> search_caches -> remote URL -> optional search fallback.
   */
  async resolveTrackArtwork(
    { spotifyId = null, title = null, artist = null, albumArt = null } = {},
    { allowRemoteFallback = true, searchFn = null } = {}
  ) {
    // 1. Local disk cache already valid
    if (this.isLocalCachedImage(albumArt)) {
      return albumArt;
    }

    // 2. Check tracks table in MySQL (must resolve to valid local image)
    const fromTracks = await this._findArtworkInTracksTable({ spotifyId, title, artist });
    if (fromTracks) {
      return fromTracks;
    }

    // 3. Check search_caches table in MySQL
    const fromSearchCache = await this._findArtworkInSearchCaches({ spotifyId, title, artist });
    if (fromSearchCache) {
      await this._syncCachedTrackRow({ spotifyId, title, artist }, fromSearchCache);
      return fromSearchCache;
    }

    // 4. Cache caller-supplied remote URL onto disk
    if (albumArt && !albumArt.startsWith('/api/image/')) {
      const cached = await this.cacheImage(albumArt);
      if (this.isLocalCachedImage(cached)) {
        await this._syncCachedTrackRow({ spotifyId, title, artist }, cached);
        return cached;
      }
    }

    // 5. Optional 3rd-party search fallback when artwork is still missing or dead
    if (allowRemoteFallback && typeof searchFn === 'function' && title) {
      try {
        const query = `${artist || ''} ${title}`.trim();
        const candidates = await searchFn(query);
        if (Array.isArray(candidates) && candidates.length > 0) {
          const ordered = [
            ...candidates.filter(c => c.albumArt && spotifyId && c.spotifyId === spotifyId),
            ...candidates.filter(c => c.albumArt && TrackMatcher.isMatch({ title, artist, spotifyId }, c)),
            ...candidates.filter(c => c.albumArt)
          ];
          const seen = new Set();

          for (const cand of ordered) {
            if (!cand?.albumArt || seen.has(cand.albumArt)) continue;
            seen.add(cand.albumArt);
            const cached = await this.cacheImage(cand.albumArt);
            if (this.isLocalCachedImage(cached)) {
              await this._syncCachedTrackRow({ spotifyId, title, artist }, cached);
              return cached;
            }
          }
        }
      } catch (err) {
        console.warn('[ImageCacheService] Remote fallback lookup notice:', err.message);
      }
    }

    return (albumArt && !albumArt.startsWith('/api/image/')) ? albumArt : null;
  }

  /**
   * Bulk caches images for search results or game tracks, checking local DB/disk caches first.
   */
  async bulkCacheImages(tracks) {
    if (!tracks || !Array.isArray(tracks)) return tracks;

    const enriched = await Promise.all(tracks.map(async (t) => {
      if (this.isLocalCachedImage(t.albumArt)) {
        return t;
      }
      const resolved = await this.resolveTrackArtwork(t, { allowRemoteFallback: false });
      return resolved ? { ...t, albumArt: resolved } : t;
    }));

    return enriched;
  }
}

export const imageCacheService = new ImageCacheService();
export default imageCacheService;
