import http from 'http';
import dotenv from 'dotenv';
import { app } from './app.js';
import { database } from './config/database.js';
import { SocketServer } from './config/socket.js';
import './models/index.js'; // initialize associations

dotenv.config();

const PORT = process.env.PORT || 3001;

async function bootstrap() {
  try {
    console.log('🚀 Starting Spotinize Controller Server...');

    // 1. Connect & Sync SQLite Database
    await database.connect();
    await database.sync();

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
