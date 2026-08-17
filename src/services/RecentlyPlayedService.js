import { recentlyPlayedRepository } from '../repositories/RecentlyPlayedRepository.js';

export class RecentlyPlayedService {
  _getTrackKey(artist, title) {
    return `${(artist || '').toLowerCase().trim()} - ${(title || '').toLowerCase().trim()}`;
  }

  /**
   * Filters and prioritizes tracks that have NOT been played recently.
   * Guarantees 0 song repetition until the entire song catalog is exhausted.
   */
  async filterEligibleTracks(tracks, userId, gameMode, category, requiredCount = 5) {
    if (!userId || !tracks || tracks.length <= requiredCount) {
      return this._shuffle(tracks || []);
    }

    try {
      const recentRecords = await recentlyPlayedRepository.getRecentPlayedList(userId, category, 48);
      
      const recentTrackKeyMap = new Map();
      recentRecords.forEach(r => {
        const key = this._getTrackKey(r.artistName, r.trackTitle);
        if (!recentTrackKeyMap.has(key)) {
          recentTrackKeyMap.set(key, new Date(r.playedAt).getTime());
        }
        if (r.trackId && !recentTrackKeyMap.has(r.trackId)) {
          recentTrackKeyMap.set(r.trackId, new Date(r.playedAt).getTime());
        }
      });

      const unplayedTracks = [];
      const playedTracksWithTime = [];

      for (const track of tracks) {
        const key = this._getTrackKey(track.artist, track.title);
        const playedTime = recentTrackKeyMap.get(key) || (track.spotifyId ? recentTrackKeyMap.get(track.spotifyId) : null) || (track.id ? recentTrackKeyMap.get(track.id) : null);

        if (!playedTime) {
          unplayedTracks.push(track);
        } else {
          playedTracksWithTime.push({ track, playedTime });
        }
      }

      console.log(`🎵 [Anti-Repeat] Category: "${category}" | Total catalog: ${tracks.length} | Unplayed: ${unplayedTracks.length} | Required: ${requiredCount}`);

      // If we have enough unplayed tracks, pick from them
      if (unplayedTracks.length >= requiredCount) {
        const shuffledUnplayed = this._shuffle(unplayedTracks);
        return shuffledUnplayed.slice(0, requiredCount);
      }

      // Otherwise, take all unplayed tracks, and fill remainder from oldest played tracks (FIFO)
      playedTracksWithTime.sort((a, b) => a.playedTime - b.playedTime); // oldest first
      const needed = requiredCount - unplayedTracks.length;
      const oldestPlayed = playedTracksWithTime.slice(0, needed).map(p => p.track);

      const combined = [...unplayedTracks, ...oldestPlayed];
      return this._shuffle(combined);
    } catch (err) {
      console.warn('[RecentlyPlayedService] Filter notice:', err.message);
      return this._shuffle(tracks).slice(0, requiredCount);
    }
  }

  /**
   * Commits played tracks to RecentlyPlayed table immediately when game is started.
   */
  async commitPlayedTracks(userIds, playedTracks, gameMode, category) {
    if (!userIds || userIds.length === 0 || !playedTracks || playedTracks.length === 0) {
      return;
    }

    const records = [];
    for (const userId of userIds) {
      for (const track of playedTracks) {
        records.push({
          userId,
          trackId: track.id || track.spotifyId || track.title,
          trackTitle: track.title,
          artistName: track.artist,
          gameMode,
          category,
          playedAt: new Date()
        });
      }
    }

    try {
      await recentlyPlayedRepository.bulkRecord(records);
      console.log(`✅ [RecentlyPlayedService] Recorded ${records.length} tracks into recently_played.`);
    } catch (err) {
      console.error('[RecentlyPlayedService] Error committing played tracks:', err.message);
    }
  }

  _shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export const recentlyPlayedService = new RecentlyPlayedService();
export default recentlyPlayedService;
