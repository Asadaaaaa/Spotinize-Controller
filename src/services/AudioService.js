import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import { fileURLToPath } from 'url';

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AudioService {
  constructor() {
    this.cacheDir = path.resolve(__dirname, '../../audio_cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  _sanitizeFilename(str) {
    return (str || '').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().substring(0, 50);
  }

  getSourceAudioPath(trackId, title, artist) {
    const safeTitle = this._sanitizeFilename(title);
    const safeArtist = this._sanitizeFilename(artist);
    // Key by trackId if available to guarantee 100% no cross-track collisions
    const prefix = trackId ? `track_${trackId}` : `${safeArtist}_${safeTitle}`;
    return path.join(this.cacheDir, `${prefix}_source.mp3`);
  }

  getClippedAudioPath(trackId, title, artist, durationSeconds) {
    const safeTitle = this._sanitizeFilename(title);
    const safeArtist = this._sanitizeFilename(artist);
    const durStr = durationSeconds.toString().replace('.', '_');
    const prefix = trackId ? `track_${trackId}` : `${safeArtist}_${safeTitle}`;
    return path.join(this.cacheDir, `${prefix}_${durStr}s.mp3`);
  }

  /**
   * Downloads audio from a direct URL (e.g. iTunes/Spotify preview URL)
   */
  async _downloadFromUrl(url, destPath) {
    try {
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const writer = fs.createWriteStream(destPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Convert m4a to mp3 if necessary (iTunes previews are m4a)
      if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1000) {
        // Check if the file is actually m4a by reading header
        const mp3Path = destPath;
        const tempPath = destPath + '.temp';
        try {
          await execPromise(`ffmpeg -y -i "${destPath}" -ar 44100 -ac 2 -b:a 192k "${tempPath}" 2>/dev/null`);
          if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 1000) {
            fs.renameSync(tempPath, mp3Path);
            return mp3Path;
          }
        } catch (e) {
          // If ffmpeg conversion fails, the file might already be mp3
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
        return destPath;
      }
    } catch (err) {
      console.warn(`[AudioService] Direct download failed for ${url}:`, err.message);
    }
    return null;
  }

  /**
   * Tries to find an iTunes preview URL for a track
   */
  async _findItunesPreviewUrl(title, artist) {
    try {
      const queries = [
        `${artist} ${title}`,
        `${title} ${artist}`,
        `${title}`
      ];

      for (const q of queries) {
        const res = await axios.get('https://itunes.apple.com/search', {
          params: { term: q, entity: 'song', limit: 5 },
          timeout: 5000
        });

        if (res.data?.results?.length > 0) {
          // Try to find exact match first
          const exactMatch = res.data.results.find(item =>
            item.trackName?.toLowerCase().includes(title.toLowerCase()) &&
            item.artistName?.toLowerCase().includes(artist.split(',')[0].trim().toLowerCase())
          );
          
          if (exactMatch?.previewUrl) return exactMatch.previewUrl;

          // Fallback to first result with preview
          const withPreview = res.data.results.find(item => item.previewUrl);
          if (withPreview?.previewUrl) return withPreview.previewUrl;
        }
      }
    } catch (err) {
      console.warn('[AudioService] iTunes preview lookup failed:', err.message);
    }
    return null;
  }

  /**
   * Resolves and downloads the full track audio using multiple strategies:
   * 1. Existing cache
   * 2. Track's own previewUrl (Spotify/iTunes)
   * 3. iTunes Search API for preview URL
   * 4. SoundCloud via yt-dlp (fallback)
   * 5. YouTube via yt-dlp (last resort)
   */
  async resolveAudio(trackId, title, artist, previewUrl = null) {
    const sourcePath = this.getSourceAudioPath(trackId, title, artist);

    // 1. Return from local cache if already present and valid
    if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).size > 5000) {
      return sourcePath;
    }

    console.log(`🎵 [AudioService] Resolving audio for: ${artist} - ${title}...`);

    // 2. Try direct download from existing previewUrl (Spotify or iTunes)
    if (previewUrl) {
      console.log(`   [Strategy 1] Downloading from track previewUrl...`);
      const result = await this._downloadFromUrl(previewUrl, sourcePath);
      if (result && fs.existsSync(sourcePath) && fs.statSync(sourcePath).size > 5000) {
        console.log(`✅ [AudioService] Downloaded from previewUrl for: ${artist} - ${title}`);
        return sourcePath;
      }
    }

    // 3. Search iTunes for preview URL and download
    console.log(`   [Strategy 2] Searching iTunes for preview URL...`);
    const itunesUrl = await this._findItunesPreviewUrl(title, artist);
    if (itunesUrl) {
      const result = await this._downloadFromUrl(itunesUrl, sourcePath);
      if (result && fs.existsSync(sourcePath) && fs.statSync(sourcePath).size > 5000) {
        console.log(`✅ [AudioService] Downloaded from iTunes preview for: ${artist} - ${title}`);
        return sourcePath;
      }
    }

    // 4. SoundCloud via yt-dlp (may be blocked)
    console.log(`   [Strategy 3] Trying SoundCloud via yt-dlp...`);
    const basePath = sourcePath.replace(/\.mp3$/, '');
    const scQueries = [
      `scsearch1:${artist} ${title}`,
      `scsearch1:${title} ${artist}`
    ];

    for (const scQuery of scQueries) {
      try {
        const ytdlpCmd = `yt-dlp --no-playlist --extract-audio --audio-format mp3 --audio-quality 5 -o "${basePath}.%(ext)s" "${scQuery}"`;
        await Promise.race([
          execPromise(ytdlpCmd),
          new Promise((_, reject) => setTimeout(() => reject(new Error('yt-dlp timeout')), 12000))
        ]);

        if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).size > 5000) {
          console.log(`✅ [AudioService] Downloaded from SoundCloud for: ${artist} - ${title}`);
          return sourcePath;
        }
      } catch (err) {
        // SoundCloud blocked — continue to next strategy
      }
    }

    // 5. YouTube via yt-dlp (last resort, may need cookies)
    console.log(`   [Strategy 4] Trying YouTube via yt-dlp...`);
    const ytQueries = [
      `ytsearch1:${artist} ${title} official audio`,
      `ytsearch1:${artist} ${title}`
    ];

    for (const ytQuery of ytQueries) {
      try {
        const ytCmd = `yt-dlp --no-playlist --extract-audio --audio-format mp3 --audio-quality 5 -o "${basePath}.%(ext)s" "${ytQuery}"`;
        await Promise.race([
          execPromise(ytCmd),
          new Promise((_, reject) => setTimeout(() => reject(new Error('yt-dlp yt timeout')), 15000))
        ]);

        if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).size > 5000) {
          console.log(`✅ [AudioService] Downloaded from YouTube for: ${artist} - ${title}`);
          return sourcePath;
        }
      } catch (err) {
        // YouTube also failed — continue
      }
    }

    // All strategies failed
    if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).size > 5000) {
      return sourcePath;
    }

    throw new Error(`Tidak dapat mengunduh audio untuk ${artist} - ${title}`);
  }

  /**
   * Produces or returns the clipped audio file starting STRICTLY from 00:00:00.000
   * for the exact reveal duration (0.1s, 0.5s, 1s, 2s, 3s, 4s, 5s)
   */
  async getClueAudio(trackId, title, artist, durationSeconds, previewUrl = null) {
    const clippedPath = this.getClippedAudioPath(trackId, title, artist, durationSeconds);

    if (fs.existsSync(clippedPath) && fs.statSync(clippedPath).size > 500) {
      return clippedPath;
    }

    const sourcePath = await this.resolveAudio(trackId, title, artist, previewUrl);
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      throw new Error(`Audio source tidak ditemukan untuk ${artist} - ${title}`);
    }

    // Clip starting from the exact first moment sound begins (silence removed) to durationSeconds with smooth micro-fadeout
    try {
      const fadeStart = Math.max(0, durationSeconds - 0.02);
      const clipCmd = `ffmpeg -y -i "${sourcePath}" -af "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-40dB,atrim=0:${durationSeconds},afade=t=out:st=${fadeStart}:d=0.02" -ar 44100 -ac 2 -b:a 192k "${clippedPath}"`;
      await execPromise(clipCmd);

      if (fs.existsSync(clippedPath) && fs.statSync(clippedPath).size > 200) {
        return clippedPath;
      }
    } catch (err) {
      console.error(`[AudioService] Error clipping audio with silence removal for ${durationSeconds}s:`, err.message);
    }

    return sourcePath;
  }

  /**
   * Pre-fetches audio and pre-slices all 7 progressive reveal clips for a single track
   */
  async preloadSingleTrack(track) {
    const REVEAL_LEVELS = [0.1, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0];
    try {
      const sourcePath = await this.resolveAudio(track.id, track.title, track.artist, track.previewUrl);
      if (sourcePath && fs.existsSync(sourcePath)) {
        for (const dur of REVEAL_LEVELS) {
          await this.getClueAudio(track.id, track.title, track.artist, dur, track.previewUrl);
        }
        console.log(`✅ [AudioService] Preloaded all 7 clips for track: ${track.artist} - ${track.title}`);
        return true;
      }
    } catch (err) {
      console.warn(`[AudioService] Failed to preload track ${track.title}:`, err.message);
    }
    return false;
  }

  /**
   * Pre-fetches audio and pre-slices all 7 progressive reveal clips for all tracks in a game session
   */
  async preloadGameAudio(tracks) {
    if (!tracks || tracks.length === 0) return;
    console.log(`🚀 [AudioService] Preloading audio clues for ${tracks.length} game tracks...`);

    // First track is preloaded immediately so Round 1 is ready with 0 latency
    if (tracks[0]) {
      await this.preloadSingleTrack(tracks[0]);
    }

    // Remaining tracks are preloaded concurrently in background
    if (tracks.length > 1) {
      Promise.allSettled(tracks.slice(1).map(track => this.preloadSingleTrack(track))).then(() => {
        console.log(`✅ [AudioService] All game audio clips preloaded and ready in cache!`);
      });
    }
  }

  /**
   * Checks if audio for a track and duration is already cached on server
   */
  isClueCached(trackId, title, artist, durationSeconds = 0.1) {
    const clippedPath = this.getClippedAudioPath(trackId, title, artist, durationSeconds);
    return fs.existsSync(clippedPath) && fs.statSync(clippedPath).size > 200;
  }
}

export const audioService = new AudioService();
export default audioService;
