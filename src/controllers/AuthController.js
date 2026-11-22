import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { spotifyService } from '../services/SpotifyService.js';
import { imageCacheService } from '../services/ImageCacheService.js';
import { userRepository } from '../repositories/UserRepository.js';
import { historyRepository } from '../repositories/HistoryRepository.js';
import { JWT_SECRET, extractBearerToken } from '../middleware/authMiddleware.js';

export class AuthController {
  /**
   * Register new user with username & password (no email needed)
   */
  async register(req, res) {
    try {
      const { username, password, displayName } = req.body;

      if (!username || !username.trim()) {
        return res.status(400).json({ error: 'Username wajib diisi' });
      }

      if (username.trim().length < 3) {
        return res.status(400).json({ error: 'Username minimal 3 karakter' });
      }

      if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Password minimal 4 karakter' });
      }

      const cleanUsername = username.trim().toLowerCase();
      const existingUser = await userRepository.findByUsername(cleanUsername);
      if (existingUser) {
        return res.status(400).json({ error: 'Username sudah digunakan, pilih username lain' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const name = displayName?.trim() || username.trim();
      const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUsername}`;

      const user = await userRepository.create({
        username: cleanUsername,
        password: hashedPassword,
        displayName: name,
        avatarUrl,
        spotifyConnected: false,
        gamesPlayed: 0,
        totalScore: 0,
        bestScore: 0,
        averageScore: 0,
        winRate: 0
      });

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

      return res.status(201).json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          spotifyConnected: user.spotifyConnected
        },
        token,
        requireSpotifyConnect: false,
        message: 'Akun berhasil dibuat!'
      });
    } catch (err) {
      console.error('AuthController register error:', err);
      return res.status(500).json({ error: err.message || 'Gagal mendaftar akun' });
    }
  }

  /**
   * Login with username & password
   */
  async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username dan password wajib diisi' });
      }

      const cleanUsername = username.trim().toLowerCase();
      const user = await userRepository.findByUsername(cleanUsername);
      if (!user) {
        return res.status(401).json({ error: 'Username atau password salah' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Username atau password salah' });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
      const summary = await historyRepository.getSummary(user.id);

      return res.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          spotifyConnected: !!user.spotifyConnected,
          gamesPlayed: user.gamesPlayed || 0,
          bestScore: user.bestScore || 0,
          totalScore: user.totalScore || 0,
          winRate: summary.guessRate,
          guessRate: summary.guessRate,
          totalSongsGuessed: summary.totalSongsGuessed,
          totalSongsPlayed: summary.totalSongsPlayed
        },
        token,
        requireSpotifyConnect: false
      });
    } catch (err) {
      console.error('AuthController login error:', err);
      return res.status(500).json({ error: err.message || 'Gagal login' });
    }
  }

  /**
   * Get Spotify OAuth URL with userId as state
   */
  getSpotifyConnectUrl(req, res) {
    try {
      const userId = req.query.userId || req.headers['x-user-id'] || 'anonymous';
      const url = spotifyService.getAuthUrl(userId);
      return res.json({ url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Handle Spotify Callback and link to existing user
   */
  async handleSpotifyCallback(req, res) {
    try {
      const { code, state: userId } = req.body;
      if (!code) {
        return res.status(400).json({ error: 'Kode otorisasi Spotify tidak ditemukan' });
      }

      const tokens = await spotifyService.exchangeCodeForToken(code);
      const profile = await spotifyService.getUserProfile(tokens.accessToken);

      // If user ID was passed in state, link Spotify to that registered account
      let user = null;
      if (userId && userId !== 'anonymous' && userId !== 'spotinize_state') {
        user = await userRepository.linkSpotify(userId, profile, tokens);
      }

      // Fallback: If no valid userId in state, look up by Spotify ID or create
      if (!user) {
        user = await userRepository.findBySpotifyId(profile.id);
        if (user) {
          user = await userRepository.linkSpotify(user.id, profile, tokens);
        }
      }

      if (!user) {
        return res.status(400).json({ error: 'User tidak ditemukan untuk dihubungkan dengan Spotify. Silakan login terlebih dahulu.' });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

      return res.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          spotifyConnected: true,
          gamesPlayed: user.gamesPlayed || 0,
          bestScore: user.bestScore || 0,
          totalScore: user.totalScore || 0,
          winRate: user.winRate || 0,
          guessRate: user.winRate || 0
        },
        token,
        requireSpotifyConnect: false,
        message: 'Akun Spotify berhasil terhubung!'
      });
    } catch (err) {
      console.error('AuthController handleSpotifyCallback error:', err.response?.data || err.message);
      const errorMsg = err.response?.data?.error_description || err.response?.data?.error || err.message || 'Gagal menghubungkan Spotify';
      return res.status(400).json({ error: errorMsg });
    }
  }

  /**
   * Get Current Authenticated User profile (strictly requires valid JWT + existing user)
   */
  async getMe(req, res) {
    try {
      const tokenStr = extractBearerToken(req.headers.authorization);
      if (!tokenStr) {
        return res.status(401).json({ error: 'Token tidak ditemukan', code: 'TOKEN_MISSING' });
      }

      let decoded;
      try {
        decoded = jwt.verify(tokenStr, JWT_SECRET);
      } catch (err) {
        if (err?.name === 'TokenExpiredError') {
          return res.status(401).json({ error: 'Token sudah kadaluarsa', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: 'Token tidak valid', code: 'TOKEN_INVALID' });
      }

      if (!decoded?.id) {
        return res.status(401).json({ error: 'Token tidak valid', code: 'TOKEN_INVALID' });
      }

      const user = await userRepository.findById(decoded.id);
      if (!user) {
        return res.status(404).json({ error: 'User tidak ditemukan', code: 'USER_NOT_FOUND' });
      }

      if (user.favoriteSongTitle && !imageCacheService.isLocalCachedImage(user.favoriteSongCover)) {
        const cachedCover = await imageCacheService.resolveTrackArtwork(
          {
            spotifyId: user.favoriteSongSpotifyId,
            title: user.favoriteSongTitle,
            artist: user.favoriteSongArtist,
            albumArt: user.favoriteSongCover
          },
          {
            allowRemoteFallback: true,
            searchFn: (q) => spotifyService.searchTracks(q, null, 5)
          }
        );
        if (cachedCover && cachedCover !== user.favoriteSongCover) {
          await userRepository.update(user.id, { favoriteSongCover: cachedCover }).catch(() => {});
          user.favoriteSongCover = cachedCover;
        }
      }

      const summary = await historyRepository.getSummary(user.id);
      const cleanUser = user.toJSON ? user.toJSON() : { ...user };
      delete cleanUser.password;
      delete cleanUser.accessToken;
      delete cleanUser.refreshToken;
      cleanUser.spotifyConnected = !!cleanUser.spotifyConnected;
      cleanUser.guessRate = summary.guessRate;
      cleanUser.winRate = summary.guessRate;
      cleanUser.totalSongsGuessed = summary.totalSongsGuessed;
      cleanUser.totalSongsPlayed = summary.totalSongsPlayed;

      return res.json({ user: cleanUser });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

export const authController = new AuthController();
export default authController;
