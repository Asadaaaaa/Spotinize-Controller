import { Op } from 'sequelize';
import {
  DailyChallenge,
  DailyAttempt,
  Track,
  Game,
  GameRound,
  Guess,
  User,
  Post
} from '../models/index.js';
import { gameRepository } from '../repositories/GameRepository.js';
import { trackRepository } from '../repositories/TrackRepository.js';
import { spotifyService } from './SpotifyService.js';
import { audioService } from './AudioService.js';
import { officialBotService } from './OfficialBotService.js';
import { cosmeticService } from './CosmeticService.js';
import { getWibDateString, getWibYesterdayString } from '../utils/WibDate.js';

function shuffleFisherYates(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

class DailyChallengeService {
  constructor() {
    this.creationLocks = new Map();
  }

  async _buildCombinedPool() {
    const categories = ['Global Trends', 'Indonesia Trends', 'Nostalgia < 2000'];
    const results = await Promise.all(
      categories.map(cat => spotifyService.getTopTracks(cat).catch(() => []))
    );

    const byKey = new Map();
    categories.forEach((cat, idx) => {
      for (const t of results[idx] || []) {
        if (!t?.title) continue;
        const key = t.spotifyId || `${String(t.title).toLowerCase()}::${String(t.artist || '').toLowerCase()}`;
        if (!byKey.has(key)) {
          byKey.set(key, { ...t, sourceCategory: cat });
        }
      }
    });

    let pool = [...byKey.values()];

    // DB fallback if Spotify/catalog fetch is rate-limited
    if (pool.length < 5) {
      const dbTracks = await Track.findAll({
        where: {
          previewUrl: { [Op.ne]: null }
        },
        limit: 50,
        order: [['updatedAt', 'DESC']]
      });
      for (const t of dbTracks) {
        const key = t.spotifyId || `${t.title.toLowerCase()}::${t.artist.toLowerCase()}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            spotifyId: t.spotifyId,
            title: t.title,
            artist: t.artist,
            album: t.album,
            albumArt: t.albumArt,
            previewUrl: t.previewUrl,
            category: t.category,
            sourceCategory: t.category || 'Global Trends'
          });
        }
      }
      pool = [...byKey.values()];
    }

    return pool;
  }

  async _postYesterdayRecapIfNeeded(yesterdayDate) {
    try {
      const prev = await DailyChallenge.findOne({ where: { dailyDate: yesterdayDate } });
      if (!prev || prev.recapPosted) return;

      const top3 = await DailyAttempt.findAll({
        where: { dailyDate: yesterdayDate, status: 'COMPLETED' },
        include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'isOfficial'] }],
        order: [['score', 'DESC'], ['correctCount', 'DESC'], ['totalThinkingTime', 'ASC']],
        limit: 5
      });

      const validTop3 = top3.filter(a => a.user && !a.user.isOfficial).slice(0, 3);
      if (validTop3.length > 0) {
        const bot = await officialBotService.ensureOfficialAccount();
        const medals = ['#1', '#2', '#3'];
        const summaryLines = validTop3
          .map((a, idx) => `${medals[idx]} @${a.user.username} (${a.score} pts)`)
          .join(' • ');
        await Post.create({
          userId: bot.id,
          type: 'official_ai',
          subtype: 'news',
          content: `Rekap Spotinize Daily #${prev.dailyNumber}: ${summaryLines}`,
          metadataJson: { dailyDate: yesterdayDate, dailyNumber: prev.dailyNumber, top3: validTop3.map(a => ({ username: a.user.username, score: a.score })) }
        });
      }

      await prev.update({ recapPosted: true });
    } catch (err) {
      console.warn('[DailyChallengeService] Recap notice:', err.message);
    }
  }

  async ensureTodayChallenge(targetDate = getWibDateString()) {
    const existing = await DailyChallenge.findOne({ where: { dailyDate: targetDate } });
    if (existing) return existing;

    if (this.creationLocks.has(targetDate)) {
      return this.creationLocks.get(targetDate);
    }

    const promise = (async () => {
      try {
        const doubleCheck = await DailyChallenge.findOne({ where: { dailyDate: targetDate } });
        if (doubleCheck) return doubleCheck;

        // Post yesterday's recap asynchronously
        this._postYesterdayRecapIfNeeded(getWibYesterdayString()).catch(() => {});

        const pool = await this._buildCombinedPool();
        if (pool.length < 5) {
          throw new Error('Tidak cukup lagu di katalog untuk membuat Spotinize Daily.');
        }

        // FULL RANDOM selection across combined pool (can be all 1 category or any random mix)
        const selected = shuffleFisherYates(pool).slice(0, 5);
        const savedTracks = await trackRepository.bulkUpsert(selected);
        const trackIds = savedTracks.map(t => t.id);

        const poolSummary = {};
        selected.forEach(t => {
          const cat = t.sourceCategory || t.category || 'Random';
          poolSummary[cat] = (poolSummary[cat] || 0) + 1;
        });

        const latest = await DailyChallenge.findOne({ order: [['dailyNumber', 'DESC']] });
        const dailyNumber = (latest?.dailyNumber || 0) + 1;

        let announcementPostId = null;
        try {
          const bot = await officialBotService.ensureOfficialAccount();
          const post = await Post.create({
            userId: bot.id,
            type: 'official_ai',
            subtype: 'news',
            content: `Spotinize Daily #${dailyNumber} sudah dibuka! 5 lagu acak menantimu — hanya 1 kesempatan hari ini. Berani adu cepat?`,
            metadataJson: { dailyDate: targetDate, dailyNumber, isDailyAnnouncement: true }
          });
          announcementPostId = post.id;
        } catch (e) {
          console.warn('[DailyChallengeService] Announcement post notice:', e.message);
        }

        const created = await DailyChallenge.create({
          dailyDate: targetDate,
          dailyNumber,
          trackIdsJson: trackIds,
          poolSummary,
          announcementPostId
        });

        // Pre-cache audio in background
        audioService.preloadGameAudio(savedTracks).catch(() => {});

        return created;
      } finally {
        this.creationLocks.delete(targetDate);
      }
    })();

    this.creationLocks.set(targetDate, promise);
    return promise;
  }

  async getTodayStatus(userId) {
    const todayWib = getWibDateString();
    const challenge = await this.ensureTodayChallenge(todayWib);

    const [attempt, participantCount] = await Promise.all([
      userId
        ? DailyAttempt.findOne({ where: { dailyDate: todayWib, userId } })
        : Promise.resolve(null),
      DailyAttempt.count({ where: { dailyDate: todayWib, status: 'COMPLETED' } })
    ]);

    let rank = null;
    if (attempt && attempt.status === 'COMPLETED') {
      const betterCount = await DailyAttempt.count({
        where: {
          dailyDate: todayWib,
          status: 'COMPLETED',
          [Op.or]: [
            { score: { [Op.gt]: attempt.score } },
            {
              score: attempt.score,
              totalThinkingTime: { [Op.lt]: attempt.totalThinkingTime }
            }
          ]
        }
      });
      rank = betterCount + 1;
    }

    return {
      dailyDate: todayWib,
      dailyNumber: challenge.dailyNumber,
      participantCount,
      status: attempt ? attempt.status : 'NOT_STARTED',
      gameId: attempt?.gameId || null,
      score: attempt?.score ?? null,
      correctCount: attempt?.correctCount ?? null,
      totalThinkingTime: attempt?.totalThinkingTime ?? null,
      emojiGrid: attempt?.emojiGrid || null,
      rank
    };
  }

  async startOrResumeDaily(userId, gameService) {
    const todayWib = getWibDateString();
    const challenge = await this.ensureTodayChallenge(todayWib);

    const existing = await DailyAttempt.findOne({
      where: { dailyDate: todayWib, userId }
    });

    if (existing) {
      if (existing.status === 'COMPLETED') {
        throw new Error(`Kamu sudah menyelesaikan Spotinize Daily #${challenge.dailyNumber} hari ini!`);
      }
      // Resume existing game on refresh!
      const existingGame = await gameService.getGameState(existing.gameId, userId);
      if (existingGame && existingGame.status !== 'ABANDONED') {
        return {
          resumed: true,
          dailyNumber: challenge.dailyNumber,
          gameState: existingGame
        };
      }
    }

    const trackIds = Array.isArray(challenge.trackIdsJson) ? challenge.trackIdsJson : [];
    const tracks = await Track.findAll({ where: { id: { [Op.in]: trackIds } } });
    const trackMap = new Map(tracks.map(t => [t.id, t]));
    const orderedTracks = trackIds.map(id => trackMap.get(id)).filter(Boolean);

    if (orderedTracks.length === 0) {
      throw new Error('Lagu Spotinize Daily tidak ditemukan.');
    }

    const game = await gameRepository.create({
      mode: 'SOLO',
      gameSubtype: 'DAILY',
      category: 'Spotinize Daily',
      dailyDate: todayWib,
      numberOfSongs: orderedTracks.length,
      currentRound: 1,
      status: 'PLAYING',
      hostId: userId
    });

    await gameRepository.addPlayer(game.id, userId, true);

    for (let i = 0; i < orderedTracks.length; i++) {
      await gameRepository.createRound(game.id, i + 1, orderedTracks[i].id);
    }

    if (existing) {
      await existing.update({ gameId: game.id, status: 'IN_PROGRESS' });
    } else {
      await DailyAttempt.create({
        dailyDate: todayWib,
        userId,
        gameId: game.id,
        status: 'IN_PROGRESS'
      });
    }

    audioService.preloadGameAudio(orderedTracks).catch(() => {});

    const gameState = await gameService.getGameState(game.id, userId);
    return {
      resumed: false,
      dailyNumber: challenge.dailyNumber,
      gameState
    };
  }

  async buildEmojiGrid(gameId, userId, finalScore) {
    const game = await gameRepository.findById(gameId);
    const rounds = [...(game?.rounds || [])].sort((a, b) => a.roundNumber - b.roundNumber);
    const challenge = game?.dailyDate
      ? await DailyChallenge.findOne({ where: { dailyDate: game.dailyDate } })
      : null;

    const tiles = [];
    for (const r of rounds) {
      const guesses = await Guess.findAll({
        where: { roundId: r.id, userId },
        order: [['attemptNumber', 'ASC']]
      });
      const hit = guesses.find(g => g.isCorrect);
      if (hit) {
        tiles.push(`[${hit.revealLevel}s]`);
      } else if (guesses.length >= 3) {
        tiles.push('[X]');
      } else {
        tiles.push('[Skip]');
      }
    }

    const header = `Spotinize Daily #${challenge?.dailyNumber || '?'} —`;
    return `${header} ${tiles.join(' | ')} — ${finalScore} pts`;
  }

  async finalizeDailyAttempt(game, userId, { score, correctCount, totalThinkingTime }) {
    if (!game || game.gameSubtype !== 'DAILY') return null;

    const dailyDate = game.dailyDate || getWibDateString();
    const emojiGrid = await this.buildEmojiGrid(game.id, userId, score);

    const [attempt] = await DailyAttempt.findOrCreate({
      where: { dailyDate, userId },
      defaults: {
        dailyDate,
        userId,
        gameId: game.id,
        score,
        correctCount,
        totalThinkingTime,
        emojiGrid,
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });

    if (attempt.status !== 'COMPLETED') {
      await attempt.update({
        score,
        correctCount,
        totalThinkingTime,
        emojiGrid,
        status: 'COMPLETED',
        completedAt: new Date()
      });
    }

    const user = await User.findByPk(userId);
    if (user) {
      await user.update({
        dailyPointsTotal: (user.dailyPointsTotal || 0) + score
      });
    }

    const challenge = await DailyChallenge.findOne({ where: { dailyDate } });
    return {
      dailyDate,
      dailyNumber: challenge?.dailyNumber || 1,
      score,
      correctCount,
      emojiGrid
    };
  }

  async getUserHasCompletedToday(userId) {
    if (!userId) return false;
    const todayWib = getWibDateString();
    const attempt = await DailyAttempt.findOne({
      where: { dailyDate: todayWib, userId, status: 'COMPLETED' },
      attributes: ['id']
    });
    return Boolean(attempt);
  }
}

export const dailyChallengeService = new DailyChallengeService();
export default dailyChallengeService;
