import crypto from 'crypto';
import axios from 'axios';
import Parser from 'rss-parser';
import { Op, fn, col, literal } from 'sequelize';
import { AiContentLog, Post, Track, GameRound, Guess } from '../models/index.js';
import { officialBotService } from './OfficialBotService.js';
import { spotifyService } from './SpotifyService.js';

const CATEGORIES = ['news', 'hardest_song', 'official_blind_drop', 'fun_fact'];

const RSS_FEEDS = [
  { name: 'Google News Musik Indonesia', url: 'https://news.google.com/rss/search?q=konser+musik+indonesia+OR+tampil+di+indonesia+OR+lagu+viral+indonesia&hl=id&gl=ID&ceid=ID:id', region: 'id' },
  { name: 'Google News Konser & Band ID', url: 'https://news.google.com/rss/search?q=my+chemical+romance+indonesia+OR+konser+jakarta+OR+trending+musik+indonesia&hl=id&gl=ID&ceid=ID:id', region: 'id' },
  { name: 'Billboard', url: 'https://www.billboard.com/feed/', region: 'global' },
  { name: 'NME Music', url: 'https://www.nme.com/news/music/feed', region: 'global' }
];

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function getIsoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

class AiContentService {
  constructor() {
    this.parser = new Parser({ timeout: 8000 });
    this.intervalHandle = null;
    this.isRunning = false;
    this.categoryCursor = 0;
  }

  async isDuplicate(topicHash) {
    const existing = await AiContentLog.findOne({ where: { topicHash }, attributes: ['id'] });
    return Boolean(existing);
  }

  async _getTrendingContextText() {
    try {
      const [globalTracks, indoTracks] = await Promise.all([
        spotifyService.getTopTracks('Global Trends').catch(() => []),
        spotifyService.getTopTracks('Indonesia Trends').catch(() => [])
      ]);
      const globalList = (globalTracks || []).slice(0, 12).map(t => `${t.artist} - ${t.title}`).join(', ');
      const indoList = (indoTracks || []).slice(0, 12).map(t => `${t.artist} - ${t.title}`).join(', ');
      return { globalList, indoList };
    } catch {
      return { globalList: '', indoList: '' };
    }
  }

  async pickNewsCandidates() {
    const { globalList, indoList } = await this._getTrendingContextText();
    const candidates = [];

    for (const feedSource of RSS_FEEDS) {
      try {
        const parsed = await this.parser.parseURL(feedSource.url);
        const items = (parsed?.items || []).slice(0, 6);
        for (const item of items) {
          const link = item.link || item.guid || item.title;
          if (!link) continue;
          const topicHash = sha256(`news:${link}`);
          const titleKey = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
          const titleHash = titleKey ? sha256(`news_title:${titleKey}`) : null;
          if (await this.isDuplicate(topicHash)) continue;
          if (titleHash && await this.isDuplicate(titleHash)) continue;

          candidates.push({
            category: 'news',
            topicHash,
            titleHash,
            sourceUrl: item.link || null,
            sourceName: feedSource.name,
            region: feedSource.region === 'id' ? 'Indonesia' : 'Global',
            title: item.title || '',
            snippet: (item.contentSnippet || item.content || '').slice(0, 220),
            rawSource: JSON.stringify({
              source: feedSource.name,
              title: item.title,
              snippet: (item.contentSnippet || '').slice(0, 220),
              pubDate: item.pubDate || null
            })
          });
        }
      } catch (err) {
        console.warn(`[AiContentService] RSS fetch skipped (${feedSource.name}):`, err.message);
      }
    }

    if (candidates.length === 0) return null;
    return { category: 'news', candidates: candidates.slice(0, 15), globalList, indoList };
  }

  async rankAndWriteBestNews(newsBatch) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !newsBatch?.candidates?.length) return null;

    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const listText = newsBatch.candidates
      .map((c, idx) => `[${idx}] (${c.region} - ${c.sourceName}) ${c.title} | ${c.snippet}`)
      .join('\n');

    const instruction = `Kamu adalah kurator musik akun resmi @spotinize.
Di bawah ini ada beberapa kandidat berita musik. Tugasmu:
1. Ranking semua kandidat berdasarkan relevansi dengan:
   - Artis/lagu yang sedang masuk Global Trends atau Indonesia Trends saat ini, ATAU
   - Konser, festival, tur di Indonesia, atau tren musik yang sedang ramai di Indonesia.
2. Pilih HANYA 1 kandidat terbaik (paling relevan/paling ramai). Jika TIDAK ADA satupun yang relevan dengan Global Trends atau tren musik/konser Indonesia, kembalikan {"relevant": false}.
3. Untuk kandidat terpilih, tulis postingan singkat bilingual tanpa mengarang fakta di luar konteks.
Kembalikan JSON valid:
{
  "relevant": true/false,
  "selected_index": 0,
  "content_id": "Teks santai bahasa Indonesia ala X/Threads (maks 260 karakter, tanpa markdown)",
  "content_en": "Casual English equivalent (max 260 chars, no markdown)"
}`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [{
            text: `${instruction}\n\nGlobal Trends saat ini: ${newsBatch.globalList || '-'}\nIndonesia Trends saat ini: ${newsBatch.indoList || '-'}\n\nKandidat Berita:\n${listText}`
          }]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.5
        }
      },
      { timeout: 15000 }
    );

    const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;
    const parsed = JSON.parse(rawText);
    if (parsed?.relevant === false) {
      return { notRelevant: true, candidates: newsBatch.candidates };
    }

    const idx = Number(parsed?.selected_index);
    const chosen = newsBatch.candidates[idx] || newsBatch.candidates[0];
    if (!chosen || !parsed?.content_id || !parsed?.content_en) return null;

    return {
      notRelevant: false,
      chosen,
      discarded: newsBatch.candidates.filter((_, i) => i !== idx),
      contentId: String(parsed.content_id).slice(0, 500),
      contentEn: String(parsed.content_en).slice(0, 500)
    };
  }

  async pickHardestSongContext() {
    const weekKey = getIsoWeekKey();
    const rows = await Guess.findAll({
      attributes: [
        [col('round.track_id'), 'trackId'],
        [fn('COUNT', col('Guess.id')), 'totalGuesses'],
        [fn('SUM', literal('CASE WHEN Guess.is_correct = 1 THEN 1 ELSE 0 END')), 'correctCount']
      ],
      include: [{ model: GameRound, as: 'round', attributes: [], required: true }],
      group: ['round.track_id'],
      having: literal('COUNT(Guess.id) >= 3'),
      order: [[literal('correctCount / COUNT(Guess.id)'), 'ASC'], [literal('totalGuesses'), 'DESC']],
      limit: 10,
      raw: true
    });

    for (const row of rows) {
      if (!row.trackId) continue;
      const topicHash = sha256(`hardest_song:${row.trackId}:${weekKey}`);
      if (await this.isDuplicate(topicHash)) continue;

      const track = await Track.findByPk(row.trackId);
      if (!track) continue;

      const total = Number(row.totalGuesses || 0);
      const correct = Number(row.correctCount || 0);
      const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : 0;

      return {
        category: 'hardest_song',
        topicHash,
        sourceUrl: null,
        sourceName: 'Spotinize Game Stats',
        rawSource: JSON.stringify({ trackId: track.id, title: track.title, artist: track.artist, total, correct, accuracyPct }),
        promptContext: `Kategori: Statistik Lagu Tersulit Minggu Ini\nLagu: "${track.title}" oleh ${track.artist}\nTotal percobaan: ${total} tebakan\nAkurasi benar: ${accuracyPct}%`,
        track
      };
    }

    return null;
  }

  async pickOfficialBlindDropContext() {
    const weekKey = getIsoWeekKey();
    const tracks = await Track.findAll({
      where: {
        previewUrl: { [Op.ne]: null }
      },
      order: literal('RAND()'),
      limit: 15
    });

    for (const track of tracks) {
      const topicHash = sha256(`official_blind_drop:${track.id}:${weekKey}`);
      if (await this.isDuplicate(topicHash)) continue;

      return {
        category: 'official_blind_drop',
        topicHash,
        sourceUrl: null,
        sourceName: 'Spotinize Daily Blind Drop',
        rawSource: JSON.stringify({ trackId: track.id, title: track.title, artist: track.artist, album: track.album, genre: track.genre, releaseYear: track.releaseYear }),
        promptContext: `Kategori: Official Blind Song Drop (Tebak Lagu Rahasia)\nLagu target (JANGAN sebut judul & nama artist secara langsung!): "${track.title}" oleh ${track.artist}\nAlbum: ${track.album || '-'}\nGenre: ${track.genre || track.category || '-'}\nTahun rilis: ${track.releaseYear || '-'}`,
        track
      };
    }

    return null;
  }

  async pickFunFactContext() {
    const tracks = await Track.findAll({
      order: literal('RAND()'),
      limit: 15
    });

    for (const track of tracks) {
      const topicHash = sha256(`fun_fact:${track.id}`);
      if (await this.isDuplicate(topicHash)) continue;

      return {
        category: 'fun_fact',
        topicHash,
        sourceUrl: null,
        sourceName: 'Spotinize Music Trivia',
        rawSource: JSON.stringify({ trackId: track.id, title: track.title, artist: track.artist, album: track.album, releaseYear: track.releaseYear, genre: track.genre }),
        promptContext: `Kategori: Fakta & Trivia Lagu\nLagu: "${track.title}" oleh ${track.artist}\nAlbum: ${track.album || '-'}\nTahun rilis: ${track.releaseYear || '-'}\nGenre: ${track.genre || track.category || '-'}`,
        track
      };
    }

    return null;
  }

  async generateBilingualCopy(context) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return null;
    }

    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const isBlindDrop = context.category === 'official_blind_drop';
    const isNews = context.category === 'news';

    const instruction = isBlindDrop
      ? `Kamu adalah kurator musik akun resmi @spotinize. Buat postingan singkat untuk "Official Blind Drop" (tebak lagu berhadiah poin komunitas).
PENTING: Jangan pernah menyebut judul lagu atau nama artistnya di teks maupun di clue!
Kembalikan JSON valid dengan field:
{
  "relevant": true,
  "content_id": "Ajakan santai bahasa Indonesia ala X/Threads (maks 240 karakter, tanpa markdown)",
  "content_en": "Casual English equivalent (max 240 chars, no markdown)",
  "clue_id": "Clue singkat bahasa Indonesia berdasarkan genre/era/vibe (maks 100 karakter)",
  "clue_en": "Short English clue based on genre/era/vibe (max 100 chars)"
}`
      : isNews
      ? `Kamu adalah kurator musik akun resmi @spotinize. Evaluasi berita di konteks:
ATURAN KETAT RELEVANSI:
Berita ini HANYA BOLEH diposting ("relevant": true) jika berkaitan langsung dengan:
1. Artis atau lagu yang sedang masuk daftar Global Trends / Indonesia Trends pada konteks, ATAU
2. Konser, festival, tur di Indonesia, atau tren/fenomena musik yang sedang ramai di Indonesia (contoh: band internasional tampil di Indonesia seperti My Chemical Romance, lagu viral di Indonesia, rilisan besar artis yang populer di Indonesia).
Jika berita TIDAK relate dengan Global Trends maupun tren musik/konser di Indonesia (misalnya gosip kecil artis non-trending di luar negeri), WAJIB kembalikan {"relevant": false}.
Jangan mengarang fakta di luar konteks (zero hallucination).
Kembalikan JSON valid:
{
  "relevant": true/false,
  "content_id": "Teks santai bahasa Indonesia ala kurator musik X/Threads (maks 260 karakter, tanpa markdown)",
  "content_en": "Casual English equivalent (max 260 chars, no markdown)"
}`
      : `Kamu adalah kurator musik akun resmi @spotinize. Tulis postingan singkat berdasarkan HANYA fakta dari konteks di bawah (zero hallucination, jangan mengarang angka/fakta baru).
Kembalikan JSON valid dengan field:
{
  "relevant": true,
  "content_id": "Teks santai bahasa Indonesia ala kurator musik X/Threads (maks 260 karakter, tanpa markdown)",
  "content_en": "Casual English equivalent (max 260 chars, no markdown)"
}`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [{ text: `${instruction}\n\nKonteks:\n${context.promptContext}` }]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7
        }
      },
      { timeout: 15000 }
    );

    const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    if (parsed?.relevant === false) {
      return { notRelevant: true };
    }
    if (!parsed?.content_id || !parsed?.content_en) return null;

    return {
      notRelevant: false,
      contentId: String(parsed.content_id).slice(0, 500),
      contentEn: String(parsed.content_en).slice(0, 500),
      clueId: parsed.clue_id ? String(parsed.clue_id).slice(0, 255) : null,
      clueEn: parsed.clue_en ? String(parsed.clue_en).slice(0, 255) : null
    };
  }

  async runOnce({ respectHourlyCooldown = false } = {}) {
    if (this.isRunning) {
      return { skipped: true, reason: 'already_running' };
    }

    if (!process.env.GEMINI_API_KEY) {
      console.warn('[AiContentService] GEMINI_API_KEY is not set; skipping AI content generation.');
      return { skipped: true, reason: 'missing_gemini_api_key' };
    }

    this.isRunning = true;
    try {
      const botUser = await officialBotService.ensureOfficialAccount();

      if (respectHourlyCooldown) {
        const lastBotPost = await Post.findOne({
          where: { userId: botUser.id },
          order: [['createdAt', 'DESC']],
          attributes: ['id', 'createdAt']
        });
        if (lastBotPost?.createdAt) {
          const elapsedMs = Date.now() - new Date(lastBotPost.createdAt).getTime();
          if (elapsedMs < 55 * 60 * 1000) {
            return { skipped: true, reason: 'hourly_cooldown_active' };
          }
        }
      }

      let context = null;
      for (let i = 0; i < CATEGORIES.length; i += 1) {
        const cat = CATEGORIES[(this.categoryCursor + i) % CATEGORIES.length];
        if (cat === 'news') context = await this.pickNewsCandidates();
        else if (cat === 'hardest_song') context = await this.pickHardestSongContext();
        else if (cat === 'official_blind_drop') context = await this.pickOfficialBlindDropContext();
        else if (cat === 'fun_fact') context = await this.pickFunFactContext();

        if (context) {
          this.categoryCursor = (this.categoryCursor + i + 1) % CATEGORIES.length;
          break;
        }
      }

      if (!context) {
        return { skipped: true, reason: 'no_fresh_context' };
      }

      if (context.category === 'news') {
        const ranked = await this.rankAndWriteBestNews(context);
        if (!ranked) {
          return { skipped: true, reason: 'gemini_empty_response' };
        }
        if (ranked.notRelevant) {
          for (const c of ranked.candidates) {
            await AiContentLog.create({
              topicHash: c.topicHash,
              category: 'news',
              rawSource: c.rawSource,
              postId: null,
              status: 'SKIPPED_NOT_RELEVANT'
            }).catch(() => {});
          }
          return { skipped: true, reason: 'not_relevant', category: 'news' };
        }

        const chosen = ranked.chosen;
        const post = await Post.create({
          userId: botUser.id,
          type: 'official_ai',
          subtype: 'news',
          content: ranked.contentId,
          contentEn: ranked.contentEn,
          sourceUrl: chosen.sourceUrl,
          sourceName: chosen.sourceName
        });

        await AiContentLog.create({
          topicHash: chosen.topicHash,
          category: 'news',
          rawSource: chosen.rawSource,
          postId: post.id,
          status: 'PUBLISHED'
        }).catch(() => {});
        if (chosen.titleHash) {
          await AiContentLog.create({
            topicHash: chosen.titleHash,
            category: 'news',
            rawSource: chosen.rawSource,
            postId: post.id,
            status: 'PUBLISHED'
          }).catch(() => {});
        }
        for (const d of ranked.discarded || []) {
          await AiContentLog.create({
            topicHash: d.topicHash,
            category: 'news',
            rawSource: d.rawSource,
            postId: null,
            status: 'SKIPPED_OUTRANKED'
          }).catch(() => {});
        }

        console.log(`[AiContentService] Published ranked #1 @spotinize news post (${post.id})`);
        return { published: true, category: 'news', postId: post.id };
      }

      const generated = await this.generateBilingualCopy(context);
      if (generated?.notRelevant) {
        await AiContentLog.create({
          topicHash: context.topicHash,
          category: context.category,
          rawSource: context.rawSource,
          postId: null,
          status: 'SKIPPED_NOT_RELEVANT'
        }).catch(() => {});
        console.log(`[AiContentService] Skipped unrelated ${context.category} item`);
        return { skipped: true, reason: 'not_relevant', category: context.category };
      }
      if (!generated) {
        return { skipped: true, reason: 'gemini_empty_response' };
      }

      const isBlindDrop = context.category === 'official_blind_drop';
      const post = await Post.create({
        userId: botUser.id,
        type: isBlindDrop ? 'blind_drop' : 'official_ai',
        subtype: context.category,
        content: generated.contentId,
        contentEn: generated.contentEn,
        sourceUrl: context.sourceUrl,
        sourceName: context.sourceName,
        trackId: context.track?.id || null,
        trackTitle: context.track?.title || null,
        trackArtist: context.track?.artist || null,
        trackCover: context.track?.albumArt || null,
        trackPreviewUrl: context.track?.previewUrl || null,
        trackSpotifyId: context.track?.spotifyId || null,
        clue: isBlindDrop ? (generated.clueId || generated.clueEn || null) : null
      });

      await AiContentLog.create({
        topicHash: context.topicHash,
        category: context.category,
        rawSource: context.rawSource,
        postId: post.id,
        status: 'PUBLISHED'
      });
      if (context.titleHash) {
        await AiContentLog.create({
          topicHash: context.titleHash,
          category: context.category,
          rawSource: context.rawSource,
          postId: post.id,
          status: 'PUBLISHED'
        }).catch(() => {});
      }

      console.log(`[AiContentService] Published @spotinize ${context.category} post (${post.id})`);
      return { published: true, category: context.category, postId: post.id };
    } catch (error) {
      console.error('[AiContentService] Run failed:', error.message);
      return { error: error.message };
    } finally {
      this.isRunning = false;
    }
  }

  startScheduler() {
    if (process.env.AI_CRON_ENABLED === 'false') {
      console.log('[AiContentService] Scheduler disabled via AI_CRON_ENABLED=false');
      return;
    }

    if (this.intervalHandle) return;

    const ONE_HOUR_MS = 60 * 60 * 1000;
    // Check 15s after boot (respecting 1-hour cooldown so restarts never spam), then every 1 hour
    setTimeout(() => {
      this.runOnce({ respectHourlyCooldown: true }).catch(() => {});
    }, 15000);

    this.intervalHandle = setInterval(() => {
      this.runOnce({ respectHourlyCooldown: true }).catch(() => {});
    }, ONE_HOUR_MS);

    console.log('[AiContentService] Hourly scheduler started.');
  }
}

export const aiContentService = new AiContentService();
export default aiContentService;
