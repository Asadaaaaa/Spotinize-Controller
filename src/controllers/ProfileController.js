import { userRepository } from '../repositories/UserRepository.js';
import { historyRepository } from '../repositories/HistoryRepository.js';
import { trackRepository } from '../repositories/TrackRepository.js';
import { spotifyService } from '../services/SpotifyService.js';
import { imageCacheService } from '../services/ImageCacheService.js';

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

async function ensureFavoriteSongCoverCached(user) {
  if (!user?.favoriteSongTitle) return user?.favoriteSongCover || null;
  if (imageCacheService.isLocalCachedImage(user.favoriteSongCover)) {
    return user.favoriteSongCover;
  }

  const resolved = await imageCacheService.resolveTrackArtwork(
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

  if (resolved && resolved !== user.favoriteSongCover) {
    await userRepository.update(user.id, { favoriteSongCover: resolved }).catch(() => {});
  }

  return resolved || user.favoriteSongCover || null;
}

export class ProfileController {
  async getProfile(req, res) {
    try {
      const { id } = req.params;
      const user = await userRepository.findById(id);
      if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

      const cachedCover = await ensureFavoriteSongCoverCached(user);

      const cleanUser = user.toJSON ? user.toJSON() : { ...user };
      cleanUser.favoriteSongCover = cachedCover;
      cleanUser.spotifyUrl = formatSpotifyUrl(cleanUser.spotifyUrl, cleanUser.spotifyId);
      delete cleanUser.password;
      delete cleanUser.accessToken;
      delete cleanUser.refreshToken;

      const summary = await historyRepository.getSummary(id);
      cleanUser.guessRate = summary.guessRate;
      cleanUser.winRate = summary.guessRate;
      cleanUser.totalSongsGuessed = summary.totalSongsGuessed;
      cleanUser.totalSongsPlayed = summary.totalSongsPlayed;

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

      const cachedCover = await ensureFavoriteSongCoverCached(user);

      const cleanUser = user.toJSON ? user.toJSON() : { ...user };
      cleanUser.favoriteSongCover = cachedCover;
      cleanUser.spotifyUrl = formatSpotifyUrl(cleanUser.spotifyUrl, cleanUser.spotifyId);
      delete cleanUser.password;
      delete cleanUser.accessToken;
      delete cleanUser.refreshToken;

      const summary = await historyRepository.getSummary(user.id);
      const histories = await historyRepository.getByUser(user.id, 5);
      cleanUser.guessRate = summary.guessRate;
      cleanUser.winRate = summary.guessRate;
      cleanUser.totalSongsGuessed = summary.totalSongsGuessed;
      cleanUser.totalSongsPlayed = summary.totalSongsPlayed;

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

      // Handle favorite song (supports albumArt, coverUrl, and cover + caches locally on server)
      if (favoriteSong !== undefined) {
        if (favoriteSong === null) {
          updatePayload.favoriteSongTitle = null;
          updatePayload.favoriteSongArtist = null;
          updatePayload.favoriteSongCover = null;
          updatePayload.favoriteSongSpotifyId = null;
          updatePayload.favoriteSongPreviewUrl = null;
        } else {
          const title = favoriteSong.title || null;
          const artist = favoriteSong.artist || null;
          const spotifyId = favoriteSong.spotifyId || favoriteSong.id || null;
          const rawCover = favoriteSong.albumArt || favoriteSong.coverUrl || favoriteSong.cover || null;

          const cachedCover = title
            ? await imageCacheService.resolveTrackArtwork(
                { spotifyId, title, artist, albumArt: rawCover },
                {
                  allowRemoteFallback: true,
                  searchFn: (q) => spotifyService.searchTracks(q, null, 5)
                }
              )
            : rawCover;

          updatePayload.favoriteSongTitle = title;
          updatePayload.favoriteSongArtist = artist;
          updatePayload.favoriteSongCover = cachedCover || rawCover || null;
          updatePayload.favoriteSongSpotifyId = spotifyId;
          updatePayload.favoriteSongPreviewUrl = favoriteSong.previewUrl || null;
        }
      } else {
        if (favoriteSongTitle !== undefined) updatePayload.favoriteSongTitle = favoriteSongTitle;
        if (favoriteSongArtist !== undefined) updatePayload.favoriteSongArtist = favoriteSongArtist;
        if (favoriteSongCover !== undefined) {
          updatePayload.favoriteSongCover = favoriteSongCover
            ? await imageCacheService.resolveTrackArtwork(
                {
                  spotifyId: favoriteSongSpotifyId,
                  title: favoriteSongTitle,
                  artist: favoriteSongArtist,
                  albumArt: favoriteSongCover
                },
                {
                  allowRemoteFallback: true,
                  searchFn: (q) => spotifyService.searchTracks(q, null, 5)
                }
              )
            : null;
        }
        if (favoriteSongSpotifyId !== undefined) updatePayload.favoriteSongSpotifyId = favoriteSongSpotifyId;
        if (favoriteSongPreviewUrl !== undefined) updatePayload.favoriteSongPreviewUrl = favoriteSongPreviewUrl;
      }

      // Sync cached artwork into tracks table so tebak lagu reuses the same local image
      if (updatePayload.favoriteSongSpotifyId && updatePayload.favoriteSongCover) {
        const existingTrack = await trackRepository.findBySpotifyId(updatePayload.favoriteSongSpotifyId);
        if (existingTrack) {
          if (!imageCacheService.isLocalCachedImage(existingTrack.albumArt)) {
            await existingTrack.update({ albumArt: updatePayload.favoriteSongCover }).catch(() => {});
          }
        } else if (updatePayload.favoriteSongTitle && updatePayload.favoriteSongArtist) {
          await trackRepository.create({
            spotifyId: updatePayload.favoriteSongSpotifyId,
            title: updatePayload.favoriteSongTitle,
            artist: updatePayload.favoriteSongArtist,
            albumArt: updatePayload.favoriteSongCover,
            previewUrl: updatePayload.favoriteSongPreviewUrl || null
          }).catch(() => {});
        }
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
