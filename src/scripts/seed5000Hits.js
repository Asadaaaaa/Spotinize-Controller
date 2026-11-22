import axios from 'axios';
import crypto from 'crypto';
import { sequelize } from '../config/database.js';
import { Track } from '../models/index.js';

const RESEARCH_QUERIES = [
  // Indonesian Legends & Modern Hits (50)
  ['Dewa 19', 'ROCK'], ['Sheila On 7', 'ROCK'], ['Tulus', 'POP'], ['Bernadya', 'INDIE_ID'],
  ['Hindia', 'INDIE_ID'], ['Nadin Amizah', 'INDIE_ID'], ['Mahalini', 'POP'], ['Lyodra', 'POP'],
  ['Tiara Andini', 'POP'], ['Rizky Febian', 'POP'], ['NOAH', 'ROCK'], ['Peterpan', 'ROCK'],
  ['Ungu', 'POP'], ['Nidji', 'ROCK'], ['Gigi', 'ROCK'], ['Padi', 'ROCK'],
  ['Slank', 'ROCK'], ['Chrisye', 'POP'], ['Iwan Fals', 'ROCK'], ['Kahitna', 'POP'],
  ['Rossa', 'POP'], ['Raisa', 'POP'], ['Afgan', 'RNB'], ['Judika', 'POP'],
  ['Pamungkas', 'INDIE_ID'], ['Fourtwnty', 'INDIE_ID'], ['Payung Teduh', 'INDIE_ID'], ['.Feast', 'INDIE_ID'],
  ['Juicy Luicy', 'INDIE_ID'], ['Sal Priadi', 'INDIE_ID'], ['Denny Caknan', 'POP'], ['Happy Asmara', 'POP'],
  ['Budi Doremi', 'POP'], ['Virgoun', 'POP'], ['Letto', 'POP'], ['Armada', 'POP'],
  ['Wali', 'POP'], ['Geisha', 'POP'], ['D\'Masiv', 'POP'], ['Kotak', 'ROCK'],
  ['Andra and The Backbone', 'ROCK'], ['Yura Yunita', 'POP'], ['Maliq & D\'Essentials', 'JAZZ'], ['RAN', 'POP'],
  ['HIVI!', 'POP'], ['Mocca', 'INDIE_ID'], ['Naif', 'ROCK'], ['Tipe-X', 'ROCK'],
  ['Fiersa Besari', 'INDIE_ID'], ['Feby Putri', 'INDIE_ID'],

  // Global Pop / R&B / Hip-Hop / Rock / EDM / K-Pop / J-Pop (55)
  ['Taylor Swift', 'POP'], ['The Weeknd', 'RNB'], ['Bruno Mars', 'POP'], ['Ed Sheeran', 'POP'],
  ['Justin Bieber', 'POP'], ['Ariana Grande', 'POP'], ['Billie Eilish', 'POP'], ['Dua Lipa', 'POP'],
  ['Coldplay', 'ROCK'], ['Maroon 5', 'POP'], ['Drake', 'HIPHOP'], ['Kendrick Lamar', 'HIPHOP'],
  ['Eminem', 'HIPHOP'], ['Post Malone', 'HIPHOP'], ['Travis Scott', 'HIPHOP'], ['Rihanna', 'RNB'],
  ['Beyonce', 'RNB'], ['Lady Gaga', 'POP'], ['Katy Perry', 'POP'], ['Adele', 'POP'],
  ['Shawn Mendes', 'POP'], ['Harry Styles', 'POP'], ['Olivia Rodrigo', 'POP'], ['Sabrina Carpenter', 'POP'],
  ['SZA', 'RNB'], ['Frank Ocean', 'RNB'], ['Kanye West', 'HIPHOP'], ['Queen', 'ROCK'],
  ['Michael Jackson', 'POP'], ['The Beatles', 'ROCK'], ['Nirvana', 'ROCK'], ['Linkin Park', 'ROCK'],
  ['Green Day', 'ROCK'], ['Arctic Monkeys', 'ALTERNATIVE'], ['Imagine Dragons', 'ALTERNATIVE'], ['Twenty One Pilots', 'ALTERNATIVE'],
  ['Avicii', 'DANCE'], ['Calvin Harris', 'DANCE'], ['David Guetta', 'DANCE'], ['Martin Garrix', 'DANCE'],
  ['The Chainsmokers', 'DANCE'], ['Daft Punk', 'DANCE'], ['BTS', 'KPOP'], ['BLACKPINK', 'KPOP'],
  ['NewJeans', 'KPOP'], ['SEVENTEEN', 'KPOP'], ['Stray Kids', 'KPOP'], ['TWICE', 'KPOP'],
  ['EXO', 'KPOP'], ['aespa', 'KPOP'], ['YOASOBI', 'JPOP'], ['Kenshi Yonezu', 'JPOP'],
  ['Fujii Kaze', 'JPOP'], ['Official HIGE DANDism', 'JPOP'], ['Frank Sinatra', 'JAZZ']
];

async function fetchItunesBatch(term, genreTag) {
  try {
    const res = await axios.get('https://itunes.apple.com/search', {
      params: { term, media: 'music', entity: 'song', limit: 60 },
      timeout: 7000
    });
    const items = res.data?.results || [];
    const now = new Date();
    return items
      .filter(it => it.trackId && it.trackName && it.artistName && it.previewUrl)
      .map(it => {
        const year = it.releaseDate ? parseInt(String(it.releaseDate).slice(0, 4), 10) : null;
        return {
          id: crypto.randomUUID(),
          spotify_id: `itunes_${it.trackId}`,
          title: it.trackName.slice(0, 250),
          artist: it.artistName.slice(0, 250),
          album: (it.collectionName || it.trackName).slice(0, 250),
          album_art: it.artworkUrl100 ? it.artworkUrl100.replace('100x100bb', '600x600bb') : null,
          preview_url: it.previewUrl,
          category: 'Genre',
          genre: genreTag,
          release_year: Number.isNaN(year) ? null : year,
          duration_ms: it.trackTimeMillis || 30000,
          popularity: 75,
          created_at: now,
          updated_at: now
        };
      });
  } catch (err) {
    return [];
  }
}

async function main() {
  const startCount = await Track.count();
  console.log(`🚀 [Seed5000] Starting research across ${RESEARCH_QUERIES.length} artists (current tracks=${startCount})...`);

  const concurrency = 5;
  let fetchedTotal = 0;

  for (let i = 0; i < RESEARCH_QUERIES.length; i += concurrency) {
    const chunk = RESEARCH_QUERIES.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(([term, genre]) => fetchItunesBatch(term, genre)));
    const rows = results.flat();
    fetchedTotal += rows.length;

    if (rows.length > 0) {
      await sequelize.getQueryInterface().bulkInsert('tracks', rows, {
        ignoreDuplicates: true
      });
    }
    console.log(`📦 [Seed5000] Batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(RESEARCH_QUERIES.length / concurrency)}: fetched ${rows.length} tracks`);
  }

  const endCount = await Track.count();
  console.log(`🎉 [Seed5000] Done! Fetched=${fetchedTotal}, Added=${endCount - startCount}, Total tracks in DB=${endCount}`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ [Seed5000] Fatal error:', err);
  process.exit(1);
});
