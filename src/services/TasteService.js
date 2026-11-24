import { Op } from 'sequelize';
import { UserPinnedSong, SavedTrack, GameHistory, Guess, GameRound } from '../models/index.js';

function jaccardRatio(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

class TasteService {
  async _getUserTasteProfile(userId) {
    const [pinned, saved, histories, guesses] = await Promise.all([
      UserPinnedSong.findAll({ where: { userId }, attributes: ['artist'] }),
      SavedTrack.findAll({ where: { userId }, attributes: ['artist'] }),
      GameHistory.findAll({ where: { userId }, attributes: ['category', 'artistQuery'], limit: 40, order: [['createdAt', 'DESC']] }),
      Guess.findAll({
        where: { userId, isCorrect: true },
        include: [{ model: GameRound, as: 'round', attributes: ['trackId'], required: true }],
        limit: 120
      })
    ]);

    const artists = new Set();
    const artistLabels = new Map();
    for (const row of [...pinned, ...saved]) {
      const raw = (row.artist || '').trim();
      if (!raw) continue;
      for (const part of raw.split(',')) {
        const clean = part.trim();
        if (clean) {
          const key = clean.toLowerCase();
          artists.add(key);
          if (!artistLabels.has(key)) artistLabels.set(key, clean);
        }
      }
    }

    const categories = new Set();
    for (const h of histories) {
      if (h.category) categories.add(String(h.category).trim().toLowerCase());
      if (h.artistQuery) categories.add(String(h.artistQuery).trim().toLowerCase());
    }

    const trackIds = new Set();
    for (const g of guesses) {
      if (g.round?.trackId) trackIds.add(g.round.trackId);
    }

    return { artists, artistLabels, categories, trackIds };
  }

  async computeCompatibility(viewerId, targetUserId) {
    if (!viewerId || !targetUserId || viewerId === targetUserId) return null;

    const [a, b] = await Promise.all([
      this._getUserTasteProfile(viewerId),
      this._getUserTasteProfile(targetUserId)
    ]);

    const artistScore = jaccardRatio(a.artists, b.artists);
    const categoryScore = jaccardRatio(a.categories, b.categories);
    const trackScore = jaccardRatio(a.trackIds, b.trackIds);

    const hasAnyOverlapData =
      (a.artists.size && b.artists.size) ||
      (a.categories.size && b.categories.size) ||
      (a.trackIds.size && b.trackIds.size);

    if (!hasAnyOverlapData) {
      return { score: 0, sharedArtists: [] };
    }

    const weighted = (artistScore * 0.4) + (categoryScore * 0.3) + (trackScore * 0.3);
    const score = Math.min(100, Math.round(weighted * 100));

    const sharedArtists = [];
    for (const key of a.artists) {
      if (b.artists.has(key)) {
        sharedArtists.push(a.artistLabels.get(key) || key);
      }
      if (sharedArtists.length >= 4) break;
    }

    return { score, sharedArtists };
  }

  computeBadges(user = {}, summary = {}, histories = []) {
    const badges = [];
    const bestStreak = Math.max(user.longestStreak || 0, user.currentStreak || 0);
    const guessRate = summary.guessRate ?? user.winRate ?? 0;
    const avgTime = summary.averageTime ?? summary.avgTime ?? null;

    if (avgTime !== null && avgTime > 0 && avgTime <= 2.2 && (user.gamesPlayed || 0) >= 3) {
      badges.push({ id: 'speed_demon', icon: '⚡', label: 'Speed Demon' });
    }
    if (bestStreak >= 3) {
      badges.push({ id: 'streak_master', icon: '🔥', label: 'Streak Master' });
    }
    if ((user.bestScore || 0) >= 4000 || guessRate >= 80) {
      badges.push({ id: 'sharp_ear', icon: '🎯', label: 'Sharp Ear' });
    }

    const cats = (histories || []).map(h => String(h.category || '').toLowerCase());
    if (cats.some(c => c.includes('90'))) {
      badges.push({ id: '90s_nostalgia', icon: '📼', label: '90s Nostalgia' });
    }
    if (cats.some(c => c.includes('indonesia'))) {
      badges.push({ id: 'indo_pop', icon: '🇮🇩', label: 'Indo Pop Addict' });
    }
    if ((user.gamesPlayed || 0) >= 10) {
      badges.push({ id: 'veteran', icon: '👑', label: 'Spotinize Veteran' });
    }

    return badges.slice(0, 5);
  }
}

export const tasteService = new TasteService();
export default tasteService;
