import { sequelize } from '../config/database.js';
import { User, UserQuest } from '../models/index.js';
import { economyService } from './EconomyService.js';
import { progressionService } from './ProgressionService.js';
import { getWibDateString, getWibWeekKey } from '../utils/WibDate.js';

const DAILY_TEMPLATES = [
  {
    questCode: 'DAILY_PLAY_SPOTINIZE',
    title: 'Selesaikan Spotinize Daily hari ini',
    targetValue: 1,
    rewardNotes: 15,
    rewardXp: 40,
    rewardTickets: 0
  },
  {
    questCode: 'DAILY_FAST_SNIPER',
    title: 'Tebak 1 lagu di reveal ≤ 0.5s',
    targetValue: 1,
    rewardNotes: 12,
    rewardXp: 35,
    rewardTickets: 0
  },
  {
    questCode: 'DAILY_FINISH_GAME',
    title: 'Selesaikan 1 game Solo, Ranked, atau Multiplayer',
    targetValue: 1,
    rewardNotes: 10,
    rewardXp: 30,
    rewardTickets: 0
  }
];

const WEEKLY_TEMPLATES = [
  {
    questCode: 'WEEKLY_RANKED_OR_MP',
    title: 'Selesaikan 3 sesi Solo Ranked atau Multiplayer',
    targetValue: 3,
    rewardNotes: 45,
    rewardXp: 120,
    rewardTickets: 0
  },
  {
    questCode: 'WEEKLY_HIGH_ACCURACY',
    title: 'Capai akurasi ≥ 80% dalam 1 sesi 5 lagu',
    targetValue: 1,
    rewardNotes: 40,
    rewardXp: 100,
    rewardTickets: 0
  },
  {
    questCode: 'WEEKLY_DAILY_STREAK',
    title: 'Mainkan Spotinize Daily 3 hari minggu ini',
    targetValue: 3,
    rewardNotes: 60,
    rewardXp: 150,
    rewardTickets: 1
  }
];

class QuestService {
  async ensureUserQuests(userId) {
    if (!userId) return { daily: [], weekly: [] };
    const dailyKey = `D:${getWibDateString()}`;
    const weeklyKey = `W:${getWibWeekKey()}`;

    for (const tpl of DAILY_TEMPLATES) {
      await UserQuest.findOrCreate({
        where: { userId, periodKey: dailyKey, questCode: tpl.questCode },
        defaults: {
          userId,
          questType: 'DAILY',
          periodKey: dailyKey,
          ...tpl
        }
      });
    }

    for (const tpl of WEEKLY_TEMPLATES) {
      await UserQuest.findOrCreate({
        where: { userId, periodKey: weeklyKey, questCode: tpl.questCode },
        defaults: {
          userId,
          questType: 'WEEKLY',
          periodKey: weeklyKey,
          ...tpl
        }
      });
    }

    const [daily, weekly] = await Promise.all([
      UserQuest.findAll({ where: { userId, periodKey: dailyKey }, order: [['questCode', 'ASC']] }),
      UserQuest.findAll({ where: { userId, periodKey: weeklyKey }, order: [['questCode', 'ASC']] })
    ]);

    return {
      dailyKey,
      weeklyKey,
      daily: daily.map(q => q.toJSON()),
      weekly: weekly.map(q => q.toJSON())
    };
  }

  async recordProgress(userId, questCode, increment = 1) {
    if (!userId || !questCode) return null;
    await this.ensureUserQuests(userId);

    const dailyKey = `D:${getWibDateString()}`;
    const weeklyKey = `W:${getWibWeekKey()}`;

    const quest = await UserQuest.findOne({
      where: {
        userId,
        questCode,
        periodKey: questCode.startsWith('DAILY_') ? dailyKey : weeklyKey
      }
    });
    if (!quest || quest.status === 'CLAIMED') return null;

    const nextProgress = Math.min(quest.targetValue, (quest.progressValue || 0) + increment);
    const nextStatus = nextProgress >= quest.targetValue ? 'COMPLETED' : 'ACTIVE';
    await quest.update({ progressValue: nextProgress, status: nextStatus });
    return quest.toJSON();
  }

  async recordGameCompletionQuests(userId, { gameSubtype, mode, fastGuessesCount = 0, correctCount = 0, totalRounds = 5 }) {
    if (!userId || correctCount === 0) return [];
    const updated = [];

    const qFinish = await this.recordProgress(userId, 'DAILY_FINISH_GAME', 1);
    if (qFinish) updated.push(qFinish);

    if (fastGuessesCount > 0) {
      const qFast = await this.recordProgress(userId, 'DAILY_FAST_SNIPER', 1);
      if (qFast) updated.push(qFast);
    }

    if (gameSubtype === 'DAILY') {
      const qDaily = await this.recordProgress(userId, 'DAILY_PLAY_SPOTINIZE', 1);
      if (qDaily) updated.push(qDaily);
      const qWdaily = await this.recordProgress(userId, 'WEEKLY_DAILY_STREAK', 1);
      if (qWdaily) updated.push(qWdaily);
    }

    if (gameSubtype === 'RANKED_SOLO' || gameSubtype === 'RANKED_ASYNC' || mode === 'MULTIPLAYER') {
      const qMp = await this.recordProgress(userId, 'WEEKLY_RANKED_OR_MP', 1);
      if (qMp) updated.push(qMp);
    }

    if (totalRounds >= 5 && (correctCount / totalRounds) >= 0.8) {
      const qAcc = await this.recordProgress(userId, 'WEEKLY_HIGH_ACCURACY', 1);
      if (qAcc) updated.push(qAcc);
    }

    return updated;
  }

  async claimQuest(userId, questId) {
    return sequelize.transaction(async (t) => {
      const quest = await UserQuest.findOne({
        where: { id: questId, userId },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!quest) throw new Error('Quest tidak ditemukan.');
      if (quest.status === 'CLAIMED') throw new Error('Hadiah quest ini sudah diklaim.');
      if (quest.status !== 'COMPLETED') throw new Error('Quest ini belum selesai.');

      const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!user) throw new Error('User tidak ditemukan.');

      let notesBalance = user.notesBalance || 0;
      if (quest.rewardNotes > 0) {
        const res = await economyService.creditNotes(userId, quest.rewardNotes, `QUEST_CLAIM_${quest.questCode}`, { questId: quest.id }, t);
        notesBalance = res?.balance ?? notesBalance;
      }

      let gachaTickets = user.gachaTickets || 0;
      if (quest.rewardTickets > 0) {
        gachaTickets = await economyService.grantTickets(userId, quest.rewardTickets, t);
      }

      const nextXp = (user.xp || 0) + (quest.rewardXp || 0);
      const lvlState = progressionService.computeLevelState(nextXp);
      await user.update({ xp: nextXp, level: lvlState.level }, { transaction: t });

      await quest.update({ status: 'CLAIMED' }, { transaction: t });

      return {
        quest: quest.toJSON(),
        notesBalance,
        gachaTickets,
        xp: nextXp,
        level: lvlState.level
      };
    });
  }
}

export const questService = new QuestService();
export default questService;
