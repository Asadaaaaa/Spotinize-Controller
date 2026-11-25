import { Op } from 'sequelize';
import {
  Post, PostReaction, PostComment, BlindDropAttempt, ChallengeEntry,
  SavedTrack, User, Game, GamePlayer
} from '../models/index.js';
import { followRepository } from '../repositories/FollowRepository.js';
import { trackRepository } from '../repositories/TrackRepository.js';
import { imageCacheService } from './ImageCacheService.js';
import { spotifyService } from './SpotifyService.js';
import { notificationRepository } from '../repositories/NotificationRepository.js';
import { TrackMatcher } from '../utils/TrackMatcher.js';
import { streakService } from './StreakService.js';
import { gameService } from './GameService.js';
import { cosmeticService } from './CosmeticService.js';
import { dailyChallengeService } from './DailyChallengeService.js';
import { questService } from './QuestService.js';
import { getWibDateString } from '../utils/WibDate.js';

export const ALLOWED_EMOJIS = ['❤️', '👍', '👏', '🔥', '👎', '🎧', '🤯', '💀'];

const AUTHOR_ATTRIBUTES = [
  'id',
  'username',
  'displayName',
  'avatarUrl',
  'isOfficial',
  'currentStreak',
  'level',
  'equippedFrameId',
  'equippedTitleId'
];

export function buildTrackKey({ spotifyId, title, artist }) {
  if (spotifyId) return String(spotifyId).trim();
  const cleanTitle = (title || '').trim().toLowerCase();
  const cleanArtist = (artist || '').trim().toLowerCase();
  return `${cleanTitle}::${cleanArtist}`;
}

export class FeedService {
  /**
   * Resolves track metadata + ensures track exists in `tracks` table and cover is cached locally.
   */
  async _resolveAndCacheTrack(trackInput) {
    if (!trackInput || !trackInput.title) return null;

    const title = String(trackInput.title).trim();
    const artist = String(trackInput.artist || 'Unknown Artist').trim();
    const spotifyId = trackInput.spotifyId || trackInput.id || null;
    const previewUrl = trackInput.previewUrl || null;
    const rawCover = trackInput.coverUrl || trackInput.albumArt || trackInput.cover || null;

    const cachedCover = await imageCacheService.resolveTrackArtwork(
      { spotifyId, title, artist, albumArt: rawCover },
      {
        allowRemoteFallback: true,
        searchFn: (q) => spotifyService.searchTracks(q, null, 5)
      }
    ).catch(() => rawCover);

    const savedTracks = await trackRepository.bulkUpsert([
      {
        spotifyId,
        title,
        artist,
        albumArt: cachedCover || rawCover,
        previewUrl
      }
    ]).catch(() => []);

    const dbTrack = savedTracks?.[0] || null;

    return {
      trackId: dbTrack?.id || null,
      trackTitle: title,
      trackArtist: artist,
      trackCover: cachedCover || rawCover || dbTrack?.albumArt || null,
      trackPreviewUrl: previewUrl || dbTrack?.previewUrl || null,
      trackSpotifyId: spotifyId || dbTrack?.spotifyId || null
    };
  }

  /**
   * Formats an array of Post Sequelize instances into rich Feed DTOs
   * including reactions summary, comments count/preview, and viewer's saved status.
   */
  async hydratePosts(rawPosts, viewerId = null) {
    if (!rawPosts || rawPosts.length === 0) return [];

    const postIds = rawPosts.map(p => p.id);
    const blindPostIds = rawPosts
      .filter(p => p.type === 'blind_drop' || (p.type === 'official_ai' && p.subtype === 'official_blind_drop'))
      .map(p => p.id);
    const challengePostIds = rawPosts.filter(p => p.type === 'challenge').map(p => p.id);

    const [reactions, comments, savedRows, blindAttempts, challengeEntries, viewerCompletedDaily] = await Promise.all([
      PostReaction.findAll({ where: { postId: { [Op.in]: postIds } } }),
      PostComment.findAll({
        where: { postId: { [Op.in]: postIds } },
        include: [{ model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES }],
        order: [['createdAt', 'ASC']]
      }),
      viewerId
        ? SavedTrack.findAll({ where: { userId: viewerId }, attributes: ['trackKey'] })
        : Promise.resolve([]),
      blindPostIds.length > 0
        ? BlindDropAttempt.findAll({
            where: { postId: { [Op.in]: blindPostIds } },
            include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }],
            order: [['revealLevel', 'ASC'], ['updatedAt', 'ASC']]
          })
        : Promise.resolve([]),
      challengePostIds.length > 0
        ? ChallengeEntry.findAll({
            where: { postId: { [Op.in]: challengePostIds } },
            include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }],
            order: [['score', 'DESC'], ['thinkingTime', 'ASC']]
          })
        : Promise.resolve([]),
      viewerId ? dailyChallengeService.getUserHasCompletedToday(viewerId).catch(() => false) : Promise.resolve(false)
    ]);

    // Batch hydrate authors' Profile Frames & Titles
    const rawAuthors = rawPosts.map(p => p.author).filter(Boolean);
    const hydratedAuthors = await cosmeticService.hydrateUsersCosmetics(rawAuthors).catch(() => rawAuthors);
    const authorCosmeticsMap = new Map(hydratedAuthors.map(a => [a.id, a]));
    const todayWib = getWibDateString();

    const savedKeySet = new Set(savedRows.map(s => s.trackKey));

    // Group blind drop attempts by postId
    const blindByPost = new Map();
    for (const a of blindAttempts) {
      if (!blindByPost.has(a.postId)) blindByPost.set(a.postId, []);
      blindByPost.get(a.postId).push(a);
    }

    // Group challenge entries by postId
    const challengeByPost = new Map();
    for (const e of challengeEntries) {
      if (!challengeByPost.has(e.postId)) challengeByPost.set(e.postId, []);
      challengeByPost.get(e.postId).push(e);
    }

    // Group reactions by postId
    const reactionsByPost = new Map();
    for (const r of reactions) {
      if (!reactionsByPost.has(r.postId)) reactionsByPost.set(r.postId, []);
      reactionsByPost.get(r.postId).push(r);
    }

    // Group comments by postId
    const commentsByPost = new Map();
    for (const c of comments) {
      if (!commentsByPost.has(c.postId)) commentsByPost.set(c.postId, []);
      commentsByPost.get(c.postId).push({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        author: c.author ? {
          id: c.author.id,
          username: c.author.username,
          displayName: c.author.displayName,
          avatarUrl: c.author.avatarUrl,
          isOfficial: Boolean(c.author.isOfficial)
        } : null
      });
    }

    return rawPosts.map(post => {
      const plain = post.toJSON ? post.toJSON() : { ...post };
      const postReacts = reactionsByPost.get(plain.id) || [];
      const postComments = commentsByPost.get(plain.id) || [];

      const reactionCounts = {};
      const viewerReactions = [];
      for (const emoji of ALLOWED_EMOJIS) {
        reactionCounts[emoji] = 0;
      }
      for (const r of postReacts) {
        reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
        if (viewerId && r.userId === viewerId) {
          viewerReactions.push(r.emoji);
        }
      }

      const isBlindType = plain.type === 'blind_drop' || (plain.type === 'official_ai' && plain.subtype === 'official_blind_drop');
      const postBlindAttempts = blindByPost.get(plain.id) || [];
      const viewerAttempt = viewerId ? postBlindAttempts.find(a => a.userId === viewerId) : null;
      const solvedAttempts = postBlindAttempts.filter(a => a.solved);
      const fastestAttempt = solvedAttempts[0] || null;
      const isAuthor = Boolean(viewerId && plain.userId === viewerId);
      const isBlindRevealed = Boolean(!isBlindType || isAuthor || viewerAttempt?.solved || viewerAttempt?.gaveUp);

      let trackObj = null;
      if (plain.trackTitle) {
        if (isBlindType && !isBlindRevealed) {
          trackObj = {
            id: plain.trackId || null,
            spotifyId: null,
            title: '???',
            artist: '???',
            coverUrl: null,
            previewUrl: null,
            isBlurred: true,
            isSaved: false
          };
        } else {
          trackObj = {
            id: plain.trackId || null,
            spotifyId: plain.trackSpotifyId || null,
            title: plain.trackTitle,
            artist: plain.trackArtist || 'Unknown Artist',
            coverUrl: plain.trackCover || null,
            previewUrl: plain.trackPreviewUrl || null,
            isBlurred: false,
            isSaved: viewerId
              ? savedKeySet.has(buildTrackKey({
                  spotifyId: plain.trackSpotifyId,
                  title: plain.trackTitle,
                  artist: plain.trackArtist
                }))
              : false
          };
        }
      }

      const blindDrop = isBlindType ? {
        isBlurred: !isBlindRevealed,
        solvedCount: solvedAttempts.length,
        fastestReveal: fastestAttempt ? fastestAttempt.revealLevel : null,
        fastestUser: fastestAttempt?.user ? {
          username: fastestAttempt.user.username,
          displayName: fastestAttempt.user.displayName
        } : null,
        viewerAttempt: viewerAttempt ? {
          solved: Boolean(viewerAttempt.solved),
          gaveUp: Boolean(viewerAttempt.gaveUp),
          attemptsUsed: viewerAttempt.attemptsUsed,
          revealLevel: viewerAttempt.revealLevel
        } : null
      } : null;

      const postChallengeEntries = challengeByPost.get(plain.id) || [];
      const challenge = plain.type === 'challenge' ? {
        category: plain.metadataJson?.category || 'Global Trends',
        artistQuery: plain.metadataJson?.artistQuery || null,
        numberOfSongs: plain.metadataJson?.numberOfSongs || 5,
        targetScore: plain.metadataJson?.targetScore || 0,
        entriesCount: postChallengeEntries.length,
        entries: postChallengeEntries.slice(0, 5).map((entry, idx) => ({
          rank: idx + 1,
          userId: entry.userId,
          username: entry.user?.username || 'player',
          displayName: entry.user?.displayName || 'Player',
          avatarUrl: entry.user?.avatarUrl || null,
          score: entry.score,
          thinkingTime: entry.thinkingTime
        }))
      } : null;

      const hydratedAuthor = plain.author ? (authorCosmeticsMap.get(plain.author.id) || plain.author) : null;
      const postText = `${plain.content || ''} ${plain.contentEn || ''}`.toLowerCase();
      const mentionsTodayDaily = Boolean(
        !plain.metadataJson?.isDailyAnnouncement &&
        plain.type !== 'official_ai' &&
        (
          plain.metadataJson?.dailyDate === todayWib ||
          /\bspotinize\s*daily\b|\bdaily\s*#\d+/i.test(postText)
        )
      );
      const isDailySpoilerHidden = Boolean(
        mentionsTodayDaily &&
        !isAuthor &&
        !viewerCompletedDaily
      );

      return {
        id: plain.id,
        userId: plain.userId,
        type: plain.type,
        subtype: plain.subtype,
        content: plain.content,
        contentEn: plain.contentEn,
        sourceUrl: plain.sourceUrl,
        sourceName: plain.sourceName,
        sourceGameId: plain.sourceGameId,
        metadata: plain.metadataJson || null,
        createdAt: plain.createdAt,
        isDailySpoilerHidden,
        author: hydratedAuthor ? {
          id: hydratedAuthor.id,
          username: hydratedAuthor.username,
          displayName: hydratedAuthor.displayName,
          avatarUrl: hydratedAuthor.avatarUrl,
          isOfficial: Boolean(hydratedAuthor.isOfficial),
          currentStreak: hydratedAuthor.currentStreak || 0,
          level: hydratedAuthor.level || 1,
          equippedFrame: hydratedAuthor.equippedFrame || null,
          equippedTitle: hydratedAuthor.equippedTitle || null
        } : null,
        track: trackObj,
        blindDrop,
        challenge,
        reactionCounts,
        viewerReactions,
        totalReactions: postReacts.length,
        commentsCount: postComments.length,
        commentsPreview: postComments.slice(-2)
      };
    });
  }

  /**
   * Feed Query:
   * - tab = 'explore' (default): Combined discovery feed (Following + @spotinize Official + Explore Global)
   * - tab = 'following': Posts strictly from accounts the viewer follows (+ viewer's own posts)
   */
  async getCombinedFeed(viewerId, { offset = 0, limit = 15, tab = 'explore' } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 15, 1), 30);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const cleanTab = (tab || 'explore').toLowerCase() === 'following' ? 'following' : 'explore';

    const includeAuthor = [{ model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES }];

    if (cleanTab === 'following') {
      if (!viewerId) {
        return { posts: [], hasMore: false, nextOffset: 0 };
      }
      const followingIds = await followRepository.getFollowingIds(viewerId);
      const authorIds = [...new Set([viewerId, ...followingIds])];

      const { rows, count } = await Post.findAndCountAll({
        where: { userId: { [Op.in]: authorIds } },
        include: includeAuthor,
        order: [['createdAt', 'DESC']],
        offset: safeOffset,
        limit: safeLimit
      });

      const hydrated = await this.hydratePosts(rows, viewerId);
      return {
        posts: hydrated,
        hasMore: safeOffset + rows.length < count,
        nextOffset: safeOffset + rows.length
      };
    }

    if (cleanTab === 'explore') {
      const fetchWindow = safeOffset + safeLimit + 10;
      const [userPosts, officialPosts] = await Promise.all([
        Post.findAll({
          include: [{
            model: User,
            as: 'author',
            attributes: AUTHOR_ATTRIBUTES,
            where: { isOfficial: false },
            required: true
          }],
          order: [['createdAt', 'DESC']],
          limit: fetchWindow
        }),
        Post.findAll({
          include: [{
            model: User,
            as: 'author',
            attributes: AUTHOR_ATTRIBUTES,
            where: { isOfficial: true },
            required: true
          }],
          order: [['createdAt', 'DESC']],
          limit: fetchWindow
        })
      ]);

      // Interleave: prioritize user posts, inserting 1 @spotinize post every 2, 3, or 5 user posts
      const gaps = [3, 2, 5];
      const windowSeed = Math.floor(Date.now() / (10 * 60 * 1000));
      const combined = [];
      let uIdx = 0;
      let oIdx = 0;
      let step = 0;

      while (uIdx < userPosts.length || oIdx < officialPosts.length) {
        if (uIdx < userPosts.length) {
          const hash = ((windowSeed * 1103515245 + step * 12345) >>> 16) & 0x7fff;
          const gap = gaps[hash % gaps.length];
          for (let i = 0; i < gap && uIdx < userPosts.length; i += 1) {
            combined.push(userPosts[uIdx++]);
          }
          step += 1;
        }
        if (oIdx < officialPosts.length) {
          combined.push(officialPosts[oIdx++]);
        }
      }

      const paged = combined.slice(safeOffset, safeOffset + safeLimit);
      const hydrated = await this.hydratePosts(paged, viewerId);
      return {
        posts: hydrated,
        hasMore: combined.length > safeOffset + paged.length,
        nextOffset: safeOffset + paged.length
      };
    }

    const [followingIds, officialUsers] = await Promise.all([
      viewerId ? followRepository.getFollowingIds(viewerId) : Promise.resolve([]),
      User.findAll({ where: { isOfficial: true }, attributes: ['id'] })
    ]);

    const officialIds = officialUsers.map(u => u.id);
    const priorityAuthorIds = [...new Set([...(viewerId ? [viewerId] : []), ...followingIds])];

    const [followingPosts, officialPosts, explorePosts] = await Promise.all([
      priorityAuthorIds.length > 0
        ? Post.findAll({
            where: { userId: { [Op.in]: priorityAuthorIds } },
            include: includeAuthor,
            order: [['createdAt', 'DESC']],
            limit: safeOffset + safeLimit + 10
          })
        : Promise.resolve([]),
      officialIds.length > 0
        ? Post.findAll({
            where: { userId: { [Op.in]: officialIds } },
            include: includeAuthor,
            order: [['createdAt', 'DESC']],
            limit: 15
          })
        : Promise.resolve([]),
      Post.findAll({
        include: includeAuthor,
        order: [['createdAt', 'DESC']],
        limit: safeOffset + safeLimit + 20
      })
    ]);

    // Smart merge: Following first, interleave @spotinize every 3 posts, then Explore Global
    const merged = [];
    const seen = new Set();
    const pushUnique = (p) => {
      if (!p || seen.has(p.id)) return false;
      seen.add(p.id);
      merged.push(p);
      return true;
    };

    let officialCursor = 0;
    for (let i = 0; i < followingPosts.length; i++) {
      pushUnique(followingPosts[i]);
      if ((i + 1) % 3 === 0 && officialCursor < officialPosts.length) {
        pushUnique(officialPosts[officialCursor++]);
      }
    }

    // Interleave remaining official posts with explore posts
    let exploreCursor = 0;
    while (officialCursor < officialPosts.length || exploreCursor < explorePosts.length) {
      if (officialCursor < officialPosts.length) {
        pushUnique(officialPosts[officialCursor++]);
      }
      for (let k = 0; k < 3 && exploreCursor < explorePosts.length; k++) {
        pushUnique(explorePosts[exploreCursor++]);
      }
    }

    const pageSlice = merged.slice(safeOffset, safeOffset + safeLimit);
    const hydrated = await this.hydratePosts(pageSlice, viewerId);

    return {
      posts: hydrated,
      hasMore: merged.length > safeOffset + safeLimit,
      nextOffset: safeOffset + pageSlice.length
    };
  }

  async getUserPosts(targetUserId, viewerId = null, limit = 25) {
    if (!targetUserId) return [];
    const rows = await Post.findAll({
      where: { userId: targetUserId },
      include: [{ model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES }],
      order: [['createdAt', 'DESC']],
      limit
    });
    return await this.hydratePosts(rows, viewerId);
  }

  /**
   * Creates a user post (Song of the Day / Status Note).
   */
  async createPost(userId, { type = 'note', content = '', track = null, metadata = null }) {
    const cleanContent = (content || '').trim();
    if (cleanContent.length > 280) {
      throw new Error('Caption maksimal 280 karakter');
    }
    if (!cleanContent && !track) {
      throw new Error('Isi tulisan atau pilih lagu terlebih dahulu');
    }

    const resolvedTrack = track ? await this._resolveAndCacheTrack(track) : null;

    const post = await Post.create({
      userId,
      type: type === 'blind_drop' ? 'blind_drop' : 'note',
      content: cleanContent || null,
      ...(resolvedTrack || {}),
      metadataJson: metadata
    });

    const fullPost = await Post.findByPk(post.id, {
      include: [{ model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES }]
    });

    const [hydrated] = await this.hydratePosts([fullPost], userId);
    return hydrated;
  }

  async deletePost(postId, userId) {
    const post = await Post.findByPk(postId);
    if (!post) throw new Error('Postingan tidak ditemukan');
    if (post.userId !== userId) throw new Error('Kamu tidak berhak menghapus postingan ini');
    await post.destroy();
    return { deleted: true, postId };
  }

  async toggleReaction(postId, userId, emoji, io = null) {
    if (!ALLOWED_EMOJIS.includes(emoji)) {
      throw new Error('Emoji reaksi tidak valid');
    }

    const post = await Post.findByPk(postId);
    if (!post) throw new Error('Postingan tidak ditemukan');

    const userReactions = await PostReaction.findAll({
      where: { postId, userId }
    });
    const sameEmojiRow = userReactions.find(r => r.emoji === emoji);

    let active = false;
    if (sameEmojiRow) {
      await PostReaction.destroy({ where: { postId, userId } });
      active = false;
    } else {
      if (userReactions.length > 0) {
        await PostReaction.destroy({ where: { postId, userId } });
      }
      await PostReaction.create({ postId, userId, emoji });
      active = true;
    }

    // Notify post author when another user reacts
    if (active && post.userId !== userId) {
      const actor = await User.findByPk(userId, { attributes: ['id', 'username', 'displayName', 'avatarUrl'] });
      if (actor) {
        const notif = await notificationRepository.create({
          userId: post.userId,
          senderId: userId,
          type: 'POST_REACTION',
          title: `${actor.displayName} bereaksi ${emoji} di postinganmu`,
          message: post.content ? post.content.slice(0, 120) : 'Memberikan reaksi pada postinganmu.',
          data: { postId, emoji }
        }).catch(() => null);

        if (notif && io) {
          io.to(`user:${post.userId}`).emit('notification:new', {
            notification: {
              ...notif.toJSON(),
              sender: {
                id: actor.id,
                username: actor.username,
                displayName: actor.displayName,
                avatarUrl: actor.avatarUrl
              }
            }
          });
        }
      }
    }

    const allReacts = await PostReaction.findAll({ where: { postId } });
    const reactionCounts = {};
    const viewerReactions = [];
    for (const e of ALLOWED_EMOJIS) reactionCounts[e] = 0;
    for (const r of allReacts) {
      reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
      if (r.userId === userId) viewerReactions.push(r.emoji);
    }

    return {
      postId,
      emoji,
      active,
      reactionCounts,
      viewerReactions,
      totalReactions: allReacts.length
    };
  }

  async getComments(postId, limit = 50) {
    const comments = await PostComment.findAll({
      where: { postId },
      include: [{ model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES }],
      order: [['createdAt', 'ASC']],
      limit
    });

    return comments.map(c => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      author: c.author ? {
        id: c.author.id,
        username: c.author.username,
        displayName: c.author.displayName,
        avatarUrl: c.author.avatarUrl,
        isOfficial: Boolean(c.author.isOfficial)
      } : null
    }));
  }

  async addComment(postId, userId, content, io = null) {
    const clean = (content || '').trim();
    if (!clean) throw new Error('Komentar tidak boleh kosong');
    if (clean.length > 280) throw new Error('Komentar maksimal 280 karakter');

    const post = await Post.findByPk(postId);
    if (!post) throw new Error('Postingan tidak ditemukan');

    const comment = await PostComment.create({
      postId,
      userId,
      content: clean
    });

    const full = await PostComment.findByPk(comment.id, {
      include: [{ model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES }]
    });

    // Notify post author if commenter is someone else
    if (post.userId !== userId && full?.author) {
      const notif = await notificationRepository.create({
        userId: post.userId,
        senderId: userId,
        type: 'POST_COMMENT',
        title: `${full.author.displayName} mengomentari postinganmu`,
        message: clean.slice(0, 120),
        data: { postId }
      }).catch(() => null);

      if (notif && io) {
        io.to(`user:${post.userId}`).emit('notification:new', {
          notification: {
            ...notif.toJSON(),
            sender: {
              id: full.author.id,
              displayName: full.author.displayName,
              avatarUrl: full.author.avatarUrl
            }
          }
        });
      }
    }

    const totalComments = await PostComment.count({ where: { postId } });

    return {
      comment: {
        id: full.id,
        content: full.content,
        createdAt: full.createdAt,
        author: full.author ? {
          id: full.author.id,
          username: full.author.username,
          displayName: full.author.displayName,
          avatarUrl: full.author.avatarUrl,
          isOfficial: Boolean(full.author.isOfficial)
        } : null
      },
      commentsCount: totalComments
    };
  }

  /**
   * Auto-Activity Generator with 5-minute anti-spam grouping for pinned songs.
   */
  async createAutoActivity(userId, subtype, payload = {}) {
    if (!userId) return null;
    const user = await User.findByPk(userId, { attributes: ['id', 'displayName', 'isOfficial'] });
    if (!user || user.isOfficial) return null;

    if (subtype === 'personal_best') {
      return await Post.create({
        userId,
        type: 'auto_activity',
        subtype: 'personal_best',
        content: `Baru saja memecahkan Personal Best baru: ${payload.score} poin di kategori ${payload.category || 'Global Trends'}!`,
        contentEn: `Just set a new Personal Best: ${payload.score} pts in ${payload.category || 'Global Trends'}!`,
        sourceGameId: payload.gameId || null,
        metadataJson: {
          score: payload.score,
          category: payload.category
        }
      });
    }

    if (subtype === 'multiplayer_win') {
      return await Post.create({
        userId,
        type: 'auto_activity',
        subtype: 'multiplayer_win',
        content: `Menang duel Multiplayer (${payload.category || 'Global Trends'}) dengan skor ${payload.score} poin!`,
        contentEn: `Won a Multiplayer duel (${payload.category || 'Global Trends'}) with ${payload.score} pts!`,
        sourceGameId: payload.gameId || null,
        metadataJson: {
          score: payload.score,
          category: payload.category,
          playerCount: payload.playerCount || 2
        }
      });
    }

    if (subtype === 'streak_milestone') {
      return await Post.create({
        userId,
        type: 'auto_activity',
        subtype: 'streak_milestone',
        content: `Menjaga Daily Streak selama ${payload.streak} hari berturut-turut! 🔥`,
        contentEn: `Kept a ${payload.streak}-day Daily Streak alive! 🔥`,
        metadataJson: {
          streak: payload.streak
        }
      });
    }

    if (subtype === 'pinned_songs') {
      const trackData = payload.track ? await this._resolveAndCacheTrack(payload.track) : {};
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      // Anti-spam: update existing pinned_songs auto-activity within 5 minutes
      const recent = await Post.findOne({
        where: {
          userId,
          type: 'auto_activity',
          subtype: 'pinned_songs',
          createdAt: { [Op.gte]: fiveMinutesAgo }
        },
        order: [['createdAt', 'DESC']]
      });

      if (recent) {
        return await recent.update({
          content: `Memperbarui Lagu Favorit di profilnya: ${payload.track?.title || ''} — ${payload.track?.artist || ''}`,
          contentEn: `Updated their Favorite Song: ${payload.track?.title || ''} — ${payload.track?.artist || ''}`,
          ...trackData
        });
      }

      return await Post.create({
        userId,
        type: 'auto_activity',
        subtype: 'pinned_songs',
        content: `Memilih Lagu Favorit baru: ${payload.track?.title || ''} — ${payload.track?.artist || ''}`,
        contentEn: `Picked a new Favorite Song: ${payload.track?.title || ''} — ${payload.track?.artist || ''}`,
        ...trackData
      });
    }

    return null;
  }

  async searchPosts(query, viewerId = null, limit = 10) {
    const q = (query || '').trim();
    if (!q) return [];

    const rows = await Post.findAll({
      where: {
        [Op.or]: [
          { content: { [Op.like]: `%${q}%` } },
          { contentEn: { [Op.like]: `%${q}%` } },
          { trackTitle: { [Op.like]: `%${q}%` } },
          { trackArtist: { [Op.like]: `%${q}%` } }
        ]
      },
      include: [{ model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES }],
      order: [['createdAt', 'DESC']],
      limit
    });

    return await this.hydratePosts(rows, viewerId);
  }

  /**
   * Verifies a guess for a Blind Song Drop post.
   */
  async submitBlindDropGuess(postId, userId, guessedTrack, revealLevel = 0.5) {
    const post = await Post.findByPk(postId, {
      include: [{ model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES }]
    });
    if (!post) throw new Error('Postingan tidak ditemukan');
    const isBlind = post.type === 'blind_drop' || (post.type === 'official_ai' && post.subtype === 'official_blind_drop');
    if (!isBlind || !post.trackTitle) {
      throw new Error('Postingan ini bukan Blind Song Drop');
    }

    let attempt = await BlindDropAttempt.findOne({ where: { postId, userId } });
    if (attempt?.solved || attempt?.gaveUp) {
      const [hydrated] = await this.hydratePosts([post], userId);
      return { isCorrect: Boolean(attempt.solved), post: hydrated };
    }

    const nextAttemptsUsed = (attempt?.attemptsUsed || 0) + 1;
    const isCorrect = TrackMatcher.isMatch(
      {
        title: post.trackTitle,
        artist: post.trackArtist,
        spotifyId: post.trackSpotifyId
      },
      guessedTrack
    );

    const safeReveal = Math.max(0.5, Math.min(4.0, parseFloat(revealLevel) || 0.5));
    const solved = isCorrect;
    const gaveUp = !isCorrect && nextAttemptsUsed >= 3;

    if (!attempt) {
      attempt = await BlindDropAttempt.create({
        postId,
        userId,
        solved,
        gaveUp,
        revealLevel: safeReveal,
        attemptsUsed: nextAttemptsUsed
      });
    } else {
      await attempt.update({
        solved,
        gaveUp,
        revealLevel: safeReveal,
        attemptsUsed: nextAttemptsUsed
      });
    }

    if (solved) {
      streakService.recordActivity(userId).catch(() => {});
    }

    const [hydrated] = await this.hydratePosts([post], userId);
    return {
      isCorrect,
      attemptsRemaining: Math.max(0, 3 - nextAttemptsUsed),
      post: hydrated
    };
  }

  async giveUpBlindDrop(postId, userId) {
    const post = await Post.findByPk(postId, {
      include: [{ model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES }]
    });
    if (!post) throw new Error('Postingan tidak ditemukan');

    let attempt = await BlindDropAttempt.findOne({ where: { postId, userId } });
    if (!attempt) {
      await BlindDropAttempt.create({
        postId,
        userId,
        solved: false,
        gaveUp: true,
        revealLevel: 4.0,
        attemptsUsed: 0
      });
    } else if (!attempt.solved) {
      await attempt.update({ gaveUp: true });
    }

    const [hydrated] = await this.hydratePosts([post], userId);
    return { post: hydrated };
  }

  async createChallengePost(userId, { sourceGameId, content = '' }) {
    if (!sourceGameId) throw new Error('sourceGameId diperlukan');

    const game = await Game.findByPk(sourceGameId);
    if (!game || game.status !== 'FINISHED') {
      throw new Error('Game belum selesai atau tidak ditemukan');
    }

    const player = await GamePlayer.findOne({ where: { gameId: sourceGameId, userId } });
    if (!player) {
      throw new Error('Kamu tidak berpartisipasi pada game tersebut');
    }

    const existingChallenge = await Post.findOne({
      where: { userId, type: 'challenge', sourceGameId },
      include: [{ model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES }]
    });

    if (existingChallenge) {
      const [hydrated] = await this.hydratePosts([existingChallenge], userId);
      return hydrated;
    }

    const cleanCaption = (content || '').trim();
    const post = await Post.create({
      userId,
      type: 'challenge',
      content: cleanCaption || `Bisa kalahin skor ${player.score} poin di kategori ${game.category}? Coba lawan sekarang!`,
      contentEn: cleanCaption || `Can you beat my ${player.score} pts in ${game.category}? Try matching my run!`,
      sourceGameId,
      metadataJson: {
        category: game.category,
        artistQuery: game.artistQuery,
        numberOfSongs: game.numberOfSongs,
        targetScore: player.score
      }
    });

    await ChallengeEntry.create({
      postId: post.id,
      userId,
      gameId: sourceGameId,
      score: player.score,
      thinkingTime: player.totalThinkingTime || 0
    });

    const full = await Post.findByPk(post.id, {
      include: [{ model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES }]
    });
    const [hydrated] = await this.hydratePosts([full], userId);
    return hydrated;
  }

  async playChallenge(postId, userId) {
    const post = await Post.findByPk(postId);
    if (!post || post.type !== 'challenge' || !post.sourceGameId) {
      throw new Error('Tantangan tidak ditemukan');
    }
    return await gameService.createChallengeGame(userId, post.sourceGameId, post.id);
  }
}

export const feedService = new FeedService();
export default feedService;
