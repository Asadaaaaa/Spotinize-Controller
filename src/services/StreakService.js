import { User } from '../models/index.js';
import { feedService } from './FeedService.js';

const MILESTONES = [3, 7, 14, 30, 50, 100];

function getJakartaDateString(date = new Date()) {
  // Formats YYYY-MM-DD in Asia/Jakarta (WIB, UTC+7)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function getJakartaYesterdayString(now = new Date()) {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return getJakartaDateString(yesterday);
}

export class StreakService {
  /**
   * Records a completed game / blind drop activity for Daily Streak tracking.
   * Returns { currentStreak, longestStreak, incremented, milestoneReached }.
   */
  async recordActivity(userId) {
    if (!userId) return null;
    const user = await User.findByPk(userId);
    if (!user || user.isOfficial) return null;

    const today = getJakartaDateString();
    const yesterday = getJakartaYesterdayString();
    const lastPlayed = user.lastPlayedDate ? String(user.lastPlayedDate).slice(0, 10) : null;

    if (lastPlayed === today) {
      return {
        currentStreak: user.currentStreak || 1,
        longestStreak: user.longestStreak || 1,
        incremented: false,
        milestoneReached: null
      };
    }

    let nextStreak = 1;
    if (lastPlayed === yesterday) {
      nextStreak = (user.currentStreak || 0) + 1;
    }

    const nextLongest = Math.max(user.longestStreak || 0, nextStreak);
    await user.update({
      currentStreak: nextStreak,
      longestStreak: nextLongest,
      lastPlayedDate: today
    });

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
      milestoneReached
    };
  }
}

export const streakService = new StreakService();
export default streakService;
