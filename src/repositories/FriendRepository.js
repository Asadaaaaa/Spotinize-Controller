import { Friend, User } from '../models/index.js';
import { Op } from 'sequelize';

const USER_PUBLIC_ATTRIBUTES = [
  'id',
  'username',
  'spotifyId',
  'displayName',
  'avatarUrl',
  'bestScore',
  'gamesPlayed',
  'winRate',
  'updatedAt'
];

export class FriendRepository {
  _formatUser(u, extra = {}) {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    return {
      id: u.id,
      username: u.username,
      spotifyId: u.spotifyId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      bestScore: u.bestScore || 0,
      gamesPlayed: u.gamesPlayed || 0,
      winRate: Math.round(u.winRate || 0),
      guessRate: Math.round(u.winRate || 0),
      isOnline: new Date(u.updatedAt) > fifteenMinutesAgo,
      ...extra
    };
  }

  /**
   * Retrieves ONLY explicitly accepted friends for a user (never returns strangers).
   */
  async getFriends(userId) {
    const friendRelations = await Friend.findAll({
      where: {
        [Op.or]: [
          { userId },
          { friendId: userId }
        ],
        status: 'ACCEPTED'
      }
    });

    const friendIds = friendRelations.map(rel => (rel.userId === userId ? rel.friendId : rel.userId));
    if (friendIds.length === 0) {
      return [];
    }

    const friends = await User.findAll({
      where: {
        id: { [Op.in]: friendIds }
      },
      order: [['displayName', 'ASC']],
      attributes: USER_PUBLIC_ATTRIBUTES
    });

    return friends.map(f => this._formatUser(f));
  }

  /**
   * Retrieves incoming and outgoing pending friend requests for a user.
   */
  async getPendingRequests(userId) {
    const [incomingRelations, outgoingRelations] = await Promise.all([
      Friend.findAll({
        where: { friendId: userId, status: 'PENDING' },
        order: [['createdAt', 'DESC']]
      }),
      Friend.findAll({
        where: { userId, status: 'PENDING' },
        order: [['createdAt', 'DESC']]
      })
    ]);

    const neededUserIds = [
      ...new Set([
        ...incomingRelations.map(r => r.userId),
        ...outgoingRelations.map(r => r.friendId)
      ])
    ];

    const userMap = new Map();
    if (neededUserIds.length > 0) {
      const users = await User.findAll({
        where: { id: { [Op.in]: neededUserIds } },
        attributes: USER_PUBLIC_ATTRIBUTES
      });
      for (const u of users) {
        userMap.set(u.id, u);
      }
    }

    const incoming = incomingRelations
      .map(rel => {
        const requester = userMap.get(rel.userId);
        return requester
          ? { requestId: rel.id, createdAt: rel.createdAt, user: this._formatUser(requester) }
          : null;
      })
      .filter(Boolean);

    const outgoing = outgoingRelations
      .map(rel => {
        const target = userMap.get(rel.friendId);
        return target
          ? { requestId: rel.id, createdAt: rel.createdAt, user: this._formatUser(target) }
          : null;
      })
      .filter(Boolean);

    return { incoming, outgoing };
  }

  /**
   * Computes relationship status between current user and target user.
   */
  async getRelationship(userId, targetUserId) {
    if (!userId || !targetUserId) {
      return { status: 'NONE', requestId: null };
    }
    if (userId === targetUserId) {
      return { status: 'SELF', requestId: null };
    }

    const rel = await Friend.findOne({
      where: {
        [Op.or]: [
          { userId, friendId: targetUserId },
          { userId: targetUserId, friendId: userId }
        ]
      }
    });

    if (!rel) return { status: 'NONE', requestId: null };
    if (rel.status === 'ACCEPTED') return { status: 'ACCEPTED', requestId: rel.id };
    if (rel.status === 'PENDING') {
      return {
        status: rel.userId === userId ? 'PENDING_SENT' : 'PENDING_RECEIVED',
        requestId: rel.id
      };
    }

    return { status: 'NONE', requestId: null };
  }

  /**
   * Search registered players by username or displayName, including friendship status.
   */
  async searchUsers(query, currentUserId) {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];

    const users = await User.findAll({
      where: {
        id: { [Op.ne]: currentUserId },
        [Op.or]: [
          { username: { [Op.like]: `%${trimmed}%` } },
          { displayName: { [Op.like]: `%${trimmed}%` } }
        ]
      },
      order: [['displayName', 'ASC']],
      limit: 15,
      attributes: USER_PUBLIC_ATTRIBUTES
    });

    if (users.length === 0) return [];

    const matchedIds = users.map(u => u.id);
    const relations = await Friend.findAll({
      where: {
        [Op.or]: [
          { userId: currentUserId, friendId: { [Op.in]: matchedIds } },
          { userId: { [Op.in]: matchedIds }, friendId: currentUserId }
        ]
      }
    });

    const relByOtherId = new Map();
    for (const rel of relations) {
      const otherId = rel.userId === currentUserId ? rel.friendId : rel.userId;
      relByOtherId.set(otherId, rel);
    }

    return users.map(u => {
      const rel = relByOtherId.get(u.id);
      let friendshipStatus = 'NONE';
      let requestId = null;

      if (rel) {
        requestId = rel.id;
        if (rel.status === 'ACCEPTED') {
          friendshipStatus = 'ACCEPTED';
        } else if (rel.status === 'PENDING') {
          friendshipStatus = rel.userId === currentUserId ? 'PENDING_SENT' : 'PENDING_RECEIVED';
        }
      }

      return this._formatUser(u, { friendshipStatus, requestId });
    });
  }

  /**
   * Sends a PENDING friend request (or auto-accepts if target already sent one).
   */
  async sendFriendRequest(requesterId, targetUserId) {
    if (!requesterId || !targetUserId || requesterId === targetUserId) {
      throw new Error('Tidak dapat menambahkan diri sendiri sebagai teman.');
    }

    const existing = await Friend.findOne({
      where: {
        [Op.or]: [
          { userId: requesterId, friendId: targetUserId },
          { userId: targetUserId, friendId: requesterId }
        ]
      }
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        return { action: 'ALREADY_FRIENDS', status: 'ACCEPTED', relation: existing };
      }
      if (existing.status === 'PENDING') {
        if (existing.userId === requesterId) {
          return { action: 'ALREADY_SENT', status: 'PENDING_SENT', relation: existing };
        }
        // Target already sent a pending request -> mutually accept
        await existing.update({ status: 'ACCEPTED' });
        return { action: 'AUTO_ACCEPTED', status: 'ACCEPTED', relation: existing };
      }
    }

    const created = await Friend.create({
      userId: requesterId,
      friendId: targetUserId,
      status: 'PENDING'
    });

    return { action: 'REQUEST_SENT', status: 'PENDING_SENT', relation: created };
  }

  /**
   * Accepts an incoming PENDING friend request (only recipient may accept).
   */
  async acceptFriendRequest(recipientId, { requestId = null, requesterId = null } = {}) {
    const where = { friendId: recipientId, status: 'PENDING' };
    if (requestId) {
      where.id = requestId;
    } else if (requesterId) {
      where.userId = requesterId;
    } else {
      throw new Error('Permintaan pertemanan tidak valid.');
    }

    const rel = await Friend.findOne({ where });
    if (!rel) {
      throw new Error('Permintaan pertemanan tidak ditemukan atau sudah diproses.');
    }

    return await rel.update({ status: 'ACCEPTED' });
  }

  /**
   * Rejects an incoming PENDING friend request.
   */
  async rejectFriendRequest(recipientId, { requestId = null, requesterId = null } = {}) {
    const where = { friendId: recipientId, status: 'PENDING' };
    if (requestId) {
      where.id = requestId;
    } else if (requesterId) {
      where.userId = requesterId;
    } else {
      throw new Error('Permintaan pertemanan tidak valid.');
    }

    const rel = await Friend.findOne({ where });
    if (!rel) {
      throw new Error('Permintaan pertemanan tidak ditemukan.');
    }

    const reqSenderId = rel.userId;
    await rel.destroy();
    return { requesterId: reqSenderId, recipientId };
  }

  /**
   * Cancels an outgoing PENDING friend request sent by senderId.
   */
  async cancelFriendRequest(senderId, { requestId = null, friendId = null } = {}) {
    const where = { userId: senderId, status: 'PENDING' };
    if (requestId) {
      where.id = requestId;
    } else if (friendId) {
      where.friendId = friendId;
    } else {
      throw new Error('Permintaan pertemanan tidak valid.');
    }

    const rel = await Friend.findOne({ where });
    if (!rel) {
      throw new Error('Permintaan pertemanan tidak ditemukan.');
    }

    const targetId = rel.friendId;
    await rel.destroy();
    return { senderId, targetId };
  }

  /**
   * Removes an existing friend relationship in either direction.
   */
  async removeFriend(userId, friendId) {
    return await Friend.destroy({
      where: {
        [Op.or]: [
          { userId, friendId },
          { userId: friendId, friendId: userId }
        ]
      }
    });
  }
}

export const friendRepository = new FriendRepository();
export default friendRepository;
