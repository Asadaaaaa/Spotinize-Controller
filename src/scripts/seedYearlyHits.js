import axios from 'axios';
import crypto from 'crypto';
import { sequelize } from '../config/database.js';
import { YearlyHit, Track } from '../models/index.js';

function decodeHtml(str = '') {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/^"|"$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBillboardWikiTable(html) {
  const tableMatch = html.match(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];

  const rows = tableMatch[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const songs = [];

  for (const row of rows) {
    const cells = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi);
    if (!cells || cells.length < 3) continue;

    const rankText = decodeHtml(cells[0]);
    const rank = parseInt(rankText, 10);
    if (Number.isNaN(rank) || rank < 1 || rank > 100) continue;

    const title = decodeHtml(cells[1]);
    const artist = decodeHtml(cells[2]);
    if (!title || !artist) continue;

    songs.push({ rank, title, artist });
  }

  return songs;
}

async function fetchYearFromWikipedia(year) {
  try {
    const url = `https://en.wikipedia.org/wiki/Billboard_Year-End_Hot_100_singles_of_${year}`;
    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'SpotinizeBot/1.0 (https://spotinize.hopto.org)'
      }
    });
    return parseBillboardWikiTable(res.data);
  } catch (err) {
    console.warn(`[SeedYearlyHits] Failed Wikipedia fetch for ${year}: ${err.message}`);
    return [];
  }
}

async function main() {
  const currentYear = new Date().getFullYear();
  const startYear = 1970;
  const years = [];
  for (let y = currentYear; y >= startYear; y--) {
    years.push(y);
  }

  console.log(`🚀 [SeedYearlyHits] Fetching & seeding yearly hits from ${startYear} to ${currentYear} (${years.length} years)...`);

  const concurrency = 6;
  let totalInserted = 0;

  for (let i = 0; i < years.length; i += concurrency) {
    const chunk = years.slice(i, i + concurrency);
    await Promise.all(chunk.map(async (year) => {
      const [yearlyHit] = await YearlyHit.findOrCreate({
        where: { year },
        defaults: {
          id: crypto.randomUUID(),
          year,
          label: `Hits ${year}`
        }
      });

      const existingCount = await Track.count({ where: { yearlyHitId: yearlyHit.id } });
      if (existingCount >= 100) {
        console.log(`✅ [SeedYearlyHits] ${year}: already has ${existingCount} tracks`);
        return;
      }

      const wikiSongs = await fetchYearFromWikipedia(year);
      if (wikiSongs.length === 0) {
        console.log(`⚠️ [SeedYearlyHits] ${year}: no Wikipedia Billboard table found`);
        return;
      }

      const now = new Date();
      const rows = wikiSongs.map((s) => ({
        id: crypto.randomUUID(),
        spotify_id: `yh_${year}_${s.rank}`,
        title: s.title.slice(0, 250),
        artist: s.artist.slice(0, 250),
        album: `Billboard Year-End ${year}`,
        category: 'Era & Tahun',
        release_year: year,
        yearly_hit_id: yearlyHit.id,
        duration_ms: 30000,
        popularity: Math.max(10, 101 - s.rank),
        created_at: now,
        updated_at: now
      }));

      await sequelize.getQueryInterface().bulkInsert('tracks', rows, {
        ignoreDuplicates: true
      });

      totalInserted += rows.length;
      console.log(`✅ [SeedYearlyHits] ${year}: seeded ${rows.length} tracks`);
    }));
  }

  const finalYearlyCount = await YearlyHit.count();
  const finalTrackCount = await Track.count({ where: { category: 'Era & Tahun' } });
  console.log(`🎉 [SeedYearlyHits] Done! yearly_hits=${finalYearlyCount}, Era & Tahun tracks=${finalTrackCount}, newly processed=${totalInserted}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ [SeedYearlyHits] Fatal error:', err);
  process.exit(1);
});
