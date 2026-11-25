import { User, UserCategoryMastery } from '../models/index.js';
import { economyService } from './EconomyService.js';
import { cosmeticService } from './CosmeticService.js';

export const MASTERY_THRESHOLDS = [
  { tier: 'MAESTRO', minXp: 5000 },
  { tier: 'GOLD', minXp: 2000 },
  { tier: 'SILVER', minXp: 800 },
  { tier: 'BRONZE', minXp: 250 }
];

const MASTERY_TITLE_MAP = {
  'Global Trends': 'mastery_title_global_maestro',
  'Indonesia Trends': 'mastery_title_indo_maestro',
  'Nostalgia < 2000': 'mastery_title_90s_archivist',
  'Artist': 'mastery_title_artist_specialist'
};

export function xpRequiredForLevel(level) {
  return Math.round(100 * Math.pow(Math.max(1, level), 1.35));
}

class ProgressionService {
  computeLevelState(totalXp = 0) {
    let level = 1;
    let remaining = Math.max(0, Number(totalXp) || 0);
    while (remaining >= xpRequiredForLevel(level)) {
      remaining -= xpRequiredForLevel(level);
      level += 1;
    }
    const nextLevelXp = xpRequiredForLevel(level);
    return {
      level,
      currentLevelXp: remaining,
      nextLevelXp,
      progressPercent: Math.min(100, Math.round((remaining / nextLevelXp) * 100))
    };
  }

  _resolveMasteryTier(xp) {
    for (const t of MASTERY_THRESHOLDS) {
      if (xp >= t.minXp) return t.tier;
    }
    return 'NONE';
  }

  async awardGameProgression(userId, {
    category,
    gameSubtype = 'CLASSIC',
    correctCount = 0,
    sniper01Count = 0,
    perfectRun = false,
    isWin = false
  }) {
    if (!userId) return null;
    const user = await User.findByPk(userId);
    if (!user || user.isOfficial) return null;

    // ANTI-FARMING: 0 correct guesses = 0 XP & 0 gameplay Notes
    const xpEarned = correctCount > 0
      ? (correctCount * 15) + (sniper01Count * 10) + (perfectRun ? 35 : 0) + (gameSubtype === 'DAILY' ? 25 : 0)
      : 0;

    const notesEarned = correctCount > 0
      ? (correctCount * 2) + (perfectRun ? 8 : 0) + (gameSubtype === 'DAILY' ? 10 : 0) + (gameSubtype === 'RANKED_SOLO' ? 6 : 0) + (isWin ? 4 : 0)
      : 0;

    const prevLevel = user.level || 1;
    const nextXp = (user.xp || 0) + xpEarned;
    const levelState = this.computeLevelState(nextXp);

    await user.update({
      xp: nextXp,
      level: levelState.level
    });

    if (notesEarned > 0) {
      await economyService.creditNotes(userId, notesEarned, `GAME_REWARD_${gameSubtype}`, {
        category,
        correctCount,
        perfectRun
      });
    }

    // Category Mastery (for core categories)
    let masteryUpdate = null;
    if (['Global Trends', 'Indonesia Trends', 'Nostalgia < 2000', 'Artist'].includes(category) && correctCount > 0) {
      const [mastery] = await UserCategoryMastery.findOrCreate({
        where: { userId, category },
        defaults: { userId, category, xp: 0, tier: 'NONE', correctSongs: 0, gamesPlayed: 0 }
      });

      const prevMasteryTier = mastery.tier;
      const nextMasteryXp = (mastery.xp || 0) + xpEarned;
      const nextMasteryTier = this._resolveMasteryTier(nextMasteryXp);

      await mastery.update({
        xp: nextMasteryXp,
        tier: nextMasteryTier,
        correctSongs: (mastery.correctSongs || 0) + correctCount,
        gamesPlayed: (mastery.gamesPlayed || 0) + 1
      });

      let unlockedTitle = null;
      if (['GOLD', 'MAESTRO'].includes(nextMasteryTier) && MASTERY_TITLE_MAP[category]) {
        const res = await cosmeticService.grantItemByCode(userId, MASTERY_TITLE_MAP[category], 'mastery');
        if (res?.granted) unlockedTitle = res.item?.name || null;
      }

      masteryUpdate = {
        category,
        xp: nextMasteryXp,
        prevTier: prevMasteryTier,
        tier: nextMasteryTier,
        unlockedTitle
      };
    }

    return {
      xpEarned,
      notesEarned,
      totalXp: nextXp,
      prevLevel,
      level: levelState.level,
      leveledUp: levelState.level > prevLevel,
      levelState,
      masteryUpdate
    };
  }

  async getUserMasteries(userId) {
    const categories = ['Global Trends', 'Indonesia Trends', 'Nostalgia < 2000', 'Artist'];
    const rows = await UserCategoryMastery.findAll({ where: { userId } });
    const map = new Map(rows.map(r => [r.category, r.toJSON()]));

    return categories.map(cat => {
      const m = map.get(cat) || { category: cat, xp: 0, tier: 'NONE', correctSongs: 0, gamesPlayed: 0 };
      const nextTarget = m.tier === 'NONE' ? 250 : m.tier === 'BRONZE' ? 800 : m.tier === 'SILVER' ? 2000 : 5000;
      return {
        ...m,
        nextTargetXp: nextTarget,
        progressPercent: Math.min(100, Math.round((m.xp / nextTarget) * 100))
      };
    });
  }
}

export const progressionService = new ProgressionService();
export default progressionService;
