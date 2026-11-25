import { Op } from 'sequelize';
import {
  RankedSeason,
  UserRankedProfile,
  RankedDuel,
  Game,
  GameRound,
  Track,
  User,
  Notification
} from '../models/index.js';
import { gameRepository } from '../repositories/GameRepository.js';
import { trackRepository } from '../repositories/TrackRepository.js';
import { spotifyService } from './SpotifyService.js';
import { audioService } from './AudioService.js';
import { cosmeticService } from './CosmeticService.js';

export const TIERS = [
  { name: 'BRONZE', minRp: 0, benchmark: 220 },
  { name: 'SILVER', minRp: 600, benchmark: 270 },
  { name: 'GOLD', minRp: 1100, benchmark: 320 },
  { name: 'PLATINUM', minRp: 1600, benchmark: 370 },
  { name: 'DIAMOND', minRp: 2100, benchmark: 420 }
];

const TIER_ORDER = ['UNRANKED', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MAESTRO'];

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getTierForRp(rp) {
  let matched = 'BRONZE';
  for (const t of TIERS) {
    if (rp >= t.minRp) matched = t.name;
  }
  return matched;
}

function getTierFloorRp(tierName) {
  const found = TIERS.find(t => t.name === tierName);
  return found ? found.minRp : 0;
}

function getTierBenchmark(tierName) {
  if (tierName === 'MAESTRO') return 450;
  const found = TIERS.find(t => t.name === tierName);
  return found ? found.benchmark : 220;
}

class RankedService {
  async ensureActiveSeason() {
    const now = new Date();
    let active = await RankedSeason.findOne({
      where: { isActive: true },
      order: [['seasonNumber', 'DESC']]
    });

    if (active && new Date(active.endsAt) > now) {
      return active;
    }

    if (active && new Date(active.endsAt) <= now) {
      await this.finalizeSeasonRewards(active.id);
      await active.update({ isActive: false });
    }

    const latest = await RankedSeason.findOne({ order: [['seasonNumber', 'DESC']] });
    const nextNum = (latest?.seasonNumber || 0) + 1;
    const startsAt = now;
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    active = await RankedSeason.create({
      seasonNumber: nextNum,
      name: `Season ${nextNum}`,
      startsAt,
      endsAt,
      isActive: true,
      rewardsFinalized: false
    });
    return active;
  }

  async finalizeSeasonRewards(seasonId) {
    const season = await RankedSeason.findByPk(seasonId);
    if (!season || season.rewardsFinalized) return;

    const topProfiles = await UserRankedProfile.findAll({
      where: { seasonId, tier: { [Op.ne]: 'UNRANKED' } },
      order: [['rp', 'DESC']],
      limit: 50
    });

    for (let i = 0; i < topProfiles.length; i++) {
      const p = topProfiles[i];
      if (i < 10 && p.rp >= 2100) {
        await cosmeticService.grantItemByCode(p.userId, 'ranked_frame_s1_maestro', 'ranked_season').catch(() => {});
      } else if (['DIAMOND', 'MAESTRO'].includes(p.tier)) {
        await cosmeticService.grantItemByCode(p.userId, 'ranked_frame_s1_diamond', 'ranked_season').catch(() => {});
      }
    }
    await season.update({ rewardsFinalized: true });
  }

  async getOrCreateUserProfile(userId, seasonId = null) {
    const season = seasonId
      ? await RankedSeason.findByPk(seasonId)
      : await this.ensureActiveSeason();

    const [profile] = await UserRankedProfile.findOrCreate({
      where: { userId, seasonId: season.id },
      defaults: {
        userId,
        seasonId: season.id,
        rp: 0,
        tier: 'UNRANKED',
        placementGamesPlayed: 0,
        demotionShieldGames: 0,
        rankedGamesPlayed: 0,
        rankedWins: 0,
        peakTier: 'UNRANKED',
        peakRp: 0
      }
    });

    return { season, profile };
  }

  async getUserRankedSummary(userId) {
    const { season, profile } = await this.getOrCreateUserProfile(userId);
    let effectiveTier = profile.tier;
    let seasonRank = null;

    if (profile.tier !== 'UNRANKED') {
      const higherCount = await UserRankedProfile.count({
        where: {
          seasonId: season.id,
          tier: { [Op.ne]: 'UNRANKED' },
          rp: { [Op.gt]: profile.rp }
        }
      });
      seasonRank = higherCount + 1;
      if (seasonRank <= 10 && profile.rp >= 2100) {
        effectiveTier = 'MAESTRO';
      }
    }

    return {
      seasonId: season.id,
      seasonNumber: season.seasonNumber,
      seasonName: season.name,
      endsAt: season.endsAt,
      rp: profile.rp,
      tier: effectiveTier,
      placementGamesPlayed: profile.placementGamesPlayed,
      placementRequired: 5,
      isInPlacement: profile.placementGamesPlayed < 5,
      demotionShieldGames: profile.demotionShieldGames,
      rankedGamesPlayed: profile.rankedGamesPlayed,
      rankedWins: profile.rankedWins,
      peakTier: profile.peakTier,
      peakRp: profile.peakRp,
      seasonRank
    };
  }

  async _pickOfficialTracks(count = 5) {
    const [global, indo, nostalgia] = await Promise.all([
      spotifyService.getTopTracks('Global Trends').catch(() => []),
      spotifyService.getTopTracks('Indonesia Trends').catch(() => []),
      spotifyService.getTopTracks('Nostalgia < 2000').catch(() => [])
    ]);

    const poolMap = new Map();
    for (const t of [...(global || []), ...(indo || []), ...(nostalgia || [])]) {
      if (!t?.title) continue;
      const key = t.spotifyId || `${t.title.toLowerCase()}::${(t.artist || '').toLowerCase()}`;
      if (!poolMap.has(key)) poolMap.set(key, t);
    }

    let pool = [...poolMap.values()];
    if (pool.length < count) {
      const dbTracks = await Track.findAll({ where: { previewUrl: { [Op.ne]: null } }, limit: 40 });
      pool = [...pool, ...dbTracks.map(t => ({
        spotifyId: t.spotifyId,
        title: t.title,
        artist: t.artist,
        album: t.album,
        albumArt: t.albumArt,
        previewUrl: t.previewUrl,
        category: t.category
      }))];
    }

    return shuffleArray(pool).slice(0, count);
  }

  async startSoloRanked(userId, gameService) {
    const season = await this.ensureActiveSeason();
    await this.getOrCreateUserProfile(userId, season.id);

    const selectedTracks = await this._pickOfficialTracks(5);
    if (selectedTracks.length < 5) {
      throw new Error('Katalog lagu Ranked sedang disiapkan, coba lagi sebentar.');
    }

    const savedTracks = await trackRepository.bulkUpsert(selectedTracks);
    const game = await gameRepository.create({
      mode: 'SOLO',
      gameSubtype: 'RANKED_SOLO',
      category: 'Solo Ranked',
      seasonId: season.id,
      numberOfSongs: savedTracks.length,
      currentRound: 1,
      status: 'PLAYING',
      hostId: userId
    });

    await gameRepository.addPlayer(game.id, userId, true);
    for (let i = 0; i < savedTracks.length; i++) {
      await gameRepository.createRound(game.id, i + 1, savedTracks[i].id);
    }

    audioService.preloadGameAudio(savedTracks).catch(() => {});
    return gameService.getGameState(game.id, userId);
  }

  async processRankedResult(userId, { score = 0, correctCount = 0, totalRounds = 5, perfectRun = false, seasonId = null }) {
    const { season, profile } = await this.getOrCreateUserProfile(userId, seasonId);

    const prevTier = profile.tier;
    const prevRp = profile.rp;
    const prevPlacement = profile.placementGamesPlayed;

    let rpDelta = 0;
    let nextRp = prevRp;
    let nextTier = prevTier;
    let nextPlacement = prevPlacement;
    let nextShield = profile.demotionShieldGames || 0;
    let placementCompletedNow = false;
    let shieldProtected = false;

    const accuracy = totalRounds > 0 ? correctCount / totalRounds : 0;
    const isWin = accuracy >= 0.6;

    if (prevPlacement < 5) {
      // Accumulate scaled score during 5 placement matches
      const matchContrib = Math.round((score * 0.45) + (correctCount * 18) + (perfectRun ? 30 : 0));
      nextRp = Math.max(0, prevRp + matchContrib);
      rpDelta = matchContrib;
      nextPlacement = prevPlacement + 1;

      if (nextPlacement >= 5) {
        placementCompletedNow = true;
        // Cap initial placement ceiling at Platinum
        nextTier = getTierForRp(Math.min(nextRp, 1850));
        nextShield = 2;
      }
    } else {
      const benchmark = getTierBenchmark(prevTier);
      const perfDiff = score - benchmark;
      let rawDelta = Math.round(perfDiff / 8) + (accuracy >= 0.8 ? 10 : accuracy < 0.4 ? -12 : 0) + (perfectRun ? 10 : 0);
      if (perfDiff >= 0 && rawDelta < 6) rawDelta = 6;
      if (perfDiff < 0 && rawDelta > -5) rawDelta = -5;
      rpDelta = Math.max(-35, Math.min(55, rawDelta));

      nextRp = Math.max(0, prevRp + rpDelta);
      const computedTier = getTierForRp(nextRp);
      const prevIdx = TIER_ORDER.indexOf(prevTier);
      const compIdx = TIER_ORDER.indexOf(computedTier);

      if (compIdx > prevIdx) {
        nextTier = computedTier;
        nextShield = 2; // Demotion shield on promotion
      } else if (compIdx < prevIdx) {
        if (nextShield > 0) {
          // Demotion Shield protects tier floor
          nextTier = prevTier;
          nextRp = Math.max(nextRp, getTierFloorRp(prevTier));
          rpDelta = nextRp - prevRp;
          nextShield -= 1;
          shieldProtected = true;
        } else {
          nextTier = computedTier;
        }
      } else {
        nextTier = prevTier;
      }
    }

    const nextPeakRp = Math.max(profile.peakRp || 0, nextRp);
    const nextPeakTier = TIER_ORDER.indexOf(nextTier) > TIER_ORDER.indexOf(profile.peakTier || 'UNRANKED')
      ? nextTier
      : (profile.peakTier || nextTier);

    await profile.update({
      rp: nextRp,
      tier: nextTier,
      placementGamesPlayed: nextPlacement,
      demotionShieldGames: nextShield,
      rankedGamesPlayed: (profile.rankedGamesPlayed || 0) + 1,
      rankedWins: (profile.rankedWins || 0) + (isWin ? 1 : 0),
      peakTier: nextPeakTier,
      peakRp: nextPeakRp
    });

    return {
      seasonNumber: season.seasonNumber,
      prevTier,
      tier: nextTier,
      rp: nextRp,
      rpDelta,
      placementGamesPlayed: nextPlacement,
      placementRequired: 5,
      placementCompletedNow,
      demotionShieldGames: nextShield,
      shieldProtected,
      promoted: TIER_ORDER.indexOf(nextTier) > TIER_ORDER.indexOf(prevTier)
    };
  }

  async createAsyncDuel(challengerId, opponentId, gameService) {
    if (!opponentId || opponentId === challengerId) {
      throw new Error('Lawan duel tidak valid.');
    }
    const opponent = await User.findByPk(opponentId);
    if (!opponent || opponent.isOfficial) {
      throw new Error('Pemain lawan tidak ditemukan.');
    }

    const season = await this.ensureActiveSeason();
    const selectedTracks = await this._pickOfficialTracks(5);
    if (selectedTracks.length < 5) {
      throw new Error('Katalog lagu Ranked sedang disiapkan.');
    }
    const savedTracks = await trackRepository.bulkUpsert(selectedTracks);

    const duel = await RankedDuel.create({
      seasonId: season.id,
      challengerId,
      opponentId,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });

    const game = await gameRepository.create({
      mode: 'SOLO',
      gameSubtype: 'RANKED_ASYNC',
      category: 'Ranked Duel',
      seasonId: season.id,
      rankedDuelId: duel.id,
      numberOfSongs: savedTracks.length,
      currentRound: 1,
      status: 'PLAYING',
      hostId: challengerId
    });

    await gameRepository.addPlayer(game.id, challengerId, true);
    for (let i = 0; i < savedTracks.length; i++) {
      await gameRepository.createRound(game.id, i + 1, savedTracks[i].id);
    }

    await duel.update({ sourceGameId: game.id, challengerGameId: game.id });
    audioService.preloadGameAudio(savedTracks).catch(() => {});

    return {
      duelId: duel.id,
      gameState: await gameService.getGameState(game.id, challengerId)
    };
  }

  async acceptAsyncDuel(duelId, opponentId, gameService) {
    const duel = await RankedDuel.findByPk(duelId);
    if (!duel) throw new Error('Ranked Duel tidak ditemukan.');
    if (duel.opponentId !== opponentId) throw new Error('Duel ini bukan untuk akunmu.');
    if (duel.status === 'COMPLETED') throw new Error('Duel ini sudah selesai.');

    if (duel.opponentGameId) {
      const existingState = await gameService.getGameState(duel.opponentGameId, opponentId);
      if (existingState) return { duelId: duel.id, gameState: existingState };
    }

    const sourceGame = await gameRepository.findById(duel.sourceGameId);
    if (!sourceGame || !sourceGame.rounds?.length) {
      throw new Error('Set lagu duel tidak ditemukan.');
    }

    const rounds = [...sourceGame.rounds].sort((a, b) => a.roundNumber - b.roundNumber);
    const game = await gameRepository.create({
      mode: 'SOLO',
      gameSubtype: 'RANKED_ASYNC',
      category: 'Ranked Duel',
      seasonId: duel.seasonId,
      rankedDuelId: duel.id,
      numberOfSongs: rounds.length,
      currentRound: 1,
      status: 'PLAYING',
      hostId: opponentId
    });

    await gameRepository.addPlayer(game.id, opponentId, true);
    for (let i = 0; i < rounds.length; i++) {
      await gameRepository.createRound(game.id, i + 1, rounds[i].trackId);
    }
    await duel.update({ opponentGameId: game.id });

    return {
      duelId: duel.id,
      gameState: await gameService.getGameState(game.id, opponentId)
    };
  }

  async finalizeDuelLeg(duelId, userId, score) {
    if (!duelId) return null;
    const duel = await RankedDuel.findByPk(duelId);
    if (!duel) return null;

    const actor = await User.findByPk(userId, { attributes: ['id', 'username', 'displayName'] });

    if (duel.challengerId === userId) {
      await duel.update({ challengerScore: score });
      if (duel.opponentScore === null) {
        await Notification.create({
          userId: duel.opponentId,
          senderId: userId,
          type: 'RANKED_DUEL_INVITE',
          title: `${actor?.displayName || 'Pemain'} menantangmu di Ranked Duel!`,
          message: `Skor target: ${score} poin. Balas dalam 48 jam untuk rebut bonus +25 RP!`,
          data: { duelId: duel.id, challengerScore: score }
        }).catch(() => {});
      }
    } else if (duel.opponentId === userId) {
      await duel.update({ opponentScore: score });
    }

    const fresh = await RankedDuel.findByPk(duelId);
    if (fresh && fresh.challengerScore !== null && fresh.opponentScore !== null && fresh.status !== 'COMPLETED') {
      let winnerId = null;
      if (fresh.challengerScore > fresh.opponentScore) winnerId = fresh.challengerId;
      else if (fresh.opponentScore > fresh.challengerScore) winnerId = fresh.opponentId;

      await fresh.update({ winnerId, status: 'COMPLETED' });

      if (winnerId) {
        const { profile } = await this.getOrCreateUserProfile(winnerId, fresh.seasonId);
        const bonusRp = 25;
        const nextRp = (profile.rp || 0) + bonusRp;
        const nextTier = profile.placementGamesPlayed >= 5 ? getTierForRp(nextRp) : profile.tier;
        await profile.update({
          rp: nextRp,
          tier: nextTier,
          rankedWins: (profile.rankedWins || 0) + 1,
          peakRp: Math.max(profile.peakRp || 0, nextRp)
        });

        const loserId = winnerId === fresh.challengerId ? fresh.opponentId : fresh.challengerId;
        await Notification.create({
          userId: loserId,
          senderId: winnerId,
          type: 'REVENGE_CHALLENGE',
          title: 'Ranked Duel Selesai!',
          message: `Kamu kalah di Async Ranked Duel (${fresh.challengerScore} vs ${fresh.opponentScore}). Tantang balik sekarang!`,
          data: { duelId: fresh.id, targetUserId: winnerId }
        }).catch(() => {});
      }
      return { duel: fresh.toJSON(), completed: true, winnerId };
    }

    return { duel: fresh?.toJSON() || null, completed: false };
  }

  async getPendingDuels(userId) {
    const duels = await RankedDuel.findAll({
      where: {
        status: 'PENDING',
        [Op.or]: [{ opponentId: userId }, { challengerId: userId }]
      },
      include: [
        { model: User, as: 'challenger', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: User, as: 'opponent', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    return duels.map(d => d.toJSON());
  }
}

export const rankedService = new RankedService();
export default rankedService;
