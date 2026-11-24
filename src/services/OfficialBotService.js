import { User } from '../models/index.js';

class OfficialBotService {
  constructor() {
    this.cachedBotUser = null;
  }

  async ensureOfficialAccount() {
    if (this.cachedBotUser) {
      return this.cachedBotUser;
    }

    let bot = await User.findOne({ where: { username: 'spotinize' } });
    if (!bot) {
      bot = await User.create({
        username: 'spotinize',
        displayName: 'Spotinize',
        password: 'OFFICIAL_SYSTEM_ACCOUNT_DISABLED',
        bio: 'Official Spotinize Music Curator, Stats & Daily Blind Drop 🎧',
        isOfficial: true
      });
      console.log('[OfficialBotService] Created official @spotinize account:', bot.id);
    } else if (!bot.isOfficial) {
      await bot.update({ isOfficial: true });
    }

    this.cachedBotUser = bot;
    return bot;
  }
}

export const officialBotService = new OfficialBotService();
export default officialBotService;
