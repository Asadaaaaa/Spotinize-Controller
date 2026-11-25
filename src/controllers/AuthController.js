import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { spotifyService } from '../services/SpotifyService.js';
import { imageCacheService } from '../services/ImageCacheService.js';
import { userRepository } from '../repositories/UserRepository.js';
import { historyRepository } from '../repositories/HistoryRepository.js';
import { cosmeticService } from '../services/CosmeticService.js';
import { progressionService } from '../services/ProgressionService.js';
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

      const rawUsername = username.trim();
      if (rawUsername.length < 3) {
        return res.status(400).json({ error: 'Username minimal 3 karakter' });
      }

      if (!/^[a-zA-Z0-9_]+$/.test(rawUsername)) {
        return res.status(400).json({ error: 'Username hanya boleh berisi huruf, angka, dan underscore (_)' });
      }

      if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Password minimal 4 karakter' });
      }

      const cleanUsername = rawUsername.toLowerCase();
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
        winRate: 0,
        notesBalance: 30,
        gachaTickets: 1
      });

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

      return res.status(201).json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          spotifyConnected: user.spotifyConnected,
          notesBalance: user.notesBalance || 30,
          gachaTickets: user.gachaTickets || 1,
          streakFreezes: 0,
          xp: 0,
          level: 1,
          levelState: progressionService.computeLevelState(0),
          equippedFrame: null,
          equippedVinyl: null,
          equippedTitle: null
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
      const [hydratedUser] = await cosmeticService.hydrateUsersCosmetics([user]);

      return res.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          spotifyConnected: !!user.spotifyConnected,
          currentStreak: user.currentStreak || 0,
          longestStreak: user.longestStreak || 0,
          streakFreezes: user.streakFreezes || 0,
          notesBalance: user.notesBalance || 0,
          gachaTickets: user.gachaTickets || 0,
          xp: user.xp || 0,
          level: user.level || 1,
          levelState: progressionService.computeLevelState(user.xp || 0),
          equippedFrameId: user.equippedFrameId || null,
          equippedVinylId: user.equippedVinylId || null,
          equippedTitleId: user.equippedTitleId || null,
          equippedFrame: hydratedUser?.equippedFrame || null,
          equippedVinyl: hydratedUser?.equippedVinyl || null,
          equippedTitle: hydratedUser?.equippedTitle || null,
          isOfficial: Boolean(user.isOfficial),
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
      const [hydratedUser] = await cosmeticService.hydrateUsersCosmetics([user]);
      const cleanUser = user.toJSON ? user.toJSON() : { ...user };
      delete cleanUser.password;
      delete cleanUser.accessToken;
      delete cleanUser.refreshToken;
      cleanUser.spotifyConnected = !!cleanUser.spotifyConnected;
      cleanUser.guessRate = summary.guessRate;
      cleanUser.winRate = summary.guessRate;
      cleanUser.totalSongsGuessed = summary.totalSongsGuessed;
      cleanUser.totalSongsPlayed = summary.totalSongsPlayed;
      cleanUser.level = cleanUser.level || 1;
      cleanUser.xp = cleanUser.xp || 0;
      cleanUser.levelState = progressionService.computeLevelState(cleanUser.xp);
      cleanUser.notesBalance = cleanUser.notesBalance || 0;
      cleanUser.gachaTickets = cleanUser.gachaTickets || 0;
      cleanUser.streakFreezes = cleanUser.streakFreezes || 0;
      cleanUser.equippedFrame = hydratedUser?.equippedFrame || null;
      cleanUser.equippedVinyl = hydratedUser?.equippedVinyl || null;
      cleanUser.equippedTitle = hydratedUser?.equippedTitle || null;

      return res.json({ user: cleanUser });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async disconnectSpotify(req, res) {
    try {
      const tokenStr = extractBearerToken(req.headers.authorization);
      const decoded = tokenStr ? jwt.verify(tokenStr, JWT_SECRET) : null;
      const targetId = decoded?.id || req.body?.userId;
      if (!targetId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await userRepository.update(targetId, {
        spotifyConnected: false,
        accessToken: null,
        refreshToken: null
      });

      return res.json({ success: true, spotifyConnected: false });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

export const authController = new AuthController();
export default authController;
