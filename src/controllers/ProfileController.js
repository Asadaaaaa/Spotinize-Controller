import { userRepository } from '../repositories/UserRepository.js';
import { historyRepository } from '../repositories/HistoryRepository.js';
import { spotifyService } from '../services/SpotifyService.js';

function formatSpotifyUrl(url, spotifyId) {
  if (url && url.trim()) {
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    if (trimmed.startsWith('spotify:user:')) {
      return `https://open.spotify.com/user/${trimmed.replace('spotify:user:', '')}`;
    }
    return `https://open.spotify.com/user/${trimmed}`;
  }
  if (spotifyId) {
    return `https://open.spotify.com/user/${spotifyId}`;
  }
  return null;
}

export class ProfileController {
  async getProfile(req, res) {
    try {
      const { id } = req.params;
      const user = await userRepository.findById(id);
      if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

      const cleanUser = user.toJSON ? user.toJSON() : { ...user };
      cleanUser.spotifyUrl = formatSpotifyUrl(cleanUser.spotifyUrl, cleanUser.spotifyId);
      delete cleanUser.password;
      delete cleanUser.accessToken;
      delete cleanUser.refreshToken;

      const summary = await historyRepository.getSummary(id);
      return res.json({
        user: cleanUser,
        summary
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getProfileByUsername(req, res) {
    try {
      const { username } = req.params;
      if (!username) return res.status(400).json({ error: 'Username diperlukan' });

      const user = await userRepository.findByUsername(username.toLowerCase().trim());
      if (!user) return res.status(404).json({ error: 'Pemain dengan username tersebut tidak ditemukan' });

      const cleanUser = user.toJSON ? user.toJSON() : { ...user };
      cleanUser.spotifyUrl = formatSpotifyUrl(cleanUser.spotifyUrl, cleanUser.spotifyId);
      delete cleanUser.password;
      delete cleanUser.accessToken;
      delete cleanUser.refreshToken;

      const summary = await historyRepository.getSummary(user.id);
      const histories = await historyRepository.getByUser(user.id, 5);

      return res.json({
        user: cleanUser,
        summary,
        histories
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getHistories(req, res) {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit || 20, 10);
      const histories = await historyRepository.getByUser(id, limit);
      return res.json({ histories });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async updateProfile(req, res) {
    try {
      const { id } = req.params;
      const {
        displayName,
        avatarUrl,
        bio,
        spotifyUrl,
        favoriteSongTitle,
        favoriteSongArtist,
        favoriteSongCover,
        favoriteSongSpotifyId,
        favoriteSongPreviewUrl,
        favoriteSong
      } = req.body;

      const updatePayload = {};

      if (displayName !== undefined) {
        if (!displayName.trim()) {
          return res.status(400).json({ error: 'Nama tampilan tidak boleh kosong' });
        }
        updatePayload.displayName = displayName.trim();
      }

      if (avatarUrl !== undefined) {
        updatePayload.avatarUrl = avatarUrl ? avatarUrl.trim() : null;
      }

      if (bio !== undefined) {
        updatePayload.bio = bio ? bio.trim() : '';
      }

      if (spotifyUrl !== undefined) {
        updatePayload.spotifyUrl = formatSpotifyUrl(spotifyUrl, null);
      }

      // Handle favorite song
      if (favoriteSong !== undefined) {
        if (favoriteSong === null) {
          updatePayload.favoriteSongTitle = null;
          updatePayload.favoriteSongArtist = null;
          updatePayload.favoriteSongCover = null;
          updatePayload.favoriteSongSpotifyId = null;
          updatePayload.favoriteSongPreviewUrl = null;
        } else {
          updatePayload.favoriteSongTitle = favoriteSong.title || null;
          updatePayload.favoriteSongArtist = favoriteSong.artist || null;
          updatePayload.favoriteSongCover = favoriteSong.coverUrl || favoriteSong.cover || null;
          updatePayload.favoriteSongSpotifyId = favoriteSong.spotifyId || favoriteSong.id || null;
          updatePayload.favoriteSongPreviewUrl = favoriteSong.previewUrl || null;
        }
      } else {
        if (favoriteSongTitle !== undefined) updatePayload.favoriteSongTitle = favoriteSongTitle;
        if (favoriteSongArtist !== undefined) updatePayload.favoriteSongArtist = favoriteSongArtist;
        if (favoriteSongCover !== undefined) updatePayload.favoriteSongCover = favoriteSongCover;
        if (favoriteSongSpotifyId !== undefined) updatePayload.favoriteSongSpotifyId = favoriteSongSpotifyId;
        if (favoriteSongPreviewUrl !== undefined) updatePayload.favoriteSongPreviewUrl = favoriteSongPreviewUrl;
      }

      const updated = await userRepository.update(id, updatePayload);
      if (!updated) {
        return res.status(404).json({ error: 'User tidak ditemukan' });
      }

      const cleanUser = updated.toJSON ? updated.toJSON() : { ...updated };
      cleanUser.spotifyUrl = formatSpotifyUrl(cleanUser.spotifyUrl, cleanUser.spotifyId);
      delete cleanUser.password;
      delete cleanUser.accessToken;
      delete cleanUser.refreshToken;

      return res.json({ user: cleanUser, message: 'Profil berhasil diperbarui!' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async uploadAvatar(req, res) {
    try {
      const { id } = req.params;
      const { avatarData } = req.body;

      if (!avatarData) {
        return res.status(400).json({ error: 'Data gambar avatar tidak ditemukan' });
      }

      const updated = await userRepository.update(id, { avatarUrl: avatarData });
      if (!updated) {
        return res.status(404).json({ error: 'User tidak ditemukan' });
      }

      const cleanUser = updated.toJSON ? updated.toJSON() : { ...updated };
      cleanUser.spotifyUrl = formatSpotifyUrl(cleanUser.spotifyUrl, cleanUser.spotifyId);
      delete cleanUser.password;
      delete cleanUser.accessToken;
      delete cleanUser.refreshToken;

      return res.json({ user: cleanUser, avatarUrl: cleanUser.avatarUrl, message: 'Foto profil berhasil diupload!' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getSpotifyRecentlyPlayed(req, res) {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit || 10, 10);
      const user = await userRepository.findById(id);

      const tracks = await spotifyService.getUserRecentlyPlayed(
        user?.accessToken, 
        limit, 
        user?.refreshToken,
        async (refreshed) => {
          if (user?.id && refreshed?.accessToken) {
            try {
              await userRepository.update(user.id, {
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken
              });
            } catch (e) {
              console.warn('Failed to update refreshed tokens:', e);
            }
          }
        }
      );
      return res.json({ tracks });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getLeaderboard(req, res) {
    try {
      const limit = parseInt(req.query.limit || 20, 10);
      const leaderboard = await userRepository.getLeaderboard(limit);
      return res.json({ leaderboard });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

export const profileController = new ProfileController();
export default profileController;
