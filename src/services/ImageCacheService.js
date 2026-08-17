import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGE_CACHE_DIR = path.resolve(__dirname, '../../image_cache');

export class ImageCacheService {
  constructor() {
    if (!fs.existsSync(IMAGE_CACHE_DIR)) {
      fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
    }
  }

  getImagePath(filename) {
    return path.join(IMAGE_CACHE_DIR, filename);
  }

  /**
   * Caches a remote artwork image URL onto local disk and returns local serving path
   */
  async cacheImage(remoteUrl) {
    if (!remoteUrl || typeof remoteUrl !== 'string') return null;
    if (remoteUrl.startsWith('/api/image/')) return remoteUrl;

    try {
      const hash = crypto.createHash('md5').update(remoteUrl).digest('hex');
      const filename = `${hash}.jpg`;
      const localPath = path.join(IMAGE_CACHE_DIR, filename);
      const localUrl = `/api/image/${filename}`;

      // If already on disk, return local url immediately
      if (fs.existsSync(localPath) && fs.statSync(localPath).size > 200) {
        return localUrl;
      }

      // Download and save to local disk
      const response = await axios.get(remoteUrl, {
        responseType: 'arraybuffer',
        timeout: 4000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      if (response.status === 200 && response.data?.byteLength > 100) {
        fs.writeFileSync(localPath, Buffer.from(response.data));
        return localUrl;
      }
    } catch (err) {
      // If caching fails, return original remoteUrl gracefully
    }

    return remoteUrl;
  }

  /**
   * Bulk caches images in background for search results or tracks
   */
  async bulkCacheImages(tracks) {
    if (!tracks || !Array.isArray(tracks)) return tracks;

    const enriched = await Promise.all(tracks.map(async (t) => {
      if (t.albumArt && !t.albumArt.startsWith('/api/image/')) {
        const cachedUrl = await this.cacheImage(t.albumArt);
        return { ...t, albumArt: cachedUrl };
      }
      return t;
    }));

    return enriched;
  }
}

export const imageCacheService = new ImageCacheService();
export default imageCacheService;
