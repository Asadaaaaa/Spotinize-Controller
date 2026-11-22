import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { Normalizer } from '../utils/Normalizer.js';
import { TrackMatcher } from '../utils/TrackMatcher.js';

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AudioService {
  constructor() {
    this.cacheDir = path.resolve(__dirname, '../../audio_cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    this.inFlightResolves = new Map();
    this.inFlightClips = new Map();
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
   * Downloads audio from a direct URL atomically via temp files and normalizes to MP3.
   */
  async _downloadFromUrl(url, destPath) {
    const uniq = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const baseNoExt = destPath.replace(/\.mp3$/, '');
    const downloadTmp = `${baseNoExt}.dl_${uniq}.tmp`;
    const mp3Tmp = `${baseNoExt}.conv_${uniq}.tmp.mp3`;

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

      const writer = fs.createWriteStream(downloadTmp);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      if (fs.existsSync(downloadTmp) && fs.statSync(downloadTmp).size > 1000) {
        try {
          await execPromise(`ffmpeg -y -i "${downloadTmp}" -ar 44100 -ac 2 -b:a 192k -f mp3 "${mp3Tmp}" 2>/dev/null`);
          if (fs.existsSync(mp3Tmp) && fs.statSync(mp3Tmp).size > 1000) {
            fs.renameSync(mp3Tmp, destPath);
            return destPath;
          }
        } catch (e) {
          // If ffmpeg conversion fails, fall back only if downloaded file itself is valid audio
        }

        if (fs.existsSync(downloadTmp) && fs.statSync(downloadTmp).size > 5000) {
          fs.renameSync(downloadTmp, destPath);
          return destPath;
        }
      }
    } catch (err) {
      console.warn(`[AudioService] Direct download failed for ${url}:`, err.message);
    } finally {
      if (fs.existsSync(downloadTmp)) {
        try { fs.unlinkSync(downloadTmp); } catch (e) {}
      }
      if (fs.existsSync(mp3Tmp)) {
        try { fs.unlinkSync(mp3Tmp); } catch (e) {}
      }
    }
    return null;
  }

  _normalizeToken(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _splitArtistCredits(artistStr) {
    if (!artistStr || typeof artistStr !== 'string') return [];
    const tokens = artistStr
      .split(/,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b|\bx\b|\//i)
      .map(part => this._normalizeToken(part))
      .filter(Boolean);
    const full = this._normalizeToken(artistStr);
    if (full && !tokens.includes(full)) {
      tokens.unshift(full);
    }
    return tokens;
  }

  _isStrictArtistCreditMatch(candidateArtist, targetArtist) {
    const candCredits = this._splitArtistCredits(candidateArtist);
    const targetCredits = this._splitArtistCredits(targetArtist);
    if (candCredits.length === 0 || targetCredits.length === 0) return false;

    for (const t of targetCredits) {
      const tNoThe = t.replace(/^the\s+/, '');
      for (const c of candCredits) {
        if (t === c) return true;
        const cNoThe = c.replace(/^the\s+/, '');
        if (tNoThe.length >= 3 && tNoThe === cNoThe) return true;
      }
    }
    return false;
  }

  _isUnwantedPreview(item, targetTitle, targetArtist) {
    const haystack = `${item.trackName || ''} ${item.collectionName || ''} ${item.artistName || ''}`.toLowerCase();
    const targetHaystack = `${targetTitle || ''} ${targetArtist || ''}`.toLowerCase();
    const bannedTerms = [
      'karaoke', 'tribute', 'lullaby', 'cover', 'originally performed',
      'made famous', 'in the style of', '8-bit', 'ringtone', 'music box',
      'instrumental', 'slowed', 'sped up'
    ];
    for (const term of bannedTerms) {
      if (haystack.includes(term) && !targetHaystack.includes(term)) {
        return true;
      }
    }
    return false;
  }

  _scoreTitleMatch(candidateTrackName, targetNormTitle) {
    const normCand = Normalizer.normalizeTitle(candidateTrackName);
    if (!normCand || !targetNormTitle) return 0;
    if (normCand === targetNormTitle) return 100;

    const sim = TrackMatcher._similarity(normCand, targetNormTitle);
    if (sim >= 0.85) return Math.round(sim * 90);

    if (normCand.length >= 4 && targetNormTitle.length >= 4) {
      const ratio = Math.min(normCand.length, targetNormTitle.length) / Math.max(normCand.length, targetNormTitle.length);
      if (ratio >= 0.65 && (normCand.includes(targetNormTitle) || targetNormTitle.includes(normCand))) {
        return 75;
      }
    }
    return 0;
  }

  _escapeShellArg(str) {
    return (str || '').replace(/["`$\\]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Tries to find a verified iTunes preview URL for a track (never returns unverified results[0]).
   */
  async _findItunesPreviewUrl(title, artist) {
    try {
      const normTitle = Normalizer.normalizeTitle(title);
      const primaryArtist = Normalizer.normalizeArtist(artist);
      const queries = [...new Set([
        `${primaryArtist} ${normTitle}`.trim(),
        `${artist} ${title}`.trim()
      ])].filter(Boolean);

      if (queries.length === 0 || !normTitle || !primaryArtist) return null;

      const countries = ['ID', 'US'];
      let bestMatch = null;

      for (const country of countries) {
        for (const q of queries) {
          const res = await axios.get('https://itunes.apple.com/search', {
            params: { term: q, media: 'music', entity: 'song', country, limit: 10 },
            timeout: 5000
          });

          const results = res.data?.results || [];
          for (const item of results) {
            if (!item.previewUrl) continue;
            if (this._isUnwantedPreview(item, title, artist)) continue;
            if (!this._isStrictArtistCreditMatch(item.artistName, artist)) continue;

            const titleScore = this._scoreTitleMatch(item.trackName, normTitle);
            if (titleScore === 0) continue;

            let totalScore = titleScore;
            if (this._normalizeToken(item.artistName) === this._normalizeToken(artist)) {
              totalScore += 10;
            }
            if (!/\b(live|remaster|acoustic|remix)\b/i.test(item.trackName || '') || /\b(live|remaster|acoustic|remix)\b/i.test(title || '')) {
              totalScore += 5;
            }

            if (!bestMatch || totalScore > bestMatch.score) {
              bestMatch = { url: item.previewUrl, score: totalScore };
            }
          }

          if (bestMatch && bestMatch.score >= 100) {
            return bestMatch.url;
          }
        }
        if (bestMatch) {
          return bestMatch.url;
        }
      }
    } catch (err) {
      console.warn('[AudioService] iTunes preview lookup failed:', err.message);
    }
    return null;
  }

  /**
   * Resolves and downloads the full track audio with in-flight promise deduplication.
   */
  async resolveAudio(trackId, title, artist, previewUrl = null) {
    const sourcePath = this.getSourceAudioPath(trackId, title, artist);

    if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).size > 5000) {
      return sourcePath;
    }

    if (this.inFlightResolves.has(sourcePath)) {
      return await this.inFlightResolves.get(sourcePath);
    }

    const resolvePromise = (async () => {
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

      // 4. SoundCloud via yt-dlp (atomic temp output)
      console.log(`   [Strategy 3] Trying SoundCloud via yt-dlp...`);
      const basePath = sourcePath.replace(/\.mp3$/, '');
      const safeArtistQuery = this._escapeShellArg(artist);
      const safeTitleQuery = this._escapeShellArg(title);
      const scQueries = [
        `scsearch1:${safeArtistQuery} ${safeTitleQuery}`,
        `scsearch1:${safeTitleQuery} ${safeArtistQuery}`
      ];

      for (const scQuery of scQueries) {
        const tmpBase = `${basePath}.sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const tmpMp3 = `${tmpBase}.mp3`;
        try {
          const ytdlpCmd = `yt-dlp --no-playlist --extract-audio --audio-format mp3 --audio-quality 5 -o "${tmpBase}.%(ext)s" "${scQuery}"`;
          await Promise.race([
            execPromise(ytdlpCmd),
            new Promise((_, reject) => setTimeout(() => reject(new Error('yt-dlp timeout')), 12000))
          ]);

          if (fs.existsSync(tmpMp3) && fs.statSync(tmpMp3).size > 5000) {
            fs.renameSync(tmpMp3, sourcePath);
            console.log(`✅ [AudioService] Downloaded from SoundCloud for: ${artist} - ${title}`);
            return sourcePath;
          }
        } catch (err) {
          // SoundCloud blocked — continue to next strategy
        } finally {
          if (fs.existsSync(tmpMp3)) {
            try { fs.unlinkSync(tmpMp3); } catch (e) {}
          }
        }
      }

      // 5. YouTube via yt-dlp (atomic temp output)
      console.log(`   [Strategy 4] Trying YouTube via yt-dlp...`);
      const ytQueries = [
        `ytsearch1:${safeArtistQuery} ${safeTitleQuery} official audio`,
        `ytsearch1:${safeArtistQuery} ${safeTitleQuery}`
      ];

      for (const ytQuery of ytQueries) {
        const tmpBase = `${basePath}.yt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const tmpMp3 = `${tmpBase}.mp3`;
        try {
          const ytCmd = `yt-dlp --no-playlist --extract-audio --audio-format mp3 --audio-quality 5 -o "${tmpBase}.%(ext)s" "${ytQuery}"`;
          await Promise.race([
            execPromise(ytCmd),
            new Promise((_, reject) => setTimeout(() => reject(new Error('yt-dlp yt timeout')), 15000))
          ]);

          if (fs.existsSync(tmpMp3) && fs.statSync(tmpMp3).size > 5000) {
            fs.renameSync(tmpMp3, sourcePath);
            console.log(`✅ [AudioService] Downloaded from YouTube for: ${artist} - ${title}`);
            return sourcePath;
          }
        } catch (err) {
          // YouTube also failed — continue
        } finally {
          if (fs.existsSync(tmpMp3)) {
            try { fs.unlinkSync(tmpMp3); } catch (e) {}
          }
        }
      }

      if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).size > 5000) {
        return sourcePath;
      }

      throw new Error(`Tidak dapat mengunduh audio untuk ${artist} - ${title}`);
    })();

    this.inFlightResolves.set(sourcePath, resolvePromise);
    try {
      return await resolvePromise;
    } finally {
      this.inFlightResolves.delete(sourcePath);
    }
  }

  /**
   * Checks whether an audio clip has valid size and audible (non-silent) waveform energy.
   */
  async _hasAudibleEnergy(filePath) {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size <= 500) {
      return false;
    }
    try {
      const { stderr } = await execPromise(`ffmpeg -i "${filePath}" -af volumedetect -f null /dev/null 2>&1`);
      const match = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
      if (match) {
        const maxDb = parseFloat(match[1]);
        return Number.isFinite(maxDb) && maxDb > -50;
      }
    } catch (e) {}
    return true;
  }

  /**
   * Produces or returns the clipped audio file atomically with concurrency lock and non-silence guard.
   */
  async getClueAudio(trackId, title, artist, durationSeconds, previewUrl = null) {
    const clippedPath = this.getClippedAudioPath(trackId, title, artist, durationSeconds);

    if (fs.existsSync(clippedPath) && fs.statSync(clippedPath).size > 500) {
      return clippedPath;
    }

    if (this.inFlightClips.has(clippedPath)) {
      return await this.inFlightClips.get(clippedPath);
    }

    const clipPromise = (async () => {
      // Re-check inside lock
      if (fs.existsSync(clippedPath) && fs.statSync(clippedPath).size > 500) {
        return clippedPath;
      }

      const sourcePath = await this.resolveAudio(trackId, title, artist, previewUrl);
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        throw new Error(`Audio source tidak ditemukan untuk ${artist} - ${title}`);
      }

      const uniq = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const tempClipPath = `${clippedPath.replace(/\.mp3$/, '')}.tmp_${uniq}.mp3`;
      const fadeDur = durationSeconds <= 0.15 ? 0.015 : 0.02;
      const fadeStart = Math.max(0, durationSeconds - fadeDur);

      try {
        const primaryFilter = `silenceremove=start_periods=1:start_duration=0.01:start_threshold=-32dB,atrim=0:${durationSeconds},afade=t=out:st=${fadeStart}:d=${fadeDur}`;
        await execPromise(`ffmpeg -y -i "${sourcePath}" -af "${primaryFilter}" -ar 44100 -ac 2 -b:a 192k -f mp3 "${tempClipPath}"`);

        const primaryOk = await this._hasAudibleEnergy(tempClipPath);
        if (!primaryOk) {
          // Fallback to plain atrim without silenceremove so the clip is guaranteed non-empty
          const fallbackFilter = `atrim=0:${durationSeconds},afade=t=out:st=${fadeStart}:d=${fadeDur}`;
          await execPromise(`ffmpeg -y -i "${sourcePath}" -af "${fallbackFilter}" -ar 44100 -ac 2 -b:a 192k -f mp3 "${tempClipPath}"`);
        }

        if (fs.existsSync(tempClipPath) && fs.statSync(tempClipPath).size > 500) {
          fs.renameSync(tempClipPath, clippedPath);
          return clippedPath;
        }
      } catch (err) {
        console.error(`[AudioService] Error clipping audio for ${durationSeconds}s:`, err.message);
      } finally {
        if (fs.existsSync(tempClipPath)) {
          try { fs.unlinkSync(tempClipPath); } catch (e) {}
        }
      }

      return sourcePath;
    })();

    this.inFlightClips.set(clippedPath, clipPromise);
    try {
      return await clipPromise;
    } finally {
      this.inFlightClips.delete(clippedPath);
    }
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
