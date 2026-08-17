import axios from 'axios';
import { userRepository } from '../repositories/UserRepository.js';
import { spotifyService } from '../services/SpotifyService.js';

export class PlaylistController {
  async getUserPlaylists(req, res) {
    try {
      const userId = req.headers['x-user-id'] || req.query.userId;
      if (!userId) return res.status(401).json({ error: 'User ID is required' });

      const user = await userRepository.findById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      // If user has a real Spotify access token, fetch live Spotify playlists!
      if (user.spotifyAccessToken && !user.spotifyAccessToken.startsWith('mock_')) {
        try {
          const response = await axios.get('https://api.spotify.com/v1/me/playlists', {
            params: { limit: 20 },
            headers: { Authorization: `Bearer ${user.spotifyAccessToken}` },
            timeout: 5000
          });

          if (response.data?.items?.length > 0) {
            const playlists = response.data.items.map(pl => ({
              id: pl.id,
              name: pl.name,
              trackCount: pl.tracks?.total || 0,
              cover: pl.images?.[0]?.url || pl.images?.[1]?.url || null,
              owner: pl.owner?.display_name || 'Spotify User',
              isRealSpotify: true
            }));

            // Also add Liked Songs virtual playlist
            playlists.unshift({
              id: 'liked_songs',
              name: 'Liked Songs (Lagu Favorit Kamu)',
              trackCount: 50,
              cover: null,
              owner: user.displayName,
              isRealSpotify: true
            });

            return res.json({ playlists });
          }
        } catch (spotifyErr) {
          console.warn('[PlaylistController] Failed to fetch live Spotify playlists:', spotifyErr.response?.data?.error?.message || spotifyErr.message);
        }
      }

      // Fallback: Curated featured playlist sets
      const playlists = [
        { id: 'pl_top_hits', name: 'Today\'s Top Hits Indonesia', trackCount: 50, cover: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/ce/26/fa/ce26fa32-9cb7-76fe-a289-53e30d41f021/859758784742_cover.jpg/600x600bb.jpg', owner: 'Spotinize Curated' },
        { id: 'pl_pop_indo', name: 'Pop Indonesia Galau & Hits', trackCount: 45, cover: 'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/d8/bb/8c/d8bb8c81-ddb9-e427-a18b-c385afae12c2/23UMGIM65225.rgb.jpg/600x600bb.jpg', owner: 'Spotinize Curated' },
        { id: 'pl_global_vibes', name: 'Global Chill & Night Drive', trackCount: 40, cover: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/a6/6e/bf/a66ebf79-5008-8948-b352-a790fc87446b/19UM1IM04638.rgb.jpg/600x600bb.jpg', owner: 'Spotinize Curated' },
        { id: 'pl_rock_classics', name: 'Indo 2000s Nostalgia', trackCount: 35, cover: 'https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/0d/1a/0c/0d1a0c8b-6be6-a97e-d450-48283a8b417b/15UMGIM26760.rgb.jpg/600x600bb.jpg', owner: 'Spotinize Curated' }
      ];

      return res.json({ playlists, isConnected: !!user.spotifyConnected });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

export const playlistController = new PlaylistController();
export default playlistController;
