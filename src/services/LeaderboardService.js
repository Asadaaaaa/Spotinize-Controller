import { Op, fn, col } from 'sequelize';
import {
  User,
  GameHistory,
  DailyAttempt,
  UserRankedProfile,
  Follow
} from '../models/index.js';
import { cosmeticService } from './CosmeticService.js';
import { rankedService } from './RankedService.js';
import { getWibDateString, getWibWeekStartDate } from '../utils/WibDate.js';

const OFFICIAL_SUBTYPES = new Set([
  'CLASSIC',
  'DAILY',
  'RANKED_SOLO',
  'RANKED_ASYNC',
  'SURVIVAL',
  'ELIMINATION',
  'SPEED_BUZZ',
  'SQUAD_2V2'
]);

class LeaderboardService {
  isOfficialEligible({ mode, gameSubtype = 'CLASSIC', category, numberOfSongs = 5 }) {
    if (category === 'Artist') return false;
    if (!OFFICIAL_SUBTYPES.has(gameSubtype)) return false;
    if (mode === 'SOLO' && gameSubtype === 'CLASSIC' && Number(numberOfSongs) !== 5) {
      return false;
    }
    return true;
  }

  async _getFriendScopeIds(viewerId) {
    if (!viewerId) return null;
    const links = await Follow.findAll({
      where: { followerId: viewerId },
      attributes: ['followingId'],
      raw: true
    });
    const ids = new Set(links.map(l => l.followingId));
    ids.add(viewerId);
    return [...ids];
  }

  async _attachRankedTiers(entries = []) {
    if (!entries.length) return entries;
    const season = await rankedService.ensureActiveSeason().catch(() => null);
    if (!season) return entries;

    const userIds = entries.map(e => e.id || e.userId).filter(Boolean);
    const profiles = await UserRankedProfile.findAll({
      where: { seasonId: season.id, userId: { [Op.in]: userIds } },
      raw: true
    });
    const map = new Map(profiles.map(p => [p.userId, p]));

    return entries.map(e => {
      const uid = e.id || e.userId;
      const prof = map.get(uid);
      return {
        ...e,
        rankedTier: prof?.tier || 'UNRANKED',
        rankedRp: prof?.rp || 0
      };
    });
  }

  /**
   * Recalculates user's All-Time Power Score (Combination: ~65% Skill + ~35% Consistency).
   */
  async recalculateUserPowerScore(userId) {
    const user = await User.findByPk(userId);
    if (!user || user.isOfficial) return 0;

    const histories = await GameHistory.findAll({
      where: {
        userId,
        isOfficialEligible: true,
        status: { [Op.ne]: 'LEFT' }
      },
      attributes: ['score', 'totalRounds']
    });

    const officialGamesCount = histories.length;
    const normalizedTotal = histories.reduce((sum, h) => {
      const rounds = Math.max(1, h.totalRounds || 5);
      return sum + ((h.score || 0) * (5 / rounds));
    }, 0);
    const officialAvgScore = officialGamesCount > 0
      ? Math.round((normalizedTotal / officialGamesCount) * 10) / 10
      : 0;

    const season = await rankedService.ensureActiveSeason().catch(() => null);
    let rankedRp = 0;
    if (season) {
      const rpProf = await UserRankedProfile.findOne({
        where: { userId, seasonId: season.id },
        attributes: ['rp']
      });
      rankedRp = rpProf?.rp || 0;
    }

    const dailyPointsTotal = user.dailyPointsTotal || 0;
    const maturity = Math.min(1, officialGamesCount / 5);
    const skillScore = ((rankedRp * 0.45) + (officialAvgScore * 1.1)) * maturity;
    const consistencyScore = Math.min(600, dailyPointsTotal * 0.08) + Math.min(400, Math.log2(1 + officialGamesCount) * 75);
    const allTimePowerScore = Math.round(skillScore + consistencyScore);

    await user.update({
      officialGamesCount,
      officialAvgScore,
      allTimePowerScore
    });

    return allTimePowerScore;
  }

  async backfillAllUsersPowerScore() {
    const users = await User.findAll({
      where: { isOfficial: false, gamesPlayed: { [Op.gt]: 0 }, allTimePowerScore: 0 },
      attributes: ['id']
    });
    for (const u of users) {
      await this.recalculateUserPowerScore(u.id).catch(() => {});
    }
  }

  async getDailyLeaderboard({ dateWib = getWibDateString(), scope = 'global', viewerId = null, limit = 30 } = {}) {
    const where = {
      dailyDate: dateWib,
      status: 'COMPLETED'
    };

    if (scope === 'friends' && viewerId) {
      const ids = await this._getFriendScopeIds(viewerId);
      where.userId = { [Op.in]: ids };
    }

    const rows = await DailyAttempt.findAll({
      where,
      include: [{
        model: User,
        as: 'user',
        where: { isOfficial: false },
        attributes: ['id', 'username', 'displayName', 'avatarUrl', 'level', 'equippedFrameId', 'equippedVinylId', 'equippedTitleId']
      }],
      order: [['score', 'DESC'], ['correctCount', 'DESC'], ['totalThinkingTime', 'ASC']],
      limit
    });

    const formatted = rows.map(r => ({
      id: r.user.id,
      userId: r.user.id,
      username: r.user.username,
      displayName: r.user.displayName,
      avatarUrl: r.user.avatarUrl,
      level: r.user.level || 1,
      equippedFrameId: r.user.equippedFrameId,
      equippedTitleId: r.user.equippedTitleId,
      score: r.score,
      correctCount: r.correctCount,
      totalThinkingTime: r.totalThinkingTime,
      emojiGrid: r.emojiGrid
    }));

    const withCosmetics = await cosmeticService.hydrateUsersCosmetics(formatted);
    return this._attachRankedTiers(withCosmetics);
  }

  async getAllTimeLeaderboard({ scope = 'global', viewerId = null, limit = 30 } = {}) {
    const where = {
      isOfficial: false,
      gamesPlayed: { [Op.gt]: 0 }
    };

    if (scope === 'friends' && viewerId) {
      const ids = await this._getFriendScopeIds(viewerId);
      where.id = { [Op.in]: ids };
    }

    const rows = await User.findAll({
      where,
      order: [
        ['allTimePowerScore', 'DESC'],
        ['officialAvgScore', 'DESC'],
        ['bestScore', 'DESC']
      ],
      limit,
      attributes: [
        'id', 'username', 'displayName', 'avatarUrl', 'level',
        'allTimePowerScore', 'officialGamesCount', 'officialAvgScore', 'dailyPointsTotal',
        'bestScore', 'totalScore', 'gamesPlayed', 'winRate',
        'equippedFrameId', 'equippedVinylId', 'equippedTitleId'
      ]
    });

    const formatted = rows.map(u => {
      const plain = u.toJSON();
      return {
        ...plain,
        userId: plain.id,
        guessRate: Math.round(plain.winRate || 0),
        powerScore: plain.allTimePowerScore || 0
      };
    });

    const withCosmetics = await cosmeticService.hydrateUsersCosmetics(formatted);
    return this._attachRankedTiers(withCosmetics);
  }

  async getWeeklyLeaderboard({ scope = 'global', viewerId = null, limit = 30 } = {}) {
    const weekStart = getWibWeekStartDate();
    const where = {
      isOfficialEligible: true,
      status: { [Op.ne]: 'LEFT' },
      createdAt: { [Op.gte]: weekStart }
    };

    if (scope === 'friends' && viewerId) {
      const ids = await this._getFriendScopeIds(viewerId);
      where.userId = { [Op.in]: ids };
    }

    const aggRows = await GameHistory.findAll({
      where,
      attributes: [
        'userId',
        [fn('SUM', col('score')), 'weeklyScore'],
        [fn('COUNT', col('GameHistory.id')), 'weeklyGames'],
        [fn('AVG', col('score')), 'weeklyAvg']
      ],
      include: [{
        model: User,
        as: 'user',
        where: { isOfficial: false },
        attributes: ['id', 'username', 'displayName', 'avatarUrl', 'level', 'equippedFrameId', 'equippedTitleId']
      }],
      group: ['user_id', 'user.id'],
      order: [[fn('SUM', col('score')), 'DESC']],
      limit
    });

    const formatted = aggRows.map(r => {
      const plain = r.toJSON();
      return {
        id: plain.user.id,
        userId: plain.user.id,
        username: plain.user.username,
        displayName: plain.user.displayName,
        avatarUrl: plain.user.avatarUrl,
        level: plain.user.level || 1,
        equippedFrameId: plain.user.equippedFrameId,
        equippedTitleId: plain.user.equippedTitleId,
        weeklyScore: Number(plain.weeklyScore || 0),
        weeklyGames: Number(plain.weeklyGames || 0),
        weeklyAvg: Math.round(Number(plain.weeklyAvg || 0))
      };
    });

    const withCosmetics = await cosmeticService.hydrateUsersCosmetics(formatted);
    return this._attachRankedTiers(withCosmetics);
  }

  async getSeasonLeaderboard({ scope = 'global', viewerId = null, limit = 30 } = {}) {
    const season = await rankedService.ensureActiveSeason();
    const where = {
      seasonId: season.id,
      rankedGamesPlayed: { [Op.gt]: 0 }
    };

    if (scope === 'friends' && viewerId) {
      const ids = await this._getFriendScopeIds(viewerId);
      where.userId = { [Op.in]: ids };
    }

    const rows = await UserRankedProfile.findAll({
      where,
      include: [{
        model: User,
        as: 'user',
        where: { isOfficial: false },
        attributes: ['id', 'username', 'displayName', 'avatarUrl', 'level', 'equippedFrameId', 'equippedTitleId']
      }],
      order: [['rp', 'DESC'], ['rankedWins', 'DESC']],
      limit
    });

    const formatted = rows.map((r, idx) => {
      const effectiveTier = (scope === 'global' && idx < 10 && r.rp >= 2100) ? 'MAESTRO' : r.tier;
      return {
        id: r.user.id,
        userId: r.user.id,
        username: r.user.username,
        displayName: r.user.displayName,
        avatarUrl: r.user.avatarUrl,
        level: r.user.level || 1,
        equippedFrameId: r.user.equippedFrameId,
        equippedTitleId: r.user.equippedTitleId,
        rp: r.rp,
        rankedRp: r.rp,
        rankedTier: effectiveTier,
        rankedGamesPlayed: r.rankedGamesPlayed,
        rankedWins: r.rankedWins,
        placementGamesPlayed: r.placementGamesPlayed
      };
    });

    return cosmeticService.hydrateUsersCosmetics(formatted);
  }
}

export const leaderboardService = new LeaderboardService();
export default leaderboardService;
