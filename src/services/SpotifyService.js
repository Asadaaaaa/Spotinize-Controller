import axios from 'axios';
import spotifyConfig from '../config/spotify.js';
import { SearchCache } from '../models/index.js';
import { imageCacheService } from './ImageCacheService.js';
import { Normalizer } from '../utils/Normalizer.js';

export class SpotifyService {
  constructor() {
    this.config = spotifyConfig;
    this.fallbackTracks = this._initFallbackCatalog();
    this.fallbackArtists = this._initFallbackArtists();
    this.appToken = null;
    this.appTokenExpiresAt = 0;
    this.dailyCharts = {
      'Global Trends': { data: [], expiresAt: 0 },
      'Indonesia Trends': { data: [], expiresAt: 0 }
    };
  }

  /**
   * Obtains or returns a cached Spotify App Access Token using Client Credentials Flow.
   * This gives access to the entire 100M+ global Spotify catalog.
   */
  async getAppAccessToken() {
    if (this.appToken && Date.now() < this.appTokenExpiresAt - 60000) {
      return this.appToken;
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      return null;
    }

    try {
      const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`
          },
          timeout: 5000
        }
      );

      this.appToken = response.data.access_token;
      this.appTokenExpiresAt = Date.now() + (response.data.expires_in || 3600) * 1000;
      return this.appToken;
    } catch (err) {
      console.warn('[SpotifyService] Failed to obtain Client Credentials token:', err.response?.data || err.message);
      return null;
    }
  }

  getAuthUrl(state = '') {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes,
      show_dialog: 'true',
      state
    });
    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code) {
    if (!this.config.clientId || !this.config.clientSecret) {
      return {
        accessToken: 'mock_access_token_' + Date.now(),
        refreshToken: 'mock_refresh_token_' + Date.now(),
        expiresIn: 3600
      };
    }

    try {
      const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.config.redirectUri
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`
          }
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      console.error('Spotify token exchange error:', error.response?.data || error.message);
      throw error;
    }
  }

  async refreshUserAccessToken(refreshToken) {
    if (!refreshToken || refreshToken.startsWith('mock_')) return null;
    if (!this.config.clientId || !this.config.clientSecret) return null;

    try {
      const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`
          },
          timeout: 8000
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken,
        expiresIn: response.data.expires_in
      };
    } catch (err) {
      console.warn('[SpotifyService] Refresh token failed:', err.response?.data || err.message);
      return null;
    }
  }

  async getUserProfile(accessToken) {
    if (!accessToken || accessToken.startsWith('mock_')) {
      const randomSeed = Math.floor(1000 + Math.random() * 9000);
      return {
        id: 'spotinize_user_' + randomSeed,
        display_name: 'Spotinizer Star',
        email: 'player@spotinize.app',
        images: [{ url: `https://api.dicebear.com/7.x/bottts/svg?seed=spotify_${randomSeed}` }],
        external_urls: { spotify: `https://open.spotify.com/user/spotinize_user_${randomSeed}` }
      };
    }

    try {
      const response = await axios.get('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 5000
      });
      const data = response.data;
      if (!data.external_urls?.spotify && data.id) {
        data.external_urls = { spotify: `https://open.spotify.com/user/${data.id}` };
      }
      return data;
    } catch (error) {
      console.warn('Spotify /v1/me notice:', error.response?.data || error.message);
      const randomSeed = Math.floor(1000 + Math.random() * 9000);
      return {
        id: 'spotify_player_' + randomSeed,
        display_name: `Spotify Player #${randomSeed}`,
        email: 'spotify_user@spotinize.app',
        images: [{ url: `https://api.dicebear.com/7.x/bottts/svg?seed=spotify_${randomSeed}` }],
        external_urls: { spotify: `https://open.spotify.com/user/spotify_player_${randomSeed}` }
      };
    }
  }

  /**
   * Fetches recently played tracks from user's Spotify account.
   * If token expired, refreshes token automatically.
   * If recently played is empty, falls back to user top tracks.
   */
  async getUserRecentlyPlayed(accessToken, limit = 10, refreshToken = null, onTokenRefreshed = null) {
    const effectiveLimit = Math.min(20, Math.max(1, parseInt(limit) || 10));
    let token = accessToken;

    if (token && !token.startsWith('mock_')) {
      // Helper function to fetch recently-played or top tracks
      const fetchSpotifyData = async (activeToken) => {
        try {
          const response = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
            params: { limit: effectiveLimit },
            headers: { Authorization: `Bearer ${activeToken}` },
            timeout: 6000
          });

          if (response.data?.items?.length > 0) {
            return response.data.items.map(item => ({
              spotifyId: item.track.id,
              title: item.track.name,
              artist: item.track.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
              album: item.track.album?.name || '',
              coverUrl: item.track.album?.images?.[0]?.url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300',
              spotifyUrl: item.track.external_urls?.spotify || `https://open.spotify.com/track/${item.track.id}`,
              previewUrl: item.track.preview_url,
              playedAt: item.played_at
            }));
          }

          // If recently played list is empty, try top tracks
          const topRes = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
            params: { limit: effectiveLimit, time_range: 'short_term' },
            headers: { Authorization: `Bearer ${activeToken}` },
            timeout: 6000
          });

          if (topRes.data?.items?.length > 0) {
            return topRes.data.items.map((track, idx) => ({
              spotifyId: track.id,
              title: track.name,
              artist: track.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
              album: track.album?.name || '',
              coverUrl: track.album?.images?.[0]?.url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300',
              spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
              previewUrl: track.preview_url,
              playedAt: new Date(Date.now() - (idx + 1) * 1800000).toISOString()
            }));
          }
        } catch (err) {
          if (err.response?.status === 401 && refreshToken) {
            // Need refresh
            const refreshed = await this.refreshUserAccessToken(refreshToken);
            if (refreshed?.accessToken) {
              if (onTokenRefreshed) {
                onTokenRefreshed(refreshed);
              }
              // Retry with new token
              return await fetchSpotifyData(refreshed.accessToken);
            }
          }
          console.warn('[SpotifyService] Spotify player recently-played error:', err.response?.data || err.message);
        }
        return null;
      };

      const realTracks = await fetchSpotifyData(token);
      if (realTracks && realTracks.length > 0) {
        return realTracks;
      }
    }

    // Fallback recently played tracks from top catalog
    const fallbackList = this.fallbackTracks.slice(0, effectiveLimit);
    return fallbackList.map((t, idx) => ({
      spotifyId: t.spotifyId || `fallback_${idx}`,
      title: t.title,
      artist: t.artist,
      album: 'Top Hits',
      coverUrl: t.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300',
      spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(t.title + ' ' + t.artist)}`,
      previewUrl: t.previewUrl,
      playedAt: new Date(Date.now() - (idx + 1) * 3600000 * 2).toISOString()
    }));
  }

  /**
   * Fetches personalized tracks for a specific user from their connected Spotify account:
   * 1. Top Tracks (short_term & medium_term)
   * 2. Saved / Liked Tracks (/me/tracks)
   * 3. Recently Played Tracks (/me/player/recently-played)
   * 4. User's Playlists Tracks (/me/playlists)
   */
  async getUserPersonalTracks(userId) {
    if (!userId) return [];

    let user = null;
    try {
      const { UserRepository } = await import('../repositories/UserRepository.js');
      const userRepo = new UserRepository();
      user = await userRepo.findById(userId);
    } catch (e) {
      console.warn('[SpotifyService] Could not fetch user repository:', e.message);
    }

    if (!user || !user.spotifyConnected || !user.accessToken) {
      console.warn(`[SpotifyService] User ${userId} has not connected Spotify account.`);
      return [];
    }

    let token = user.accessToken;
    let refreshToken = user.refreshToken;

    const fetchWithToken = async (activeToken) => {
      const tracksMap = new Map();

      // 1. Fetch Top Tracks (short_term & medium_term)
      for (const timeRange of ['short_term', 'medium_term']) {
        try {
          const res = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
            params: { limit: 50, time_range: timeRange },
            headers: { Authorization: `Bearer ${activeToken}` },
            timeout: 6000
          });
          if (res.data?.items) {
            for (const item of res.data.items) {
              if (item?.name && item?.id && !tracksMap.has(item.id)) {
                tracksMap.set(item.id, {
                  spotifyId: item.id,
                  title: item.name,
                  artist: item.artists?.map(a => a.name).join(', ') || 'Unknown',
                  primaryArtist: item.artists?.[0]?.name || '',
                  album: item.album?.name || '',
                  albumArt: item.album?.images?.[0]?.url || item.album?.images?.[1]?.url || null,
                  previewUrl: item.preview_url || null,
                  durationMs: item.duration_ms || 30000,
                  category: 'My Songs'
                });
              }
            }
          }
        } catch (e) {
          if (e.response?.status === 401) throw e;
          console.warn(`[SpotifyService] Top tracks (${timeRange}) notice:`, e.message);
        }
      }

      // 2. Fetch User's Liked / Saved Tracks (/me/tracks)
      try {
        const res = await axios.get('https://api.spotify.com/v1/me/tracks', {
          params: { limit: 50 },
          headers: { Authorization: `Bearer ${activeToken}` },
          timeout: 6000
        });
        if (res.data?.items) {
          for (const item of res.data.items) {
            const trk = item.track;
            if (trk?.name && trk?.id && !tracksMap.has(trk.id)) {
              tracksMap.set(trk.id, {
                spotifyId: trk.id,
                title: trk.name,
                artist: trk.artists?.map(a => a.name).join(', ') || 'Unknown',
                primaryArtist: trk.artists?.[0]?.name || '',
                album: trk.album?.name || '',
                albumArt: trk.album?.images?.[0]?.url || trk.album?.images?.[1]?.url || null,
                previewUrl: trk.preview_url || null,
                durationMs: trk.duration_ms || 30000,
                category: 'My Songs'
              });
            }
          }
        }
      } catch (e) {
        if (e.response?.status === 401) throw e;
        console.warn('[SpotifyService] Saved tracks notice:', e.message);
      }

      // 3. Fetch Recently Played Tracks (/me/player/recently-played)
      try {
        const res = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
          params: { limit: 50 },
          headers: { Authorization: `Bearer ${activeToken}` },
          timeout: 6000
        });
        if (res.data?.items) {
          for (const item of res.data.items) {
            const trk = item.track;
            if (trk?.name && trk?.id && !tracksMap.has(trk.id)) {
              tracksMap.set(trk.id, {
                spotifyId: trk.id,
                title: trk.name,
                artist: trk.artists?.map(a => a.name).join(', ') || 'Unknown',
                primaryArtist: trk.artists?.[0]?.name || '',
                album: trk.album?.name || '',
                albumArt: trk.album?.images?.[0]?.url || trk.album?.images?.[1]?.url || null,
                previewUrl: trk.preview_url || null,
                durationMs: trk.duration_ms || 30000,
                category: 'My Songs'
              });
            }
          }
        }
      } catch (e) {
        if (e.response?.status === 401) throw e;
        console.warn('[SpotifyService] Recently played notice:', e.message);
      }

      // 4. Fetch User's Playlists Tracks (/me/playlists)
      try {
        const pRes = await axios.get('https://api.spotify.com/v1/me/playlists', {
          params: { limit: 10 },
          headers: { Authorization: `Bearer ${activeToken}` },
          timeout: 6000
        });
        if (pRes.data?.items) {
          for (const pl of pRes.data.items.slice(0, 5)) {
            try {
              const trkRes = await axios.get(`https://api.spotify.com/v1/playlists/${pl.id}/tracks`, {
                params: { limit: 30 },
                headers: { Authorization: `Bearer ${activeToken}` },
                timeout: 5000
              });
              if (trkRes.data?.items) {
                for (const item of trkRes.data.items) {
                  const trk = item.track;
                  if (trk?.name && trk?.id && !tracksMap.has(trk.id)) {
                    tracksMap.set(trk.id, {
                      spotifyId: trk.id,
                      title: trk.name,
                      artist: trk.artists?.map(a => a.name).join(', ') || 'Unknown',
                      primaryArtist: trk.artists?.[0]?.name || '',
                      album: trk.album?.name || '',
                      albumArt: trk.album?.images?.[0]?.url || trk.album?.images?.[1]?.url || null,
                      previewUrl: trk.preview_url || null,
                      durationMs: trk.duration_ms || 30000,
                      category: 'My Songs'
                    });
                  }
                }
              }
            } catch (e) {}
          }
        }
      } catch (e) {
        if (e.response?.status === 401) throw e;
      }

      return Array.from(tracksMap.values());
    };

    try {
      let tracks = [];
      try {
        tracks = await fetchWithToken(token);
      } catch (err) {
        if (err.response?.status === 401 && refreshToken) {
          console.log('[SpotifyService] 🔄 User access token expired for My Songs, refreshing...');
          const refreshed = await this.refreshUserAccessToken(refreshToken);
          if (refreshed?.accessToken) {
            token = refreshed.accessToken;
            // Update token in DB
            try {
              const { UserRepository } = await import('../repositories/UserRepository.js');
              const userRepo = new UserRepository();
              await userRepo.update(user.id, {
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken || refreshToken,
                tokenExpiresAt: refreshed.tokenExpiresAt
              });
            } catch (dbErr) {}

            tracks = await fetchWithToken(token);
          }
        } else {
          throw err;
        }
      }

      if (tracks.length > 0) {
        console.log(`[SpotifyService] 🎵 Loaded ${tracks.length} personalized Spotify songs for user ${user.username || userId}`);
        return tracks;
      }
    } catch (err) {
      console.error('[SpotifyService] ❌ Failed to fetch user personal tracks:', err.message);
    }

    return [];
  }

  /**
   * Searches Spotify catalog with MySQL database query caching and local file image caching.
   * Returns top 5 results.
   */
  async searchTracks(query, userAccessToken = null, limit = 5) {
    if (!query || query.trim() === '') return [];

    const cleanQuery = query.toLowerCase().trim();
    const effectiveLimit = Math.min(5, parseInt(limit) || 5);

    // 1. Check MySQL Database Cache first
    try {
      const dbCached = await SearchCache.findOne({
        where: { query: cleanQuery }
      });

      if (dbCached && dbCached.results) {
        // If results exist in DB and not expired, return immediately from database
        const isExpired = dbCached.expiresAt && new Date(dbCached.expiresAt) < new Date();
        if (!isExpired) {
          const parsed = typeof dbCached.results === 'string' ? JSON.parse(dbCached.results) : dbCached.results;
          return (parsed || []).slice(0, effectiveLimit);
        }
      }
    } catch (err) {
      console.warn('[SpotifyService] DB search cache read notice:', err.message);
    }

    let results = [];

    // 2. Try Live Spotify Search via App Token or User Token
    const token = (userAccessToken && !userAccessToken.startsWith('mock_')) 
      ? userAccessToken 
      : await this.getAppAccessToken();

    if (token) {
      try {
        const response = await axios.get('https://api.spotify.com/v1/search', {
          params: { q: cleanQuery, type: 'track', limit: effectiveLimit },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 4000
        });

        if (response.data?.tracks?.items?.length > 0) {
          results = response.data.tracks.items.map(item => ({
            spotifyId: item.id,
            title: item.name,
            artist: item.artists.map(a => a.name).join(', '),
            primaryArtist: item.artists[0]?.name || '',
            album: item.album.name,
            albumArt: item.album.images[0]?.url || item.album.images[1]?.url || null,
            previewUrl: item.preview_url,
            durationMs: item.duration_ms
          })).slice(0, effectiveLimit);
        }
      } catch (err) {
        console.warn('[SpotifyService] Live Spotify search notice:', err.response?.data?.error?.message || err.message);
      }
    }

    // 3. Secondary Global Fallback via iTunes Search API if Spotify returns empty
    if (results.length === 0) {
      try {
        const itunesRes = await axios.get('https://itunes.apple.com/search', {
          params: { term: cleanQuery, entity: 'song', limit: effectiveLimit },
          timeout: 3000
        });
        if (itunesRes.data?.results?.length > 0) {
          results = itunesRes.data.results.map(item => ({
            spotifyId: 'itunes_' + item.trackId,
            title: item.trackName,
            artist: item.artistName,
            primaryArtist: item.artistName,
            album: item.collectionName,
            albumArt: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : null,
            previewUrl: item.previewUrl,
            durationMs: item.trackTimeMillis
          })).slice(0, effectiveLimit);
        }
      } catch (err) {}
    }

    // 4. Tertiary local fallback catalog
    if (results.length === 0) {
      results = this.fallbackTracks.filter(t => 
        t.title.toLowerCase().includes(cleanQuery) || 
        t.artist.toLowerCase().includes(cleanQuery)
      ).slice(0, effectiveLimit);
    }

    // 5. Cache artwork files locally onto disk
    try {
      results = await imageCacheService.bulkCacheImages(results);
    } catch (err) {
      console.warn('[SpotifyService] Image caching notice:', err.message);
    }

    // 6. Save search results into MySQL Database SearchCache table
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days TTL
      await SearchCache.upsert({
        query: cleanQuery,
        results,
        expiresAt
      });
    } catch (err) {
      console.warn('[SpotifyService] DB search cache write notice:', err.message);
    }

    return results;
  }

  async searchArtists(query, userAccessToken = null, limit = 10) {
    if (!query || query.trim() === '') return [];

    const q = query.trim();
    let artists = [];

    const token = (userAccessToken && !userAccessToken.startsWith('mock_')) 
      ? userAccessToken 
      : await this.getAppAccessToken();

    if (token) {
      try {
        const response = await axios.get('https://api.spotify.com/v1/search', {
          params: { q, type: 'artist', limit: Math.min(10, limit) },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 4000
        });
        if (response.data?.artists?.items?.length > 0) {
          artists = response.data.artists.items.map(a => ({
            id: a.id,
            name: a.name,
            image: a.images[0]?.url || a.images[1]?.url || null,
            genres: a.genres?.slice(0, 2) || [],
            popularity: a.popularity
          }));
        }
      } catch (err) {
        console.warn('[SpotifyService] Live Spotify artist search notice:', err.message);
      }
    }

    if (artists.length === 0) {
      const lowerQ = q.toLowerCase();
      artists = this.fallbackArtists.filter(a => a.name.toLowerCase().includes(lowerQ)).slice(0, limit);
    }

    // Cache artist avatar images locally
    try {
      const enriched = await Promise.all(artists.map(async (art) => {
        if (art.image && !art.image.startsWith('/api/image/')) {
          const cachedImg = await imageCacheService.cacheImage(art.image);
          return { ...art, image: cachedImg };
        }
        return art;
      }));
      return enriched;
    } catch (err) {
      return artists;
    }
  }

  _normalizeArtistToken(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _isStrictArtistMatch(candidateArtistStr, targetQuery) {
    const normTarget = this._normalizeArtistToken(targetQuery);
    if (!normTarget || !candidateArtistStr) return false;
    const normTargetNoThe = normTarget.replace(/^the\s+/, '');

    const rawTokens = candidateArtistStr
      .split(/,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b|\bx\b|\//i)
      .map(s => this._normalizeArtistToken(s))
      .filter(Boolean);

    const fullNorm = this._normalizeArtistToken(candidateArtistStr);
    if (fullNorm && !rawTokens.includes(fullNorm)) {
      rawTokens.unshift(fullNorm);
    }

    return rawTokens.some(tok => {
      if (tok === normTarget) return true;
      const tokNoThe = tok.replace(/^the\s+/, '');
      return normTargetNoThe.length >= 3 && tokNoThe === normTargetNoThe;
    });
  }

  _isUnwantedArtistTrack(trackName = '', collectionName = '', artistName = '', targetQuery = '') {
    const haystack = `${trackName} ${collectionName} ${artistName}`.toLowerCase();
    const targetLower = (targetQuery || '').toLowerCase();
    const bannedTerms = [
      'karaoke', 'tribute', 'lullaby', 'cover', 'originally performed',
      'made famous', 'in the style of', '8-bit', 'ringtone', 'music box',
      'instrumental version'
    ];
    for (const term of bannedTerms) {
      if (haystack.includes(term) && !targetLower.includes(term)) {
        return true;
      }
    }
    return false;
  }

  _artistTrackPriority(track) {
    let score = track.previewUrl ? 100 : 0;
    const titleLower = (track.title || '').toLowerCase();
    if (!/\b(live|remaster|acoustic|remix|sped up|slowed|demo|instrumental)\b/i.test(titleLower)) {
      score += 20;
    }
    return score;
  }

  async getTopTracks(category = 'Global Trends', artistQuery = null, accessToken = null) {
    if (category === 'Artist' && artistQuery) {
      const q = artistQuery.trim();
      let artistTracks = [];

      const mapItunesItem = (item) => ({
        spotifyId: 'itunes_' + item.trackId,
        title: item.trackName,
        artist: item.artistName,
        primaryArtist: item.artistName,
        album: item.collectionName,
        albumArt: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : null,
        previewUrl: item.previewUrl,
        durationMs: item.trackTimeMillis,
        category: 'Artist'
      });

      const filterItunesResults = (items = []) => items.filter(t =>
        Boolean(t.previewUrl) &&
        this._isStrictArtistMatch(t.artistName, q) &&
        !this._isUnwantedArtistTrack(t.trackName, t.collectionName, t.artistName, q)
      );

      // 1. Fetch strict artist songs via iTunes Search API (ID first, then US if < 15)
      try {
        const idRes = await axios.get('https://itunes.apple.com/search', {
          params: { term: q, media: 'music', entity: 'song', attribute: 'artistTerm', country: 'ID', limit: 50 },
          timeout: 4500
        });
        const idFiltered = filterItunesResults(idRes.data?.results || []);
        artistTracks = idFiltered.map(mapItunesItem);

        if (artistTracks.length < 15) {
          const usRes = await axios.get('https://itunes.apple.com/search', {
            params: { term: q, media: 'music', entity: 'song', attribute: 'artistTerm', country: 'US', limit: 50 },
            timeout: 4500
          });
          const usFiltered = filterItunesResults(usRes.data?.results || []);
          artistTracks = [...artistTracks, ...usFiltered.map(mapItunesItem)];
        }
      } catch (err) {
        console.warn('[SpotifyService] iTunes artist track fetch notice:', err.message);
      }

      // 2. Secondary Spotify search with strict artist filter if needed
      if (artistTracks.length < 10) {
        const token = (accessToken && !accessToken.startsWith('mock_'))
          ? accessToken
          : await this.getAppAccessToken();

        if (token) {
          try {
            const spRes = await axios.get('https://api.spotify.com/v1/search', {
              params: { q: `artist:"${q}"`, type: 'track', limit: 25 },
              headers: { Authorization: `Bearer ${token}` },
              timeout: 4000
            });
            if (spRes.data?.tracks?.items?.length > 0) {
              const spTracks = spRes.data.tracks.items
                .filter(item => {
                  const fullArtist = item.artists.map(a => a.name).join(', ');
                  const matchesAny = item.artists.some(a => this._isStrictArtistMatch(a.name, q)) ||
                    this._isStrictArtistMatch(fullArtist, q);
                  return matchesAny && !this._isUnwantedArtistTrack(item.name, item.album?.name, fullArtist, q);
                })
                .map(item => ({
                  spotifyId: item.id,
                  title: item.name,
                  artist: item.artists.map(a => a.name).join(', '),
                  primaryArtist: item.artists[0]?.name || '',
                  album: item.album.name,
                  albumArt: item.album.images[0]?.url || item.album.images[1]?.url || null,
                  previewUrl: item.preview_url,
                  durationMs: item.duration_ms,
                  category: 'Artist'
                }));
              artistTracks = [...artistTracks, ...spTracks];
            }
          } catch (err) {}
        }
      }

      // 3. Match from local fallback using strict artist matching
      const localMatches = this.fallbackTracks
        .filter(t =>
          this._isStrictArtistMatch(t.artist, q) &&
          !this._isUnwantedArtistTrack(t.title, t.album, t.artist, q)
        )
        .map(t => ({ ...t, category: 'Artist' }));
      artistTracks = [...artistTracks, ...localMatches];

      // 4. Deduplicate by normalized song title (prefer tracks with previewUrl & original versions)
      const trackByNormTitle = new Map();
      for (const t of artistTracks) {
        const normTitle = Normalizer.normalizeTitle(t.title) || (t.title || '').toLowerCase().trim();
        if (!normTitle) continue;
        const existing = trackByNormTitle.get(normTitle);
        if (!existing || this._artistTrackPriority(t) > this._artistTrackPriority(existing)) {
          trackByNormTitle.set(normTitle, t);
        }
      }

      const uniqueTracks = Array.from(trackByNormTitle.values());
      if (uniqueTracks.length > 0) {
        return await imageCacheService.bulkCacheImages(uniqueTracks);
      }
      return [];
    }

    // 1. Nostalgia < 2000 Category
    if (category === 'Nostalgia < 2000' || category === 'Nostalgia' || category === '2000s Below') {
      let nostalgiaTracks = this.fallbackTracks.filter(t => t.category === 'Nostalgia < 2000');
      
      const subChoice = (artistQuery || '').toUpperCase().trim();
      if (subChoice === 'INDO' || subChoice === 'ID' || subChoice === 'INDONESIA') {
        nostalgiaTracks = nostalgiaTracks.filter(t => t.region === 'ID');
      } else if (subChoice === 'GLOBAL' || subChoice === 'BARAT' || subChoice === 'WESTERN') {
        nostalgiaTracks = nostalgiaTracks.filter(t => t.region === 'GLOBAL');
      }
      
      return await imageCacheService.bulkCacheImages(nostalgiaTracks);
    }

    // 2. Dynamic Daily Chart Fetching for Global Trends & Indonesia Trends
    if (category === 'Global Trends' || category === 'Indonesia Trends') {
      const countryCode = category === 'Indonesia Trends' ? 'id' : 'us';
      const chartKey = category;

      // Check if daily cache is valid (12 hour TTL)
      if (
        this.dailyCharts[chartKey]?.data?.length > 0 &&
        Date.now() < this.dailyCharts[chartKey].expiresAt
      ) {
        return this.dailyCharts[chartKey].data;
      }

      // Fetch live daily updated Top 50 chart
      try {
        const dailyTracks = await this._fetchDailyChart(countryCode, chartKey);
        const fallbackSubset = this.fallbackTracks.filter(t => t.category === chartKey);

        // Merge daily live tracks with curated catalog (avoiding duplicate titles)
        const seen = new Set();
        const combined = [];

        for (const t of [...dailyTracks, ...fallbackSubset]) {
          const key = `${(t.title || '').toLowerCase().trim()}_${(t.artist || '').toLowerCase().trim()}`;
          if (!seen.has(key)) {
            seen.add(key);
            combined.push(t);
          }
        }

        if (combined.length > 0) {
          const cachedCombined = await imageCacheService.bulkCacheImages(combined);
          this.dailyCharts[chartKey] = {
            data: cachedCombined,
            expiresAt: Date.now() + 12 * 3600 * 1000 // 12 hours
          };
          console.log(`✅ [SpotifyService] Refreshed daily ${chartKey} chart: ${combined.length} songs active`);
          return cachedCombined;
        }
      } catch (err) {
        console.warn(`[SpotifyService] Daily chart fallback notice for ${chartKey}:`, err.message);
      }
    }

    if (category === 'Indonesia Trends') {
      return this.fallbackTracks.filter(t => t.category === 'Indonesia Trends');
    }

    if (category === 'My Songs') {
      return this.fallbackTracks;
    }

    return this.fallbackTracks.filter(t => t.category === 'Global Trends');
  }

  /**
   * Fetches official Spotify Top 50 Playlist (Global: 37i9dQZEVXbMDoHDwVN2tF, Indo: 37i9dQZEVXbObFQZ3JLcXt)
   */
  async _fetchDailyChart(countryCode = 'us', categoryName = 'Global Trends') {
    const playlistId = (categoryName === 'Indonesia Trends' || countryCode === 'id') 
      ? '37i9dQZEVXbObFQZ3JLcXt' 
      : '37i9dQZEVXbMDoHDwVN2tF';

    try {
      console.log(`[SpotifyService] Fetching official Spotify Playlist: ${playlistId} (${categoryName})...`);
      const url = `https://open.spotify.com/embed/playlist/${playlistId}`;
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 8000
      });

      const nextDataMatch = res.data.match(/<script id=\"__NEXT_DATA__\" type=\"application\/json\">(.*?)<\/script>/s);
      if (nextDataMatch) {
        const raw = JSON.parse(nextDataMatch[1]);
        const list = raw.props?.pageProps?.state?.data?.entity?.trackList || [];

        if (Array.isArray(list) && list.length > 0) {
          // Concurrently enrich tracks with album art & previews
          const tracks = await Promise.all(list.map(async (t, idx) => {
            const spotifyId = t.uri ? t.uri.replace('spotify:track:', '') : `sp_${playlistId}_${idx}`;
            const title = t.title || 'Unknown Title';
            const artist = (t.subtitle || '').replace(/\u00a0/g, ' ').trim();
            const primaryArtist = artist.split(',')[0].split('&')[0].trim();
            let previewUrl = t.audioPreview?.url || null;
            let albumArt = null;

            // Fetch high-res album art via Spotify oEmbed or iTunes
            if (spotifyId && !spotifyId.startsWith('mock_')) {
              try {
                const oembedRes = await axios.get(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${spotifyId}`, { timeout: 2000 });
                if (oembedRes.data?.thumbnail_url) {
                  albumArt = oembedRes.data.thumbnail_url;
                }
              } catch (e) {}
            }

            // Fallback preview URL if audioPreview not embedded
            if (!previewUrl) {
              try {
                const itunesRes = await axios.get('https://itunes.apple.com/search', {
                  params: { term: `${artist} ${title}`, entity: 'song', limit: 1 },
                  timeout: 2000
                });
                if (itunesRes.data?.results?.[0]) {
                  const it = itunesRes.data.results[0];
                  previewUrl = it.previewUrl || null;
                  if (!albumArt && it.artworkUrl100) {
                    albumArt = it.artworkUrl100.replace('100x100bb', '600x600bb');
                  }
                }
              } catch (e) {}
            }

            return {
              spotifyId: `spotify_${spotifyId}`,
              title,
              artist,
              primaryArtist,
              album: title,
              albumArt,
              previewUrl,
              category: categoryName
            };
          }));

          console.log(`✅ [SpotifyService] Successfully extracted ${tracks.length} tracks from Spotify Playlist ${playlistId}`);
          return tracks;
        }
      }
    } catch (err) {
      console.warn(`[SpotifyService] Official Spotify playlist fetch notice for ${playlistId}:`, err.message);
    }

    // Secondary fallback: iTunes RSS
    try {
      const url = `https://itunes.apple.com/${countryCode}/rss/topsongs/limit=50/json`;
      const res = await axios.get(url, { timeout: 4500 });
      const entries = res.data?.feed?.entry;

      if (Array.isArray(entries) && entries.length > 0) {
        return entries.map((e, idx) => {
          const title = e['im:name']?.label || '';
          const artist = e['im:artist']?.label || '';
          const rawImg = e['im:image']?.[2]?.label || e['im:image']?.[1]?.label || null;
          const albumArt = rawImg ? rawImg.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null;
          const previewUrl = e['link']?.find(l => l.attributes?.type?.includes('audio'))?.attributes?.href || null;
          const trackId = e['id']?.attributes?.['im:id'] || `daily_${countryCode}_${idx}`;

          return {
            spotifyId: `daily_${countryCode}_${trackId}`,
            title,
            artist,
            primaryArtist: artist.split('&')[0].split(',')[0].trim(),
            album: e['im:collection']?.['im:name']?.label || title,
            albumArt,
            previewUrl,
            category: categoryName
          };
        });
      }
    } catch (err) {
      console.warn(`[SpotifyService] Secondary daily chart fetch error for ${countryCode}:`, err.message);
    }
    return [];
  }

  _initFallbackArtists() {
    return [
      { id: 'art_1', name: 'The Weeknd', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/a6/6e/bf/a66ebf79-5008-8948-b352-a790fc87446b/19UM1IM04638.rgb.jpg/600x600bb.jpg', genres: ['pop', 'r&b'] },
      { id: 'art_2', name: 'Taylor Swift', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/49/3d/ab/493dab54-f920-9043-6181-80993b8116c9/19UMGIM53909.rgb.jpg/600x600bb.jpg', genres: ['pop', 'country'] },
      { id: 'art_3', name: 'Bruno Mars', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/600x600bb.jpg', genres: ['pop', 'funk'] },
      { id: 'art_4', name: 'Bernadya', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/d8/bb/8c/d8bb8c81-ddb9-e427-a18b-c385afae12c2/23UMGIM65225.rgb.jpg/600x600bb.jpg', genres: ['indie pop', 'indonesian'] },
      { id: 'art_5', name: 'Hindia', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/83/f6/8f/83f68f0a-8a30-9653-a3e2-dc37d9714946/cover.jpg/600x600bb.jpg', genres: ['indie rock', 'indonesian'] },
      { id: 'art_6', name: 'Mahalini', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/ee/3c/96/ee3c9611-4be3-c95d-831a-1b85048c545f/cover.jpg/600x600bb.jpg', genres: ['pop', 'indonesian'] },
      { id: 'art_7', name: 'Billie Eilish', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d3/18/f3/d318f3a3-9828-56f8-9844-3114d485065c/24UMGIM37060.rgb.jpg/600x600bb.jpg', genres: ['alt pop', 'electropop'] },
      { id: 'art_8', name: 'Coldplay', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/f5/93/8c/f5938c49-964c-31d1-4b33-78b634f71fb7/190295978075.jpg/600x600bb.jpg', genres: ['rock', 'pop'] },
      { id: 'art_9', name: 'Tulus', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ce/26/fa/ce26fa32-9cb7-76fe-a289-53e30d41f021/859758784742_cover.jpg/600x600bb.jpg', genres: ['pop', 'jazz', 'indonesian'] },
      { id: 'art_10', name: 'Dua Lipa', image: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1e/8c/99/1e8c99eb-53a5-bc49-b541-ef171b3e839e/190295058784.jpg/600x600bb.jpg', genres: ['dance pop', 'disco'] }
    ];
  }

  _initFallbackCatalog() {
    return [
      // ==========================================
      // GLOBAL TRENDS (60+ Hits with Real High-Res Cover Art)
      // ==========================================
      { spotifyId: 'tr_g_1', title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/a6/6e/bf/a66ebf79-5008-8948-b352-a790fc87446b/19UM1IM04638.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_2', title: 'Save Your Tears', artist: 'The Weeknd', album: 'After Hours', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/4a/c3/ca/4ac3cac2-2d12-1f48-a00d-5be763d308f2/20UMGIM08434.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_3', title: 'Starboy', artist: 'The Weeknd', album: 'Starboy', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/21/f2/85/21f285fb-5b32-beec-df1d-0453715c0e18/16UMGIM52317.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_4', title: 'The Hills', artist: 'The Weeknd', album: 'Beauty Behind the Madness', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/0d/1a/0c/0d1a0c8b-6be6-a97e-d450-48283a8b417b/15UMGIM26760.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_5', title: 'Die For You', artist: 'The Weeknd', album: 'Starboy', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/21/f2/85/21f285fb-5b32-beec-df1d-0453715c0e18/16UMGIM52317.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_6', title: 'Yellow', artist: 'Coldplay', album: 'Parachutes', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/f5/93/8c/f5938c49-964c-31d1-4b33-78b634f71fb7/190295978075.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_7', title: 'Viva La Vida', artist: 'Coldplay', album: 'Viva La Vida', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/91/3c/65/913c65c3-1d21-f925-45cf-a0e28f3226a2/00094639904253.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_8', title: 'Fix You', artist: 'Coldplay', album: 'X&Y', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/05/27/ef/0527ef9d-8eb7-ce54-1594-555fb77e5c6e/00094631128053.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_9', title: 'The Scientist', artist: 'Coldplay', album: 'A Rush of Blood to the Head', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/9e/a0/0b/9ea00b65-7489-ebba-bcf1-0e1a1204689b/0724354050454.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_10', title: 'Something Just Like This', artist: 'The Chainsmokers, Coldplay', album: 'Memories...Do Not Open', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/37/10/7c/37107c13-a41a-a53d-d34e-4f7f52cae7ce/886446416954.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_11', title: '24K Magic', artist: 'Bruno Mars', album: '24K Magic', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_12', title: 'That\'s What I Like', artist: 'Bruno Mars', album: '24K Magic', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_13', title: 'Locked Out of Heaven', artist: 'Bruno Mars', album: 'Unorthodox Jukebox', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/1c/b4/2c/1cb42c73-4ea2-1f41-e40a-5b1eb73f32e9/075679958372.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_14', title: 'When I Was Your Man', artist: 'Bruno Mars', album: 'Unorthodox Jukebox', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/1c/b4/2c/1cb42c73-4ea2-1f41-e40a-5b1eb73f32e9/075679958372.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_15', title: 'Treasure', artist: 'Bruno Mars', album: 'Unorthodox Jukebox', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/1c/b4/2c/1cb42c73-4ea2-1f41-e40a-5b1eb73f32e9/075679958372.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_16', title: 'Uptown Funk', artist: 'Mark Ronson, Bruno Mars', album: 'Uptown Special', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/bd/10/a5/bd10a56f-23ea-7ff1-aebf-4f2747196655/886444907157.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_17', title: 'Die With A Smile', artist: 'Lady Gaga, Bruno Mars', album: 'Die With A Smile', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/ef/0a/e7/ef0ae732-c7f4-b2ca-59f3-8b74bb2a9d61/24UMGIM89620.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_18', title: 'Cruel Summer', artist: 'Taylor Swift', album: 'Lover', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/49/3d/ab/493dab54-f920-9043-6181-80993b8116c9/19UMGIM53909.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_19', title: 'Anti-Hero', artist: 'Taylor Swift', album: 'Midnights', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/e5/13/ee/e513ee63-7186-b481-ac61-ffba65123d6a/22UM1IM11060.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_20', title: 'Blank Space', artist: 'Taylor Swift', album: '1989', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/90/a6/50/90a650d0-0f2c-e162-8178-0e7368d1844a/14UMGIM51717.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_21', title: 'Shake It Off', artist: 'Taylor Swift', album: '1989', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/90/a6/50/90a650d0-0f2c-e162-8178-0e7368d1844a/14UMGIM51717.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_22', title: 'Love Story', artist: 'Taylor Swift', album: 'Fearless', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/ea/e6/8c/eae68cb8-724f-efd2-0cb2-1e96a41f6a15/00843930007134.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_23', title: 'Style', artist: 'Taylor Swift', album: '1989', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/90/a6/50/90a650d0-0f2c-e162-8178-0e7368d1844a/14UMGIM51717.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_24', title: 'BIRDS OF A FEATHER', artist: 'Billie Eilish', album: 'HIT ME HARD AND SOFT', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/d3/18/f3/d318f3a3-9828-56f8-9844-3114d485065c/24UMGIM37060.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_25', title: 'bad guy', artist: 'Billie Eilish', album: 'WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/80/e7/8c/80e78cfa-555e-0498-89c0-67c9c0490983/19UMGIM08257.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_26', title: 'lovely', artist: 'Billie Eilish, Khalid', album: 'lovely', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/64/7b/25/647b2582-7360-15ef-7965-03ad2190ee0d/18UMGIM22369.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_27', title: 'ocean eyes', artist: 'Billie Eilish', album: 'dont smile at me', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/68/76/89/68768994-399d-16f3-a764-bbcf086eb293/17UMGIM95147.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_28', title: 'Happier Than Ever', artist: 'Billie Eilish', album: 'Happier Than Ever', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a6/b9/f8/a6b9f848-8df0-7d34-7561-820875e523f3/21UMGIM37060.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_29', title: 'Shape of You', artist: 'Ed Sheeran', album: '÷ (Divide)', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/37/66/ec/3766ecc3-1f19-a1b7-a8b2-b13c1fa87702/190295851286.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_30', title: 'Perfect', artist: 'Ed Sheeran', album: '÷ (Divide)', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/37/66/ec/3766ecc3-1f19-a1b7-a8b2-b13c1fa87702/190295851286.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_31', title: 'Bad Habits', artist: 'Ed Sheeran', album: '=', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/d9/78/3f/d9783f98-999a-eb2b-ce49-9f7a76e053cb/190296657030.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_32', title: 'Photograph', artist: 'Ed Sheeran', album: 'x', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/10/d8/d5/10d8d5df-eb28-761e-1f7c-728bdf613d96/0825646284511.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_33', title: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1e/8c/99/1e8c99eb-53a5-bc49-b541-ef171b3e839e/190295058784.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_34', title: 'Don\'t Start Now', artist: 'Dua Lipa', album: 'Future Nostalgia', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1e/8c/99/1e8c99eb-53a5-bc49-b541-ef171b3e839e/190295058784.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_35', title: 'New Rules', artist: 'Dua Lipa', album: 'Dua Lipa', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/71/61/89/716189ef-fa69-906d-e4fb-b14cf605d3b6/190295806446.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_36', title: 'Dance The Night', artist: 'Dua Lipa', album: 'Barbie The Album', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/05/1f/26/051f26e5-eb65-4fa7-ee6a-2d9d1be69399/075679684998.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_37', title: 'As It Was', artist: 'Harry Styles', album: 'Harry\'s House', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/91/9f/8e/919f8e40-bb57-b0a3-bf2e-06ee78ea0b74/886449998631.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_38', title: 'Watermelon Sugar', artist: 'Harry Styles', album: 'Fine Line', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/44/22/a3/4422a36b-67a3-e74a-d68f-91e85f0ef352/886448043691.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_39', title: 'Sign of the Times', artist: 'Harry Styles', album: 'Harry Styles', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/3d/5e/a4/3d5ea4e4-73bc-e3fb-7fa1-3a552597406a/886446462715.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_40', title: 'Stay', artist: 'The Kid LAROI, Justin Bieber', album: 'F*CK LOVE 3: OVER YOU', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/89/59/64/89596489-3221-a590-db98-f29e37340b07/886449449911.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_41', title: 'Ghost', artist: 'Justin Bieber', album: 'Justice', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e0/92/d2/e092d242-b91b-689e-257f-2736b4aa7a27/21UMGIM19551.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_42', title: 'Peaches', artist: 'Justin Bieber, Daniel Caesar, Giveon', album: 'Justice', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/e0/92/d2/e092d242-b91b-689e-257f-2736b4aa7a27/21UMGIM19551.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_43', title: 'Love Yourself', artist: 'Justin Bieber', album: 'Purpose', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/75/11/87/75118742-1e96-a979-43c3-300c1e0e84b8/15UMGIM61661.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_44', title: 'Espresso', artist: 'Sabrina Carpenter', album: 'Short n\' Sweet', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/57/e8/74/57e87453-ca2d-c205-090a-a91217fc04be/24UMGIM47660.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_45', title: 'Please Please Please', artist: 'Sabrina Carpenter', album: 'Short n\' Sweet', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c9/a3/e3/c9a3e351-4034-7a0e-7c5b-4395e54d89a2/24UMGIM62202.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_46', title: 'Taste', artist: 'Sabrina Carpenter', album: 'Short n\' Sweet', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/57/e8/74/57e87453-ca2d-c205-090a-a91217fc04be/24UMGIM47660.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_47', title: 'vampire', artist: 'Olivia Rodrigo', album: 'GUTS', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/08/9e/02/089e02c6-d9b8-390b-1934-fc0bcf84ec1c/23UMGIM68426.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_48', title: 'drivers license', artist: 'Olivia Rodrigo', album: 'SOUR', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/02/ed/8d/02ed8dd2-c361-b51f-d39b-136b32ea9f82/21UMGIM08257.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_49', title: 'good 4 u', artist: 'Olivia Rodrigo', album: 'SOUR', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/02/ed/8d/02ed8dd2-c361-b51f-d39b-136b32ea9f82/21UMGIM08257.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_50', title: 'Sugar', artist: 'Maroon 5', album: 'V', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/b7/25/74/b72574e4-7cb6-419b-c4c0-0382025fbc70/14UMGIM36760.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_51', title: 'Memories', artist: 'Maroon 5', album: 'JORDI', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/22/58/56/2258564b-5778-d42d-20be-7e287a912bb1/21UMGIM36760.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_52', title: 'Payphone', artist: 'Maroon 5, Wiz Khalifa', album: 'Overexposed', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/e5/47/31/e5473180-2c7c-473d-9d41-e94f8373b9e4/12UMGIM22369.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_53', title: 'Attention', artist: 'Charlie Puth', album: 'Voicenotes', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/a8/e2/1e/a8e21e64-500b-dc60-dfa0-c651f82522ca/075679888969.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_54', title: 'We Don\'t Talk Anymore', artist: 'Charlie Puth, Selena Gomez', album: 'Nine Track Mind', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/7e/05/f2/7e05f242-99ca-b44c-3580-c11f7c5e2d63/075679919519.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_55', title: 'Believer', artist: 'Imagine Dragons', album: 'Evolve', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/1f/fa/00/1ffa0064-07ec-88c9-598d-a4178a946b5a/17UMGIM36760.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_56', title: 'Demons', artist: 'Imagine Dragons', album: 'Night Visions', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/1f/fa/00/1ffa0064-07ec-88c9-598d-a4178a946b5a/17UMGIM36760.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_57', title: 'Wake Me Up', artist: 'Avicii', album: 'True', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/18/5b/1a/185b1a3e-fcce-0186-b4d4-4dbbc9796dc6/13UMGIM36760.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_58', title: 'The Nights', artist: 'Avicii', album: 'The Days / Nights', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/35/4d/a4/354da4c3-1c05-f9bb-0062-817db445a6c4/14UMGIM52317.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },

      { spotifyId: 'tr_g_59', title: 'Counting Stars', artist: 'OneRepublic', album: 'Native', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/b5/0a/bb/b50abb1a-6415-46aa-ab69-4fe1dcf4a6a5/13UMGIM08257.rgb.jpg/600x600bb.jpg', category: 'Global Trends' },
      { spotifyId: 'tr_g_60', title: 'Someone Like You', artist: 'Adele', album: '21', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/eb/ca/2c/ebca2c9b-f975-f975-d142-ff7b63f2713e/886445610261.jpg/600x600bb.jpg', category: 'Global Trends' },

      // ==========================================
      // INDONESIA TRENDS (45+ Indo Hits with Real Album Art)
      // ==========================================
      { spotifyId: 'tr_id_1', title: 'Satu Bulan', artist: 'Bernadya', album: 'Sialnya, Hidup Harus Tetap Berjalan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/d8/bb/8c/d8bb8c81-ddb9-e427-a18b-c385afae12c2/23UMGIM65225.rgb.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_2', title: 'Kata Mereka Ini Berlebihan', artist: 'Bernadya', album: 'Sialnya, Hidup Harus Tetap Berjalan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/d8/bb/8c/d8bb8c81-ddb9-e427-a18b-c385afae12c2/23UMGIM65225.rgb.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_3', title: 'Kini Mereka Tahu', artist: 'Bernadya', album: 'Sialnya, Hidup Harus Tetap Berjalan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/3c/57/0d/3c570d5e-d595-65fc-d0ec-f04eb58c6792/24UMGIM47660.rgb.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_4', title: 'Untungnya, Hidup Harus Tetap Berjalan', artist: 'Bernadya', album: 'Sialnya, Hidup Harus Tetap Berjalan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/d8/bb/8c/d8bb8c81-ddb9-e427-a18b-c385afae12c2/23UMGIM65225.rgb.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      { spotifyId: 'tr_id_5', title: 'Evaluasi', artist: 'Hindia', album: 'Menari Dengan Bayangan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/83/f6/8f/83f68f0a-8a30-9653-a3e2-dc37d9714946/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_6', title: 'Rumah Ke Rumah', artist: 'Hindia', album: 'Menari Dengan Bayangan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/83/f6/8f/83f68f0a-8a30-9653-a3e2-dc37d9714946/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_7', title: 'Secukupnya', artist: 'Hindia', album: 'Menari Dengan Bayangan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/83/f6/8f/83f68f0a-8a30-9653-a3e2-dc37d9714946/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_8', title: 'Membasuh', artist: 'Hindia, Rara Sekar', album: 'Menari Dengan Bayangan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music123/v4/83/f6/8f/83f68f0a-8a30-9653-a3e2-dc37d9714946/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      { spotifyId: 'tr_id_9', title: 'Sial', artist: 'Mahalini', album: 'Fábula', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/ee/3c/96/ee3c9611-4be3-c95d-831a-1b85048c545f/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_10', title: 'Mati-Matian', artist: 'Mahalini', album: 'Mati-Matian', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/ee/3c/96/ee3c9611-4be3-c95d-831a-1b85048c545f/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_11', title: 'Sisa Rasa', artist: 'Mahalini', album: 'Fábula', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/ee/3c/96/ee3c9611-4be3-c95d-831a-1b85048c545f/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_12', title: 'Melawan Restu', artist: 'Mahalini', album: 'Fábula', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/ee/3c/96/ee3c9611-4be3-c95d-831a-1b85048c545f/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_13', title: 'Kisah Sempurna', artist: 'Mahalini', album: 'Fábula', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/ee/3c/96/ee3c9611-4be3-c95d-831a-1b85048c545f/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      { spotifyId: 'tr_id_14', title: 'Hati-Hati di Jalan', artist: 'Tulus', album: 'Manusia', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ce/26/fa/ce26fa32-9cb7-76fe-a289-53e30d41f021/859758784742_cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_15', title: 'Interaksi', artist: 'Tulus', album: 'Manusia', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ce/26/fa/ce26fa32-9cb7-76fe-a289-53e30d41f021/859758784742_cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_16', title: 'Diri', artist: 'Tulus', album: 'Manusia', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ce/26/fa/ce26fa32-9cb7-76fe-a289-53e30d41f021/859758784742_cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_17', title: 'Monokrom', artist: 'Tulus', album: 'Monokrom', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ce/26/fa/ce26fa32-9cb7-76fe-a289-53e30d41f021/859758784742_cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_18', title: 'Gajah', artist: 'Tulus', album: 'Gajah', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ce/26/fa/ce26fa32-9cb7-76fe-a289-53e30d41f021/859758784742_cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      { spotifyId: 'tr_id_19', title: 'Gala Bunga Matahari', artist: 'Sal Priadi', album: 'MARKERS AND SUCH PENS FLASHDISKS', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/cf/c4/dc/cfc4dc27-fc19-8671-55ec-ec946b5a3eb7/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_20', title: 'Dari Planet Lain', artist: 'Sal Priadi', album: 'MARKERS AND SUCH PENS FLASHDISKS', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/cf/c4/dc/cfc4dc27-fc19-8671-55ec-ec946b5a3eb7/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_21', title: 'Mesra-mesraannya kecil-kecilan dulu', artist: 'Sal Priadi', album: 'MARKERS AND SUCH PENS FLASHDISKS', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/cf/c4/dc/cfc4dc27-fc19-8671-55ec-ec946b5a3eb7/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      { spotifyId: 'tr_id_22', title: 'Rayuan Perempuan Gila', artist: 'Nadin Amizah', album: 'Untuk Dunia, Cinta, dan Kotornya', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/69/0a/df/690adf52-0941-866d-1bf2-e9a18413bca4/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_23', title: 'Sorai', artist: 'Nadin Amizah', album: 'Selamat Ulang Tahun', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/7c/4f/77/7c4f77c3-78f9-4673-a558-e4b2d354b373/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_24', title: 'Bertaut', artist: 'Nadin Amizah', album: 'Selamat Ulang Tahun', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/7c/4f/77/7c4f77c3-78f9-4673-a558-e4b2d354b373/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_25', title: 'Semua Aku Dirayakan', artist: 'Nadin Amizah', album: 'Untuk Dunia, Cinta, dan Kotornya', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/69/0a/df/690adf52-0941-866d-1bf2-e9a18413bca4/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      { spotifyId: 'tr_id_26', title: 'Komang', artist: 'Raim Laode', album: 'Komang', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/c3/0f/55/c30f5539-7756-34d2-d853-43f140656a81/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_27', title: 'Bunga Abadi', artist: 'Rio Clappy', album: 'Bunga Abadi', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/f5/93/8c/f5938c49-964c-31d1-4b33-78b634f71fb7/190295978075.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_28', title: 'Jiwa Yang Bersedih', artist: 'Ghea Indrawari', album: 'Jiwa Yang Bersedih', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/71/ea/06/71ea0622-c820-a61a-7b3b-d106198f3c7e/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_29', title: 'Tak Segampang Itu', artist: 'Anggi Marito', album: 'Tak Segampang Itu', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/b8/93/ea/b893ea30-8025-a130-9b62-97b7cb7a5a87/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      { spotifyId: 'tr_id_30', title: 'Dan', artist: 'Sheila On 7', album: 'Sheila On 7', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_31', title: 'Sephia', artist: 'Sheila On 7', album: 'Kisah Klasik Untuk Masa Depan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_32', title: 'Melompat Lebih Tinggi', artist: 'Sheila On 7', album: '07 Des', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_33', title: 'Lapang Dada', artist: 'Sheila On 7', album: 'Musim Yang Baik', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_34', title: 'Sebuah Kisah Klasik', artist: 'Sheila On 7', album: 'Kisah Klasik Untuk Masa Depan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      { spotifyId: 'tr_id_35', title: 'Kangen', artist: 'Dewa 19', album: '19', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_36', title: 'Pupus', artist: 'Dewa 19', album: 'Cintailah Cinta', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_37', title: 'Risalah Hati', artist: 'Dewa 19', album: 'Bintang Lima', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_38', title: 'Separuh Nafas', artist: 'Dewa 19', album: 'Bintang Lima', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      { spotifyId: 'tr_id_39', title: 'Separuh Aku', artist: 'NOAH', album: 'Seperti Seharusnya', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_40', title: 'Menghapus Jejakmu', artist: 'Peterpan', album: 'Hari yang Cerah', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_41', title: 'Yang Terdalam', artist: 'Peterpan', album: 'Taman Langit', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      { spotifyId: 'tr_id_42', title: 'Lantas', artist: 'Juicy Luicy', album: 'Sentimental', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/64/08/42/640842e4-bf2a-c21d-91b7-7e618f3ef4d4/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_43', title: 'Sialan', artist: 'Juicy Luicy, Adrian Khalif', album: 'Sialan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/64/08/42/640842e4-bf2a-c21d-91b7-7e618f3ef4d4/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      { spotifyId: 'tr_id_44', title: 'Seandainya', artist: 'Vierratale', album: 'My First Love', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/71/4e/af/714eafc2-a9b0-a5e2-e1d5-bc44093fc4d7/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },
      { spotifyId: 'tr_id_45', title: 'Rasa Ini', artist: 'Vierratale', album: 'My First Love', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/71/4e/af/714eafc2-a9b0-a5e2-e1d5-bc44093fc4d7/cover.jpg/600x600bb.jpg', category: 'Indonesia Trends' },

      // ==========================================
      // NOSTALGIA < 2000 (Hits Legendaris 70s, 80s, 90s Indo & Barat)
      // ==========================================
      // -- INDO LEGENDS < 2000 --
      { spotifyId: 'tr_old_1', title: 'Kala Cinta Menggoda', artist: 'Chrisye', album: 'Kala Cinta Menggoda', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_2', title: 'Pergilah Kasih', artist: 'Chrisye', album: 'Pergilah Kasih', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_3', title: 'Aku Cinta Dia', artist: 'Chrisye', album: 'Aku Cinta Dia', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_4', title: 'Cintaku', artist: 'Chrisye', album: 'Badai Pasti Berlalu', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_5', title: 'Lilin - Lilin Kecil', artist: 'Chrisye', album: 'Jurang Pemisah', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },

      { spotifyId: 'tr_old_6', title: 'Kangen', artist: 'Dewa 19', album: '19', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_7', title: 'Cukup Siti Nurbaya', artist: 'Dewa 19', album: 'Terbaik Terbaik', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_8', title: 'Aku Milikmu', artist: 'Dewa 19', album: 'Format Masa Depan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_9', title: 'Kirana', artist: 'Dewa 19', album: 'Pandawa Lima', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_10', title: 'Kamulah Satu-Satunya', artist: 'Dewa 19', album: 'Pandawa Lima', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },

      { spotifyId: 'tr_old_11', title: 'Dan', artist: 'Sheila On 7', album: 'Sheila On 7', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_12', title: 'Kita', artist: 'Sheila On 7', album: 'Sheila On 7', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_13', title: 'Anugerah Terindah Yang Pernah Kumiliki', artist: 'Sheila On 7', album: 'Sheila On 7', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },

      { spotifyId: 'tr_old_14', title: 'Terlalu Manis', artist: 'Slank', album: 'Kampungan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_15', title: 'Kamu Harus Pulang', artist: 'Slank', album: 'Generasi Biru', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_16', title: 'Mawar Merah', artist: 'Slank', album: 'Kampungan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_17', title: 'Balikin', artist: 'Slank', album: 'Tujuh', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },

      { spotifyId: 'tr_old_18', title: 'Bintang Kehidupan', artist: 'Nike Ardilla', album: 'Bintang Kehidupan', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/71/ea/06/71ea0622-c820-a61a-7b3b-d106198f3c7e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_19', title: 'Sandiwara Cinta', artist: 'Nike Ardilla', album: 'Sandiwara Cinta', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/71/ea/06/71ea0622-c820-a61a-7b3b-d106198f3c7e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_20', title: 'Seberkas Sinar', artist: 'Nike Ardilla', album: 'Seberkas Sinar', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/71/ea/06/71ea0622-c820-a61a-7b3b-d106198f3c7e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },

      { spotifyId: 'tr_old_21', title: 'Bento', artist: 'Iwan Fals, Swami', album: 'Swami I', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_22', title: 'Bongkar', artist: 'Iwan Fals, Swami', album: 'Swami I', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_23', title: 'Surat Buat Wakil Rakyat', artist: 'Iwan Fals', album: 'Wakil Rakyat', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_24', title: 'Yang Terlupakan', artist: 'Iwan Fals', album: 'Sarjana Muda', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },

      { spotifyId: 'tr_old_25', title: 'Yogyakarta', artist: 'KLa Project', album: 'KLa', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_26', title: 'Tak Bisa Ke Lain Hati', artist: 'KLa Project', album: 'Pasir Putih', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_27', title: 'Janji', artist: 'Gigi', album: 'Dunia', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_28', title: 'Terbang', artist: 'Gigi', album: 'Kilas Balik', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_29', title: 'Sobat', artist: 'Padi', album: 'Lain Dunia', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_30', title: 'Mahadewi', artist: 'Padi', album: 'Lain Dunia', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_31', title: 'Cantik', artist: 'Kahitna', album: 'Cantik', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_32', title: 'Cerita Cinta', artist: 'Kahitna', album: 'Cerita Cinta', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_33', title: 'Pertama', artist: 'Reza Artamevia', album: 'Keajaiban', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_34', title: 'Bukan Pujangga', artist: 'Base Jam', album: 'Ti3a', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/5a/04/b8/5a04b868-608a-ea3f-e8b8-b4b10fa2e3c0/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_35', title: 'Berita Kepada Kawan', artist: 'Ebiet G. Ade', album: 'Camellia II', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },
      { spotifyId: 'tr_old_36', title: 'Burung Camar', artist: 'Vina Panduwinata', album: 'Burung Camar', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/2a/3c/69/2a3c69ce-c50f-23f2-1bba-e3f350c33a9e/cover.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'ID' },

      // -- GLOBAL / WESTERN LEGENDS < 2000 --
      { spotifyId: 'tr_old_37', title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/a6/6e/bf/a66ebf79-5008-8948-b352-a790fc87446b/19UM1IM04638.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_38', title: 'Don\'t Stop Me Now', artist: 'Queen', album: 'Jazz', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/a6/6e/bf/a66ebf79-5008-8948-b352-a790fc87446b/19UM1IM04638.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_39', title: 'We Will Rock You', artist: 'Queen', album: 'News of the World', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/a6/6e/bf/a66ebf79-5008-8948-b352-a790fc87446b/19UM1IM04638.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      
      { spotifyId: 'tr_old_40', title: 'Billie Jean', artist: 'Michael Jackson', album: 'Thriller', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_41', title: 'Beat It', artist: 'Michael Jackson', album: 'Thriller', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_42', title: 'Smooth Criminal', artist: 'Michael Jackson', album: 'Bad', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/e3/47/a0/e347a0cc-87ce-5d05-d560-176c7d48f66e/075679904119.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },

      { spotifyId: 'tr_old_43', title: 'Smells Like Teen Spirit', artist: 'Nirvana', album: 'Nevermind', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/05/27/ef/0527ef9d-8eb7-ce54-1594-555fb77e5c6e/00094631128053.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_44', title: 'Come As You Are', artist: 'Nirvana', album: 'Nevermind', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/05/27/ef/0527ef9d-8eb7-ce54-1594-555fb77e5c6e/00094631128053.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },

      { spotifyId: 'tr_old_45', title: 'I Want It That Way', artist: 'Backstreet Boys', album: 'Millennium', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/49/3d/ab/493dab54-f920-9043-6181-80993b8116c9/19UMGIM53909.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_46', title: 'As Long As You Love Me', artist: 'Backstreet Boys', album: 'Backstreet\'s Back', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/49/3d/ab/493dab54-f920-9043-6181-80993b8116c9/19UMGIM53909.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_47', title: '...Baby One More Time', artist: 'Britney Spears', album: '...Baby One More Time', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/49/3d/ab/493dab54-f920-9043-6181-80993b8116c9/19UMGIM53909.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },

      { spotifyId: 'tr_old_48', title: 'Wonderwall', artist: 'Oasis', album: '(What\'s the Story) Morning Glory?', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/91/3c/65/913c65c3-1d21-f925-45cf-a0e28f3226a2/00094639904253.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_49', title: 'Don\'t Look Back In Anger', artist: 'Oasis', album: '(What\'s the Story) Morning Glory?', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/91/3c/65/913c65c3-1d21-f925-45cf-a0e28f3226a2/00094639904253.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },

      { spotifyId: 'tr_old_50', title: 'Sweet Child O\' Mine', artist: 'Guns N\' Roses', album: 'Appetite for Destruction', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/21/f2/85/21f285fb-5b32-beec-df1d-0453715c0e18/16UMGIM52317.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_51', title: 'November Rain', artist: 'Guns N\' Roses', album: 'Use Your Illusion I', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/21/f2/85/21f285fb-5b32-beec-df1d-0453715c0e18/16UMGIM52317.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },

      { spotifyId: 'tr_old_52', title: 'Livin\' On A Prayer', artist: 'Bon Jovi', album: 'Slippery When Wet', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/0d/1a/0c/0d1a0c8b-6be6-a97e-d450-48283a8b417b/15UMGIM26760.rgb.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_53', title: 'Hotel California', artist: 'Eagles', album: 'Hotel California', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/1c/b4/2c/1cb42c73-4ea2-1f41-e40a-5b1eb73f32e9/075679958372.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_54', title: 'Dancing Queen', artist: 'ABBA', album: 'Arrival', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/37/66/ec/3766ecc3-1f19-a1b7-a8b2-b13c1fa87702/190295851286.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_55', title: 'Never Gonna Give You Up', artist: 'Rick Astley', album: 'Whenever You Need Somebody', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/71/61/89/716189ef-fa69-906d-e4fb-b14cf605d3b6/190295806446.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_56', title: 'Careless Whisper', artist: 'George Michael', album: 'Make It Big', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/9e/a0/0b/9ea00b65-7489-ebba-bcf1-0e1a1204689b/0724354050454.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_57', title: 'Take On Me', artist: 'a-ha', album: 'Hunting High and Low', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/9e/a0/0b/9ea00b65-7489-ebba-bcf1-0e1a1204689b/0724354050454.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_58', title: 'My Heart Will Go On', artist: 'Celine Dion', album: 'Let\'s Talk About Love', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/9e/a0/0b/9ea00b65-7489-ebba-bcf1-0e1a1204689b/0724354050454.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_59', title: 'Creep', artist: 'Radiohead', album: 'Pablo Honey', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/9e/a0/0b/9ea00b65-7489-ebba-bcf1-0e1a1204689b/0724354050454.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' },
      { spotifyId: 'tr_old_60', title: 'Hey Jude', artist: 'The Beatles', album: 'Hey Jude', albumArt: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/9e/a0/0b/9ea00b65-7489-ebba-bcf1-0e1a1204689b/0724354050454.jpg/600x600bb.jpg', category: 'Nostalgia < 2000', region: 'GLOBAL' }
    ];
  }
}

export const spotifyService = new SpotifyService();
export default spotifyService;
