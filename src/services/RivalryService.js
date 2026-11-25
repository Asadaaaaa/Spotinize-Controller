import { Op } from 'sequelize';
import {
  GamePlayer,
  Game,
  DailyAttempt,
  RankedDuel,
  ChallengeEntry,
  Follow,
  User,
  Notification
} from '../models/index.js';

class RivalryService {
  async _getMutualFriendIds(userId) {
    const [following, followers] = await Promise.all([
      Follow.findAll({ where: { followerId: userId }, attributes: ['followingId'], raw: true }),
      Follow.findAll({ where: { followingId: userId }, attributes: ['followerId'], raw: true })
    ]);
    const followerSet = new Set(followers.map(f => f.followerId));
    return following.map(f => f.followingId).filter(id => followerSet.has(id));
  }

  async getHeadToHead(viewerId, targetUserId) {
    if (!viewerId || !targetUserId || viewerId === targetUserId) {
      return null;
    }

    let viewerWins = 0;
    let targetWins = 0;
    let ties = 0;

    // 1. Multiplayer shared rooms
    const [viewerMp, targetMp] = await Promise.all([
      GamePlayer.findAll({
        where: { userId: viewerId, status: { [Op.ne]: 'LEFT' } },
        include: [{ model: Game, as: 'game', where: { mode: 'MULTIPLAYER', status: 'FINISHED' }, attributes: ['id'] }]
      }),
      GamePlayer.findAll({
        where: { userId: targetUserId, status: { [Op.ne]: 'LEFT' } },
        include: [{ model: Game, as: 'game', where: { mode: 'MULTIPLAYER', status: 'FINISHED' }, attributes: ['id'] }]
      })
    ]);

    const targetMpMap = new Map(targetMp.map(p => [p.gameId, p]));
    let mpCount = 0;
    for (const vp of viewerMp) {
      const tp = targetMpMap.get(vp.gameId);
      if (!tp) continue;
      mpCount++;
      if (vp.score > tp.score) viewerWins++;
      else if (tp.score > vp.score) targetWins++;
      else ties++;
    }

    // 2. Spotinize Daily comparisons on the same date
    const [viewerDaily, targetDaily] = await Promise.all([
      DailyAttempt.findAll({ where: { userId: viewerId, status: 'COMPLETED' } }),
      DailyAttempt.findAll({ where: { userId: targetUserId, status: 'COMPLETED' } })
    ]);
    const targetDailyMap = new Map(targetDaily.map(d => [String(d.dailyDate), d]));
    let dailyCount = 0;
    for (const vd of viewerDaily) {
      const td = targetDailyMap.get(String(vd.dailyDate));
      if (!td) continue;
      dailyCount++;
      if (vd.score > td.score) viewerWins++;
      else if (td.score > vd.score) targetWins++;
      else ties++;
    }

    // 3. Async Ranked Duels & ChallengeEntries
    const duels = await RankedDuel.findAll({
      where: {
        status: 'COMPLETED',
        [Op.or]: [
          { challengerId: viewerId, opponentId: targetUserId },
          { challengerId: targetUserId, opponentId: viewerId }
        ]
      }
    });
    let duelCount = 0;
    for (const d of duels) {
      duelCount++;
      if (d.winnerId === viewerId) viewerWins++;
      else if (d.winnerId === targetUserId) targetWins++;
      else ties++;
    }

    const [vChallenges, tChallenges] = await Promise.all([
      ChallengeEntry.findAll({ where: { userId: viewerId } }),
      ChallengeEntry.findAll({ where: { userId: targetUserId } })
    ]);
    const tChallengeMap = new Map(tChallenges.map(c => [c.postId, c]));
    let challengeCount = 0;
    for (const vc of vChallenges) {
      const tc = tChallengeMap.get(vc.postId);
      if (!tc) continue;
      challengeCount++;
      if (vc.score > tc.score) viewerWins++;
      else if (tc.score > vc.score) targetWins++;
      else ties++;
    }

    return {
      viewerWins,
      targetWins,
      ties,
      totalMeetings: mpCount + dailyCount + duelCount + challengeCount,
      breakdown: {
        multiplayer: mpCount,
        daily: dailyCount,
        duels: duelCount,
        challenges: challengeCount
      }
    };
  }

  async notifyDailyBeaten(userId, dailyDate, score, dailyNumber) {
    const mutualIds = await this._getMutualFriendIds(userId);
    if (mutualIds.length === 0) return;

    const [actor, beatenAttempts] = await Promise.all([
      User.findByPk(userId, { attributes: ['id', 'username', 'displayName'] }),
      DailyAttempt.findAll({
        where: {
          dailyDate,
          userId: { [Op.in]: mutualIds },
          status: 'COMPLETED',
          score: { [Op.lt]: score }
        },
        limit: 10
      })
    ]);

    if (!actor || beatenAttempts.length === 0) return;

    for (const attempt of beatenAttempts) {
      await Notification.create({
        userId: attempt.userId,
        senderId: userId,
        type: 'REVENGE_DAILY',
        title: `${actor.displayName} mengalahkanmu di Daily #${dailyNumber}!`,
        message: `@${actor.username} mencetak ${score} poin di Spotinize Daily #${dailyNumber} (skormu: ${attempt.score}). Tantang balik di Ranked Duel!`,
        data: { targetUserId: userId, username: actor.username, dailyNumber, score }
      }).catch(() => {});
    }
  }

  async notifyLeaderboardOvertaken(userId, prevPowerScore, newPowerScore) {
    if (newPowerScore <= prevPowerScore) return;
    const mutualIds = await this._getMutualFriendIds(userId);
    if (mutualIds.length === 0) return;

    const [actor, overtakenFriends] = await Promise.all([
      User.findByPk(userId, { attributes: ['id', 'username', 'displayName'] }),
      User.findAll({
        where: {
          id: { [Op.in]: mutualIds },
          isOfficial: false,
          allTimePowerScore: {
            [Op.gte]: prevPowerScore,
            [Op.lt]: newPowerScore
          }
        },
        attributes: ['id', 'allTimePowerScore'],
        limit: 5
      })
    ]);

    if (!actor || overtakenFriends.length === 0) return;

    for (const friend of overtakenFriends) {
      await Notification.create({
        userId: friend.id,
        senderId: userId,
        type: 'REVENGE_LEADERBOARD',
        title: `@${actor.username} baru saja menyalipmu!`,
        message: `${actor.displayName} melewati Power Score-mu di Leaderboard (${newPowerScore} pts). Balas tantangannya sekarang!`,
        data: { targetUserId: userId, username: actor.username, powerScore: newPowerScore }
      }).catch(() => {});
    }
  }
}

export const rivalryService = new RivalryService();
export default rivalryService;
