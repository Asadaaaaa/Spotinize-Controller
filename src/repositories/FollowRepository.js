import { Follow, User } from '../models/index.js';
import { Op } from 'sequelize';

export const USER_SOCIAL_ATTRIBUTES = [
  'id',
  'username',
  'displayName',
  'avatarUrl',
  'bio',
  'bestScore',
  'gamesPlayed',
  'winRate',
  'currentStreak',
  'longestStreak',
  'isOfficial',
  'spotifyConnected',
  'favoriteSongTitle',
  'favoriteSongArtist',
  'favoriteSongCover',
  'updatedAt'
];

export class FollowRepository {
  _isUserOnline(u, io = null) {
    if (io?.sockets?.adapter?.rooms?.has(`user:${u.id}`)) {
      return true;
    }
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    return u.updatedAt ? new Date(u.updatedAt) > tenMinutesAgo : false;
  }

  formatUser(u, { io = null, isFollowing = false, isFollowedBy = false, extra = {} } = {}) {
    const isMutual = Boolean(isFollowing && isFollowedBy);
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      bio: u.bio || '',
      bestScore: u.bestScore || 0,
      gamesPlayed: u.gamesPlayed || 0,
      winRate: Math.round(u.winRate || 0),
      guessRate: Math.round(u.winRate || 0),
      currentStreak: u.currentStreak || 0,
      longestStreak: u.longestStreak || 0,
      isOfficial: Boolean(u.isOfficial),
      spotifyConnected: Boolean(u.spotifyConnected),
      favoriteSong: u.favoriteSongTitle
        ? {
            title: u.favoriteSongTitle,
            artist: u.favoriteSongArtist,
            cover: u.favoriteSongCover
          }
        : null,
      isOnline: this._isUserOnline(u, io),
      isFollowing: Boolean(isFollowing),
      isFollowedBy: Boolean(isFollowedBy),
      isMutual,
      ...extra
    };
  }

  async getFollowingIds(userId) {
    const rows = await Follow.findAll({
      where: { followerId: userId },
      attributes: ['followingId']
    });
    return rows.map(r => r.followingId);
  }

  async getFollowerIds(userId) {
    const rows = await Follow.findAll({
      where: { followingId: userId },
      attributes: ['followerId']
    });
    return rows.map(r => r.followerId);
  }

  async getCounts(userId) {
    const [followingCount, followersCount] = await Promise.all([
      Follow.count({ where: { followerId: userId } }),
      Follow.count({ where: { followingId: userId } })
    ]);
    return { followingCount, followersCount };
  }

  async getRelationship(viewerId, targetId) {
    if (!viewerId || !targetId || viewerId === targetId) {
      return { isFollowing: false, isFollowedBy: false, isMutual: false };
    }
    const [fwd, rev] = await Promise.all([
      Follow.findOne({ where: { followerId: viewerId, followingId: targetId } }),
      Follow.findOne({ where: { followerId: targetId, followingId: viewerId } })
    ]);
    const isFollowing = Boolean(fwd);
    const isFollowedBy = Boolean(rev);
    return { isFollowing, isFollowedBy, isMutual: isFollowing && isFollowedBy };
  }

  async isMutual(userA, userB) {
    const rel = await this.getRelationship(userA, userB);
    return rel.isMutual;
  }

  async follow(followerId, followingId) {
    if (!followerId || !followingId) throw new Error('Target user diperlukan');
    if (followerId === followingId) throw new Error('Tidak dapat mengikuti diri sendiri');

    const [row, created] = await Follow.findOrCreate({
      where: { followerId, followingId },
      defaults: { followerId, followingId }
    });

    const rev = await Follow.findOne({
      where: { followerId: followingId, followingId: followerId }
    });

    const isFollowedBy = Boolean(rev);
    return {
      relation: row,
      created,
      isFollowing: true,
      isFollowedBy,
      isMutual: isFollowedBy
    };
  }

  async unfollow(followerId, followingId) {
    if (!followerId || !followingId) throw new Error('Target user diperlukan');
    await Follow.destroy({ where: { followerId, followingId } });
    const rev = await Follow.findOne({
      where: { followerId: followingId, followingId: followerId }
    });
    return {
      isFollowing: false,
      isFollowedBy: Boolean(rev),
      isMutual: false
    };
  }

  async getNetworkForUser(userId, io = null) {
    const [followingIds, followerIds] = await Promise.all([
      this.getFollowingIds(userId),
      this.getFollowerIds(userId)
    ]);

    const followingSet = new Set(followingIds);
    const followerSet = new Set(followerIds);
    const allIds = [...new Set([...followingIds, ...followerIds])];

    const userMap = new Map();
    if (allIds.length > 0) {
      const users = await User.findAll({
        where: { id: { [Op.in]: allIds } },
        attributes: USER_SOCIAL_ATTRIBUTES,
        order: [['displayName', 'ASC']]
      });
      for (const u of users) {
        userMap.set(u.id, u);
      }
    }

    const following = followingIds
      .map(id => userMap.get(id))
      .filter(Boolean)
      .map(u => this.formatUser(u, { io, isFollowing: true, isFollowedBy: followerSet.has(u.id) }))
      .sort((a, b) => (b.isMutual - a.isMutual) || (b.isOnline - a.isOnline) || a.displayName.localeCompare(b.displayName));

    const followers = followerIds
      .map(id => userMap.get(id))
      .filter(Boolean)
      .map(u => this.formatUser(u, { io, isFollowing: followingSet.has(u.id), isFollowedBy: true }))
      .sort((a, b) => (b.isMutual - a.isMutual) || (b.isOnline - a.isOnline) || a.displayName.localeCompare(b.displayName));

    const mutuals = following.filter(u => u.isMutual);

    return {
      mutuals,
      following,
      followers,
      counts: {
        mutualsCount: mutuals.length,
        followingCount: following.length,
        followersCount: followers.length
      }
    };
  }

  async getMutuals(userId, io = null) {
    const net = await this.getNetworkForUser(userId, io);
    return net.mutuals;
  }

  async getPublicFollowLists(targetUserId, viewerId = null, io = null) {
    const [followingIds, followerIds, viewerFollowingIds, viewerFollowerIds] = await Promise.all([
      this.getFollowingIds(targetUserId),
      this.getFollowerIds(targetUserId),
      viewerId ? this.getFollowingIds(viewerId) : Promise.resolve([]),
      viewerId ? this.getFollowerIds(viewerId) : Promise.resolve([])
    ]);

    const viewerFollowingSet = new Set(viewerFollowingIds);
    const viewerFollowerSet = new Set(viewerFollowerIds);
    const allIds = [...new Set([...followingIds, ...followerIds])];

    const userMap = new Map();
    if (allIds.length > 0) {
      const users = await User.findAll({
        where: { id: { [Op.in]: allIds } },
        attributes: USER_SOCIAL_ATTRIBUTES
      });
      for (const u of users) userMap.set(u.id, u);
    }

    const formatForViewer = (id) => {
      const u = userMap.get(id);
      if (!u) return null;
      return this.formatUser(u, {
        io,
        isFollowing: viewerFollowingSet.has(id),
        isFollowedBy: viewerFollowerSet.has(id)
      });
    };

    return {
      following: followingIds.map(formatForViewer).filter(Boolean),
      followers: followerIds.map(formatForViewer).filter(Boolean)
    };
  }

  async searchUsers(query, viewerId = null, io = null, limit = 18) {
    const q = (query || '').trim();
    if (!q) return [];

    const where = {
      isOfficial: false,
      username: { [Op.ne]: 'spotinize' },
      [Op.or]: [
        { username: { [Op.like]: `%${q}%` } },
        { displayName: { [Op.like]: `%${q}%` } }
      ]
    };
    if (viewerId) {
      where.id = { [Op.ne]: viewerId };
    }

    const users = await User.findAll({
      where,
      attributes: USER_SOCIAL_ATTRIBUTES,
      order: [['bestScore', 'DESC'], ['displayName', 'ASC']],
      limit
    });

    if (!viewerId || users.length === 0) {
      return users.map(u => this.formatUser(u, { io }));
    }

    const [followingIds, followerIds] = await Promise.all([
      this.getFollowingIds(viewerId),
      this.getFollowerIds(viewerId)
    ]);
    const followingSet = new Set(followingIds);
    const followerSet = new Set(followerIds);

    return users.map(u =>
      this.formatUser(u, {
        io,
        isFollowing: followingSet.has(u.id),
        isFollowedBy: followerSet.has(u.id)
      })
    );
  }

  async getSuggestedUsers(viewerId, io = null, limit = 8) {
    const followingIds = viewerId ? await this.getFollowingIds(viewerId) : [];
    const excludeIds = viewerId ? [viewerId, ...followingIds] : [];

    const where = {
      isOfficial: false,
      username: { [Op.ne]: 'spotinize' }
    };
    if (excludeIds.length > 0) {
      where.id = { [Op.notIn]: excludeIds };
    }

    const users = await User.findAll({
      where,
      attributes: USER_SOCIAL_ATTRIBUTES,
      order: [['gamesPlayed', 'DESC'], ['bestScore', 'DESC']],
      limit
    });

    const followerIds = viewerId ? await this.getFollowerIds(viewerId) : [];
    const followerSet = new Set(followerIds);

    return users.map(u =>
      this.formatUser(u, {
        io,
        isFollowing: false,
        isFollowedBy: followerSet.has(u.id)
      })
    );
  }
}

export const followRepository = new FollowRepository();
export default followRepository;
