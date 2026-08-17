import { Friend, User } from '../models/index.js';
import { Op } from 'sequelize';

export class FriendRepository {
  /**
   * Retrieves friends for a user, or suggests other real registered players
   */
  async getFriends(userId) {
    // 1. Get explicit friends
    const friendRelations = await Friend.findAll({
      where: {
        [Op.or]: [
          { userId },
          { friendId: userId }
        ],
        status: 'ACCEPTED'
      }
    });

    const friendIds = friendRelations.map(rel => rel.userId === userId ? rel.friendId : rel.userId);

    let friends = [];
    if (friendIds.length > 0) {
      friends = await User.findAll({
        where: {
          id: { [Op.in]: friendIds }
        },
        attributes: ['id', 'spotifyId', 'displayName', 'avatarUrl', 'bestScore', 'gamesPlayed', 'winRate', 'updatedAt']
      });
    }

    // 2. If no friends added yet, fetch other real active players in the platform!
    if (friends.length === 0) {
      friends = await User.findAll({
        where: {
          id: { [Op.ne]: userId },
          gamesPlayed: { [Op.gt]: 0 }
        },
        order: [
          ['bestScore', 'DESC'],
          ['gamesPlayed', 'DESC'],
          ['updatedAt', 'DESC']
        ],
        limit: 15,
        attributes: ['id', 'spotifyId', 'displayName', 'avatarUrl', 'bestScore', 'gamesPlayed', 'winRate', 'updatedAt']
      });
    }

    // Check recent activity within 15 minutes as online status indicator
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    return friends.map(friend => {
      const isOnline = new Date(friend.updatedAt) > fifteenMinutesAgo;
      return {
        id: friend.id,
        spotifyId: friend.spotifyId,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
        bestScore: friend.bestScore || 0,
        gamesPlayed: friend.gamesPlayed || 0,
        winRate: friend.winRate || 0,
        isOnline
      };
    });
  }

  /**
   * Search registered players by name
   */
  async searchUsers(query, excludeUserId) {
    if (!query || query.trim() === '') return [];

    const users = await User.findAll({
      where: {
        id: { [Op.ne]: excludeUserId },
        displayName: {
          [Op.like]: `%${query.trim()}%`
        }
      },
      limit: 10,
      attributes: ['id', 'spotifyId', 'displayName', 'avatarUrl', 'bestScore', 'gamesPlayed', 'winRate', 'updatedAt']
    });

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    return users.map(u => ({
      id: u.id,
      spotifyId: u.spotifyId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      bestScore: u.bestScore || 0,
      gamesPlayed: u.gamesPlayed || 0,
      winRate: u.winRate || 0,
      isOnline: new Date(u.updatedAt) > fifteenMinutesAgo
    }));
  }

  /**
   * Add a friend
   */
  async addFriend(userId, friendId) {
    if (userId === friendId) return null;
    const existing = await Friend.findOne({
      where: {
        [Op.or]: [
          { userId, friendId },
          { userId: friendId, friendId: userId }
        ]
      }
    });

    if (existing) {
      if (existing.status !== 'ACCEPTED') {
        return await existing.update({ status: 'ACCEPTED' });
      }
      return existing;
    }

    return await Friend.create({
      userId,
      friendId,
      status: 'ACCEPTED'
    });
  }

  /**
   * Remove friend
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
