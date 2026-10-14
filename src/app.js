import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import friendRoutes from './routes/friendRoutes.js';
import playlistRoutes from './routes/playlistRoutes.js';
import spotifyRoutes from './routes/spotifyRoutes.js';
import audioRoutes from './routes/audioRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import deployRoutes from './routes/deployRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class App {
  constructor() {
    this.app = express();
    this.configureMiddleware();
    this.configureRoutes();
  }

  configureMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '20mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '20mb' }));
    this.app.use(morgan('dev'));

    // Static folder for audio cache & image cache
    const audioCacheDir = path.resolve(__dirname, '../audio_cache');
    const imageCacheDir = path.resolve(__dirname, '../image_cache');
    this.app.use('/cache', express.static(audioCacheDir));
    this.app.use('/api/image', express.static(imageCacheDir, { maxAge: '30d' }));
  }

  configureRoutes() {
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'spotinize-controller', timestamp: new Date() });
    });
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', service: 'spotinize-controller', timestamp: new Date() });
    });

    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/game', gameRoutes);
    this.app.use('/api/profile', profileRoutes);
    this.app.use('/api/friends', friendRoutes);
    this.app.use('/api/playlists', playlistRoutes);
    this.app.use('/api/spotify', spotifyRoutes);
    this.app.use('/api/audio', audioRoutes);
    this.app.use('/api/notifications', notificationRoutes);
    this.app.use('/api/deploy', deployRoutes);

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }

  getApp() {
    return this.app;
  }
}

export const appInstance = new App();
export const app = appInstance.getApp();
export default app;
