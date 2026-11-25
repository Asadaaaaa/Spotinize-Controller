import { User, Notification } from '../models/index.js';
import { feedService } from './FeedService.js';
import { getWibDateString, getWibYesterdayString, getWibDaysAgoString } from '../utils/WibDate.js';

const MILESTONES = [3, 7, 14, 30, 50, 100];

export class StreakService {
  /**
   * Records a completed game / blind drop / daily activity for Daily Streak tracking.
   * Automatically consumes 1 Streak Freeze if the user missed exactly 1 day.
   */
  async recordActivity(userId) {
    if (!userId) return null;
    const user = await User.findByPk(userId);
    if (!user || user.isOfficial) return null;

    const today = getWibDateString();
    const yesterday = getWibYesterdayString();
    const twoDaysAgo = getWibDaysAgoString(2);
    const lastPlayed = user.lastPlayedDate ? String(user.lastPlayedDate).slice(0, 10) : null;

    if (lastPlayed === today) {
      return {
        currentStreak: user.currentStreak || 1,
        longestStreak: user.longestStreak || 1,
        incremented: false,
        freezeUsed: false,
        streakFreezes: user.streakFreezes || 0,
        milestoneReached: null
      };
    }

    let nextStreak = 1;
    let freezeUsed = false;
    let nextFreezes = user.streakFreezes || 0;

    if (lastPlayed === yesterday) {
      nextStreak = (user.currentStreak || 0) + 1;
    } else if (lastPlayed === twoDaysAgo && (user.currentStreak || 0) > 0 && nextFreezes > 0) {
      // Missed exactly 1 day -> auto-consume 1 Streak Freeze!
      nextFreezes -= 1;
      nextStreak = (user.currentStreak || 0) + 1;
      freezeUsed = true;
    }

    const nextLongest = Math.max(user.longestStreak || 0, nextStreak);
    await user.update({
      currentStreak: nextStreak,
      longestStreak: nextLongest,
      lastPlayedDate: today,
      streakFreezes: nextFreezes
    });

    if (freezeUsed) {
      Notification.create({
        userId,
        senderId: null,
        type: 'STREAK_SAVED',
        title: 'Streak Freeze Aktif!',
        message: `1 Streak Freeze menyelamatkan streak ${nextStreak} harimu (sisa Freeze: ${nextFreezes}).`,
        data: { currentStreak: nextStreak, remainingFreezes: nextFreezes }
      }).catch(() => {});
    }

    const milestoneReached = MILESTONES.includes(nextStreak) ? nextStreak : null;
    if (milestoneReached) {
      feedService.createAutoActivity(userId, 'streak_milestone', {
        streak: nextStreak
      }).catch(err => {
        console.warn('[StreakService] Auto-activity notice:', err.message);
      });
    }

    return {
      currentStreak: nextStreak,
      longestStreak: nextLongest,
      incremented: true,
      freezeUsed,
      streakFreezes: nextFreezes,
      milestoneReached
    };
  }
}

export const streakService = new StreakService();
export default streakService;
