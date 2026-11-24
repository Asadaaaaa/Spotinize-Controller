import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import { Op } from 'sequelize';
import { Track } from '../models/index.js';

const execPromise = util.promisify(exec);

export class TrackDetailService {
  constructor() {
    this.cache = new Map();
    this.ttlMs = 6 * 60 * 60 * 1000;
  }

  _buildSpotifyUrl({ spotifyId, title, artist }) {
    const cleaned = typeof spotifyId === 'string'
      ? spotifyId.replace(/^(spotify_|daily_(us|id)_|itunes_|sp_[a-zA-Z0-9]+_)/, '').trim()
      : '';
    if (/^[A-Za-z0-9]{22}$/.test(cleaned)) {
      return `https://open.spotify.com/track/${cleaned}`;
    }
    const q = `${title || ''} ${artist || ''}`.trim();
    return q ? `https://open.spotify.com/search/${encodeURIComponent(q)}` : 'https://open.spotify.com';
  }

  async _findYoutubeVideoId(title, artist) {
    try {
      const query = `${title} ${artist} official music video`.replace(/"/g, '');
      const { stdout } = await execPromise(
        `yt-dlp --get-id --no-playlist --default-search ytsearch1 "${query}" 2>/dev/null`,
        { timeout: 5500 }
      );
      const vid = (stdout || '').trim().split('\n')[0]?.trim();
      return vid && /^[A-Za-z0-9_-]{6,20}$/.test(vid) ? vid : null;
    } catch (e) {
      return null;
    }
  }

  async _fetchItunesMeta(title, artist) {
    try {
      const term = `${title} ${artist}`.trim();
      const res = await axios.get('https://itunes.apple.com/search', {
        params: { term, entity: 'song', limit: 3 },
        timeout: 4500
      });
      const hit = res.data?.results?.[0];
      if (!hit) return null;
      return {
        album: hit.collectionName || null,
        releaseDate: hit.releaseDate ? hit.releaseDate.slice(0, 10) : null,
        genre: hit.primaryGenreName || null,
        coverUrl: hit.artworkUrl100 ? hit.artworkUrl100.replace('100x100', '600x600') : null,
        previewUrl: hit.previewUrl || null
      };
    } catch (e) {
      return null;
    }
  }

  async _fetchAiTrackStory({ title, artist, album, releaseDate, genre }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const prompt = `Provide concise factual metadata for the song "${title}" by ${artist} (Album: ${album || 'Unknown'}, Release: ${releaseDate || 'Unknown'}, Genre: ${genre || 'Unknown'}).
Return ONLY valid JSON with keys:
- "writers": comma-separated main songwriters/composers if well-known, otherwise "${artist}"
- "description_id": 2-3 sentences in casual Indonesian explaining what the song is about (theme/meaning)
- "description_en": 2-3 sentences in English explaining what the song is about (theme/meaning)`;

    try {
      const resp = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.4
          }
        },
        { timeout: 7000 }
      );
      const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return null;
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  async getTrackDetail({ id = null, spotifyId = null, title = '', artist = '', coverUrl = null, previewUrl = null }) {
    const cleanTitle = (title || '').trim();
    const cleanArtist = (artist || '').trim();
    if (!cleanTitle) {
      throw new Error('Judul lagu diperlukan');
    }

    const cacheKey = `${spotifyId || id || cleanTitle.toLowerCase()}::${cleanArtist.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.ttlMs) {
      return cached.data;
    }

    // 1. Check DB Track
    let dbTrack = null;
    if (id) {
      dbTrack = await Track.findByPk(id).catch(() => null);
    }
    if (!dbTrack && spotifyId) {
      dbTrack = await Track.findOne({ where: { spotifyId } }).catch(() => null);
    }
    if (!dbTrack) {
      dbTrack = await Track.findOne({
        where: {
          title: { [Op.like]: cleanTitle },
          ...(cleanArtist ? { artist: { [Op.like]: `%${cleanArtist}%` } } : {})
        }
      }).catch(() => null);
    }

    // Return straight from DB `tracks` cache if already cached (no 3rd-party fetch needed)
    if (dbTrack?.detailCachedAt && dbTrack?.description) {
      const dbRelease = dbTrack.releaseDate || (dbTrack.releaseYear ? String(dbTrack.releaseYear) : '-');
      const dbResult = {
        id: dbTrack.id,
        spotifyId: dbTrack.spotifyId || spotifyId || null,
        title: dbTrack.title || cleanTitle,
        artist: dbTrack.artist || cleanArtist || 'Unknown Artist',
        album: dbTrack.album || '-',
        releaseDate: dbRelease,
        genre: dbTrack.genre || dbTrack.category || '-',
        writers: dbTrack.writers || dbTrack.artist || cleanArtist || '-',
        description: dbTrack.description,
        descriptionEn: dbTrack.descriptionEn || dbTrack.description,
        youtubeVideoId: dbTrack.youtubeVideoId || null,
        youtubeUrl: dbTrack.youtubeVideoId ? `https://www.youtube.com/watch?v=${dbTrack.youtubeVideoId}` : null,
        spotifyUrl: this._buildSpotifyUrl({ spotifyId: dbTrack.spotifyId || spotifyId, title: dbTrack.title || cleanTitle, artist: dbTrack.artist || cleanArtist }),
        coverUrl: dbTrack.albumArt || coverUrl || null,
        previewUrl: dbTrack.previewUrl || previewUrl || null
      };
      this.cache.set(cacheKey, { data: dbResult, ts: Date.now() });
      return dbResult;
    }

    // 2. Fetch iTunes metadata + YouTube Music Video ID in parallel
    const [itunesMeta, youtubeVideoId] = await Promise.all([
      this._fetchItunesMeta(cleanTitle, cleanArtist),
      this._findYoutubeVideoId(cleanTitle, cleanArtist)
    ]);

    const album = dbTrack?.album || itunesMeta?.album || null;
    const releaseDate = dbTrack?.releaseYear ? String(dbTrack.releaseYear) : (itunesMeta?.releaseDate || null);
    const genre = dbTrack?.genre || itunesMeta?.genre || dbTrack?.category || null;
    const resolvedCover = dbTrack?.albumArt || coverUrl || itunesMeta?.coverUrl || null;
    const resolvedPreview = dbTrack?.previewUrl || previewUrl || itunesMeta?.previewUrl || null;
    const resolvedSpotifyId = dbTrack?.spotifyId || spotifyId || null;

    const aiStory = await this._fetchAiTrackStory({
      title: cleanTitle,
      artist: cleanArtist,
      album,
      releaseDate,
      genre
    });

    const fallbackDescId = `"${cleanTitle}" adalah lagu dari ${cleanArtist || 'artis ini'}${album ? ` yang masuk dalam album ${album}` : ''}${releaseDate ? ` (rilis ${releaseDate})` : ''}${genre ? ` dengan nuansa ${genre}` : ''}.`;
    const fallbackDescEn = `"${cleanTitle}" is a track by ${cleanArtist || 'this artist'}${album ? ` featured on ${album}` : ''}${releaseDate ? ` (released ${releaseDate})` : ''}${genre ? ` in the ${genre} genre` : ''}.`;

    const result = {
      id: dbTrack?.id || id || null,
      spotifyId: resolvedSpotifyId,
      title: cleanTitle,
      artist: cleanArtist || dbTrack?.artist || 'Unknown Artist',
      album: album || '-',
      releaseDate: releaseDate || '-',
      genre: genre || '-',
      writers: aiStory?.writers || cleanArtist || '-',
      description: aiStory?.description_id || fallbackDescId,
      descriptionEn: aiStory?.description_en || fallbackDescEn,
      youtubeVideoId: youtubeVideoId || null,
      youtubeUrl: youtubeVideoId ? `https://www.youtube.com/watch?v=${youtubeVideoId}` : null,
      spotifyUrl: this._buildSpotifyUrl({ spotifyId: resolvedSpotifyId, title: cleanTitle, artist: cleanArtist }),
      coverUrl: resolvedCover,
      previewUrl: resolvedPreview
    };

    // Persist detail metadata into `tracks` table so future requests skip 3rd-party APIs
    try {
      const parsedYear = releaseDate && /^\d{4}/.test(releaseDate) ? parseInt(releaseDate.slice(0, 4), 10) : null;
      const cachePayload = {
        album: album || dbTrack?.album || null,
        albumArt: resolvedCover || dbTrack?.albumArt || null,
        previewUrl: resolvedPreview || dbTrack?.previewUrl || null,
        genre: genre || dbTrack?.genre || null,
        releaseYear: dbTrack?.releaseYear || parsedYear || null,
        releaseDate: releaseDate || null,
        writers: result.writers,
        description: result.description,
        descriptionEn: result.descriptionEn,
        youtubeVideoId: result.youtubeVideoId,
        detailCachedAt: new Date()
      };

      if (dbTrack) {
        await dbTrack.update(cachePayload);
      } else {
        const created = await Track.create({
          spotifyId: resolvedSpotifyId || undefined,
          title: cleanTitle,
          artist: cleanArtist || 'Unknown Artist',
          ...cachePayload
        });
        result.id = created.id;
      }
    } catch (e) {
      console.warn('[TrackDetailService] Failed to persist track detail cache:', e.message);
    }

    this.cache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
  }
}

export const trackDetailService = new TrackDetailService();
export default trackDetailService;
