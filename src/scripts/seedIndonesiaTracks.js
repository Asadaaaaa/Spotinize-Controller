import axios from 'axios';
import crypto from 'crypto';
import { sequelize } from '../config/database.js';
import { Track } from '../models/index.js';

const CURATED_INDO_TRENDS = [
  ['Satu Bulan', 'Bernadya', 'Sialnya, Hidup Harus Tetap Berjalan', 2024],
  ['Kata Mereka Ini Berlebihan', 'Bernadya', 'Sialnya, Hidup Harus Tetap Berjalan', 2024],
  ['Untungnya, Hidup Harus Tetap Berjalan', 'Bernadya', 'Sialnya, Hidup Harus Tetap Berjalan', 2024],
  ['Kini Mereka Tahu', 'Bernadya', 'Sialnya, Hidup Harus Tetap Berjalan', 2024],
  ['Lama-Lama', 'Bernadya', 'Sialnya, Hidup Harus Tetap Berjalan', 2024],
  ['Apa Mungkin', 'Bernadya', 'Terlintas', 2023],
  ['Gala Bunga Matahari', 'Sal Priadi', 'MARKERS AND SUCH PENS FLASHDISKS', 2024],
  ['Dari Planet Lain', 'Sal Priadi', 'MARKERS AND SUCH PENS FLASHDISKS', 2024],
  ['Sial', 'Mahalini', 'Fabula', 2023],
  ['Mati-Matian', 'Mahalini', 'Mati-Matian', 2024],
  ['Bohongi Hati', 'Mahalini', 'Fabula', 2023],
  ['Sisa Rasa', 'Mahalini', 'Fabula', 2021],
  ['Melawan Restu', 'Mahalini', 'Fabula', 2021],
  ['Komang', 'Raim Laode', 'Komang', 2022],
  ['Lesung Pipi', 'Raim Laode', 'Lesung Pipi', 2023],
  ['Tak Segampang Itu', 'Anggi Marito', 'Tak Segampang Itu', 2022],
  ['Pesan Terakhir', 'Lyodra', 'Lyodra', 2021],
  ['Sang Dewi', 'Lyodra, Andi Rianto', 'Sang Dewi', 2022],
  ['Tak Dianggap', 'Lyodra', 'Melangkah', 2023],
  ['Janji Setia', 'Tiara Andini', 'Tiara Andini', 2022],
  ['Merasa Indah', 'Tiara Andini', 'Tiara Andini', 2021],
  ['Usai', 'Tiara Andini', 'Usai', 2022],
  ['Kupu-Kupu', 'Tiara Andini', 'Kupu-Kupu', 2024],
  ['Bermuara', 'Rizky Febian, Mahalini', 'Bermuara', 2024],
  ['Kesempurnaan Cinta', 'Rizky Febian', 'Kesempurnaan Cinta', 2015],
  ['Cuek', 'Rizky Febian', 'Garis Cinta', 2020],
  ['Hati-Hati di Jalan', 'Tulus', 'Manusia', 2022],
  ['Interaksi', 'Tulus', 'Manusia', 2022],
  ['Diri', 'Tulus', 'Manusia', 2022],
  ['Monokrom', 'Tulus', 'Monokrom', 2016],
  ['Pamit', 'Tulus', 'Monokrom', 2016],
  ['Sepatu', 'Tulus', 'Gajah', 2014],
  ['Evaluasi', 'Hindia', 'Menari Dengan Bayangan', 2019],
  ['Rumah Ke Rumah', 'Hindia', 'Menari Dengan Bayangan', 2019],
  ['Secukupnya', 'Hindia', 'Menari Dengan Bayangan', 2019],
  ['Cincin', 'Hindia', 'Lagipula Hidup Akan Berakhir', 2023],
  ['Kita Ke Sana', 'Hindia', 'Lagipula Hidup Akan Berakhir', 2023],
  ['Nina', '.Feast', 'Membangun & Menghancurkan', 2024],
  ['Tarot', '.Feast', 'Membangun & Menghancurkan', 2024],
  ['Peradaban', '.Feast', 'Multiverses', 2018],
  ['Bertaut', 'Nadin Amizah', 'Selamat Ulang Tahun', 2020],
  ['Rayuan Perempuan Gila', 'Nadin Amizah', 'Untuk Dunia, Cinta, dan Kotornya', 2023],
  ['Sorai', 'Nadin Amizah', 'Sorai', 2019],
  ['Lantas', 'Juicy Luicy', 'Sentimental', 2020],
  ['Sialan', 'Juicy Luicy, Adrian Khalif', 'Nonfiksi', 2024],
  ['Tampar', 'Juicy Luicy', 'Nonfiksi', 2022],
  ['Serana', 'For Revenge', 'Perayaan Patah Hati', 2020],
  ['Jakarta Hari Ini', 'For Revenge, Stereo Wall', 'Perayaan Patah Hati', 2021],
  ['Jiwa Yang Bersedih', 'Ghea Indrawari', 'Berdamai', 2023],
  ['Tak Ingin Usai', 'Keisya Levronka', 'Leviosa', 2022],
  ['Runtuh', 'Feby Putri, Fiersa Besari', 'Riuh', 2021],
  ['Rumah Singgah', 'Fabio Asher', 'Rumah Singgah', 2022],
  ['Bertahan Terluka', 'Fabio Asher', 'Bertahan Terluka', 2022],
  ['Tutur Batin', 'Yura Yunita', 'Tutur Batin', 2021],
  ['Dunia Tipu-Tipu', 'Yura Yunita', 'Tutur Batin', 2021],
  ['To the Bone', 'Pamungkas', 'Flying Solo', 2019],
  ['Kenangan Manis', 'Pamungkas', 'Walk the Talk', 2018],
  ['Akad', 'Payung Teduh', 'Ruang Tunggu', 2017],
  ['Zona Nyaman', 'Fourtwnty', 'Ego & Fungsi Otak', 2017],
  ['Mangu', 'Fourtwnty, Charita Utami', 'Nalar', 2023],
  ['Melukis Senja', 'Budi Doremi', 'Melukis Senja', 2020],
  ['Asmalibrasi', 'Soegi Bornean', 'Atma', 2019],
  ['Surat Cinta Untuk Starla', 'Virgoun', 'Surat Cinta Untuk Starla', 2016],
  ['Bukti', 'Virgoun', 'Bukti', 2017],
  ['Kalih Welasku', 'Denny Caknan', 'Kalih Welasku', 2022],
  ['Kartonyono Medot Janji', 'Denny Caknan', 'Kartonyono Medot Janji', 2019],
  ['Los Dol', 'Denny Caknan', 'Los Dol', 2020],
  ['Cundamani', 'Denny Caknan', 'Cundamani', 2023],
  ['Rungkad', 'Happy Asmara', 'Rungkad', 2022],
  ['Nemen', 'NDX A.K.A', 'Nemen', 2023],
  ['Dumes', 'OMWAWES, Guyon Waton', 'Dumes', 2023]
];

const CURATED_NOSTALGIA_INDO = [
  ['Kala Cinta Menggoda', 'Chrisye', 'Kala Cinta Menggoda', 1997],
  ['Kisah Kasih di Sekolah', 'Chrisye', 'Dekade', 1987],
  ['Pergilah Kasih', 'Chrisye', 'Pergilah Kasih', 1989],
  ['Lilin-Lilin Kecil', 'Chrisye', 'Lilin-Lilin Kecil', 1977],
  ['Anak Sekolah', 'Chrisye', 'Nona Lisa', 1986],
  ['Badai Pasti Berlalu', 'Chrisye', 'Badai Pasti Berlalu', 1977],
  ['Kangen', 'Dewa 19', 'Dewa 19', 1992],
  ['Kirana', 'Dewa 19', 'Pandawa Lima', 1997],
  ['Aku Milikmu', 'Dewa 19', 'Format Masa Depan', 1994],
  ['Cukup Siti Nurbaya', 'Dewa 19', 'Terbaik Terbaik', 1995],
  ['Kamulah Satu-Satunya', 'Dewa 19', 'Pandawa Lima', 1997],
  ['Elang', 'Dewa 19', 'Pandawa Lima', 1997],
  ['Dan', 'Sheila On 7', 'Sheila On 7', 1999],
  ['Kita', 'Sheila On 7', 'Sheila On 7', 1999],
  ['Anugerah Terindah Yang Pernah Kumiliki', 'Sheila On 7', 'Sheila On 7', 1999],
  ['J.A.P', 'Sheila On 7', 'Sheila On 7', 1999],
  ['Terlalu Manis', 'Slank', 'Kampungan', 1991],
  ['Kamu Harus Pulang', 'Slank', 'Generasi Biru', 1994],
  ['Ku Tak Bisa', 'Slank', 'PLUR', 1999],
  ['Mawar Merah', 'Slank', 'Suit-Suit... He-He', 1990],
  ['Bento', 'Iwan Fals, Swami', 'Swami I', 1989],
  ['Bongkar', 'Iwan Fals, Swami', 'Swami I', 1989],
  ['Kemesraan', 'Iwan Fals', 'Kemesraan', 1988],
  ['Ibu', 'Iwan Fals', '1910', 1988],
  ['Oemar Bakri', 'Iwan Fals', 'Sarjana Muda', 1981],
  ['Bintang Kehidupan', 'Nike Ardilla', 'Bintang Kehidupan', 1990],
  ['Sandiwara Cinta', 'Nike Ardilla', 'Sandiwara Cinta', 1995],
  ['Seberkas Sinar', 'Nike Ardilla', 'Seberkas Sinar', 1989],
  ['Berita Kepada Kawan', 'Ebiet G. Ade', 'Camellia I', 1979],
  ['Titip Rindu Buat Ayah', 'Ebiet G. Ade', 'Menjaring Matahari', 1998],
  ['Yogyakarta', 'KLa Project', 'Kedua', 1990],
  ['Tentang Kita', 'KLa Project', 'KLa', 1989],
  ['Tak Bisa Ke Lain Hati', 'KLa Project', 'Pasir Putih', 1992],
  ['Cerita Cinta', 'Kahitna', 'Cerita Cinta', 1994],
  ['Cantik', 'Kahitna', 'Cantik', 1996],
  ['Andai Dia Tahu', 'Kahitna', 'Cerita Cinta', 1994],
  ['Burung Camar', 'Vina Panduwinata', 'Burung Camar', 1985],
  ['Surat Cinta', 'Vina Panduwinata', 'Cium Pipiku', 1987],
  ['Kaulah Segalanya', 'Ruth Sahanaya', 'Kaulah Segalanya', 1991],
  ['Keliru', 'Ruth Sahanaya', 'Kasih', 1999],
  ['Astaga', 'Ruth Sahanaya', 'Seputih Kasih', 1987],
  ['Kugadaikan Cintaku', 'Gombloh', 'Apel', 1986],
  ['Semut Hitam', 'God Bless', 'Semut Hitam', 1988],
  ['Rumah Kita', 'God Bless', 'Semut Hitam', 1988],
  ['Janji', 'Gigi', 'Dunia', 1995],
  ['Nirwana', 'Gigi', '2x2', 1997],
  ['Sobat', 'Padi', 'Lain Dunia', 1999],
  ['Mahadewi', 'Padi', 'Lain Dunia', 1999],
  ['Begitu Indah', 'Padi', 'Lain Dunia', 1999],
  ['Bukan Pujangga', 'Base Jam', 'Bermimpi', 1996],
  ['Kau Yang Terindah', 'Java Jive', 'Java Jive 1', 1994],
  ['Salah', 'Potret', 'Potret II', 1997],
  ['Bagaikan Langit', 'Potret', 'Cafe', 1998],
  ['Bujangan', 'Koes Plus', 'Volume 8', 1973],
  ['Kolam Susu', 'Koes Plus', 'Volume 8', 1973],
  ['Kisah Sedih di Hari Minggu', 'Koes Plus', 'Volume 4', 1972]
];

async function main() {
  const now = new Date();
  let itunesIndo = [];

  try {
    const res = await axios.get('https://itunes.apple.com/id/rss/topsongs/limit=50/json', { timeout: 6000 });
    const entries = res.data?.feed?.entry || [];
    itunesIndo = entries.map((e, idx) => {
      const title = e['im:name']?.label || '';
      const artist = e['im:artist']?.label || '';
      const rawImg = e['im:image']?.[2]?.label || e['im:image']?.[1]?.label || null;
      const albumArt = rawImg ? rawImg.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null;
      const previewUrl = e['link']?.find(l => l.attributes?.type?.includes('audio'))?.attributes?.href || null;
      const trackId = e['id']?.attributes?.['im:id'] || `idrss_${idx}`;
      return {
        id: crypto.randomUUID(),
        spotify_id: `id_trend_rss_${trackId}`,
        title: title.slice(0, 250),
        artist: artist.slice(0, 250),
        album: (e['im:collection']?.['im:name']?.label || title).slice(0, 250),
        album_art: albumArt,
        preview_url: previewUrl,
        category: 'Indonesia Trends',
        release_year: new Date().getFullYear(),
        duration_ms: 30000,
        popularity: 90,
        created_at: now,
        updated_at: now
      };
    }).filter(t => t.title && t.artist);
    console.log(`✅ Fetched ${itunesIndo.length} live iTunes Indonesia Top Songs`);
  } catch (err) {
    console.warn('⚠️ iTunes ID RSS fetch notice:', err.message);
  }

  const indoRows = CURATED_INDO_TRENDS.map(([title, artist, album, year], idx) => ({
    id: crypto.randomUUID(),
    spotify_id: `id_trend_cur_${idx + 1}`,
    title,
    artist,
    album,
    category: 'Indonesia Trends',
    release_year: year,
    duration_ms: 30000,
    popularity: 85,
    created_at: now,
    updated_at: now
  }));

  const nostalgiaRows = CURATED_NOSTALGIA_INDO.map(([title, artist, album, year], idx) => ({
    id: crypto.randomUUID(),
    spotify_id: `nostalgia_id_${idx + 1}`,
    title,
    artist,
    album,
    category: 'Nostalgia < 2000',
    release_year: year,
    duration_ms: 30000,
    popularity: 80,
    created_at: now,
    updated_at: now
  }));

  await sequelize.getQueryInterface().bulkInsert('tracks', [...itunesIndo, ...indoRows, ...nostalgiaRows], {
    ignoreDuplicates: true
  });

  const indoCount = await Track.count({ where: { category: 'Indonesia Trends' } });
  const nostalgiaCount = await Track.count({ where: { category: 'Nostalgia < 2000' } });
  const totalCount = await Track.count();

  console.log(`🎉 Done! Indonesia Trends=${indoCount}, Nostalgia < 2000=${nostalgiaCount}, Total tracks=${totalCount}`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ seedIndonesiaTracks error:', err);
  process.exit(1);
});
