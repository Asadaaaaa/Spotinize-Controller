import { sequelize } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resetDatabase() {
  try {
    console.log('🔄 Memulai proses reset database Spotinize...');
    await sequelize.authenticate();

    // Disable foreign key checks for clean truncation
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');

    const tables = [
      'friends',
      'game_histories',
      'guesses',
      'game_rounds',
      'game_players',
      'games',
      'recently_played',
      'search_caches',
      'tracks',
      'users'
    ];

    for (const table of tables) {
      await sequelize.query(`TRUNCATE TABLE \`${table}\`;`);
      console.log(`  ✓ Tabel [${table}] berhasil dikosongkan.`);
    }

    // Re-enable foreign key checks
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');

    // Clean audio cache directory
    const audioCacheDir = path.resolve(__dirname, '../../audio_cache');
    if (fs.existsSync(audioCacheDir)) {
      const files = fs.readdirSync(audioCacheDir);
      for (const file of files) {
        if (file !== '.gitkeep') {
          fs.unlinkSync(path.join(audioCacheDir, file));
        }
      }
      console.log(`  ✓ Audio cache (${files.length} files) dibersihkan.`);
    }

    // Clean image cache directory
    const imageCacheDir = path.resolve(__dirname, '../../image_cache');
    if (fs.existsSync(imageCacheDir)) {
      const files = fs.readdirSync(imageCacheDir);
      for (const file of files) {
        if (file !== '.gitkeep') {
          fs.unlinkSync(path.join(imageCacheDir, file));
        }
      }
      console.log(`  ✓ Image cache (${files.length} files) dibersihkan.`);
    }

    console.log('\n✅ Seluruh data pada database Spotinize berhasil direset bersih!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Gagal mereset database:', error);
    process.exit(1);
  }
}

resetDatabase();
