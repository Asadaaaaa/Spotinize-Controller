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
import './models/index.js'; // initialize associations

dotenv.config();

const PORT = process.env.PORT || 3001;

async function bootstrap() {
  try {
    console.log('🚀 Starting Spotinize Controller Server...');

    // 1. Connect & Sync MySQL Database
    await database.connect();
    await database.sync();

    // Ensure @spotinize official account exists & start AI Content Scheduler
    await officialBotService.ensureOfficialAccount().catch(err => {
      console.warn('[Bootstrap] Official bot init notice:', err.message);
    });
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
