import http from 'http';
import dotenv from 'dotenv';
import { app } from './app.js';
import { database } from './config/database.js';
import { SocketServer } from './config/socket.js';
import { reconnectService } from './services/ReconnectService.js';
import { matchmakingService } from './services/MatchmakingService.js';
import { gameService } from './services/GameService.js';
import { officialBotService } from './services/OfficialBotService.js';
import { aiContentService } from './services/AiContentService.js';
import { cosmeticService } from './services/CosmeticService.js';
import { rankedService } from './services/RankedService.js';
import { dailyLoginService } from './services/DailyLoginService.js';
import { dailyChallengeService } from './services/DailyChallengeService.js';
import { leaderboardService } from './services/LeaderboardService.js';
import './models/index.js'; // initialize associations

dotenv.config();

const PORT = process.env.PORT || 3001;

async function bootstrap() {
  try {
    console.log('🚀 Starting Spotinize Controller Server...');

    // 1. Connect & Sync MySQL Database
    await database.connect();
    await database.sync();

    // Ensure @spotinize official account exists & seed v0.7 catalog/daily/season
    await officialBotService.ensureOfficialAccount().catch(err => {
      console.warn('[Bootstrap] Official bot init notice:', err.message);
    });
    await cosmeticService.seedDefaultCatalog().catch(err => {
      console.warn('[Bootstrap] Cosmetic catalog seed notice:', err.message);
    });
    await rankedService.ensureActiveSeason().catch(err => {
      console.warn('[Bootstrap] Ranked season init notice:', err.message);
    });
    dailyLoginService.ensureWeeklySchedule().catch(err => {
      console.warn('[Bootstrap] Weekly daily login init notice:', err.message);
    });
    dailyChallengeService.ensureTodayChallenge().catch(err => {
      console.warn('[Bootstrap] Daily challenge init notice:', err.message);
    });
    leaderboardService.backfillAllUsersPowerScore().catch(() => {});

    // Check daily/weekly WIB rollovers every 5 minutes
    setInterval(() => {
      dailyLoginService.ensureWeeklySchedule().catch(() => {});
      dailyChallengeService.ensureTodayChallenge().catch(() => {});
      rankedService.ensureActiveSeason().catch(() => {});
    }, 5 * 60 * 1000);

    aiContentService.startScheduler();

    // Sweep stale rooms/disconnected players left over from previous restarts
    reconnectService.sweepStaleSessions(matchmakingService, gameService).catch(err => {
      console.warn('[Bootstrap] Stale session sweep notice:', err.message);
    });
    setInterval(() => {
      reconnectService.sweepStaleSessions(matchmakingService, gameService).catch(() => {});
    }, 10 * 60 * 1000);

    // 2. Create HTTP & Socket.IO server
    const server = http.createServer(app);
    const socketServer = new SocketServer(server);
    app.set('socketServer', socketServer);
    app.set('io', socketServer.getIO());

    // 3. Start Listening
    server.listen(PORT, () => {
      console.log(`🎮 Spotinize Controller running at http://localhost:${PORT}`);
      console.log(`🔌 Socket.IO ready on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start Spotinize Controller:', error);
    process.exit(1);
  }
}

bootstrap();
