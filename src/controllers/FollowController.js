import { followRepository } from '../repositories/FollowRepository.js';
import { userRepository } from '../repositories/UserRepository.js';
import { notificationRepository } from '../repositories/NotificationRepository.js';
import { spotifyService } from '../services/SpotifyService.js';

export class FollowController {
  async getMyNetwork(req, res) {
    try {
      const userId = req.user.id;
      const io = req.app?.get('io');
      const network = await followRepository.getNetworkForUser(userId, io);
      return res.json(network);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getMutuals(req, res) {
    try {
      const userId = req.user.id;
      const io = req.app?.get('io');
      const mutuals = await followRepository.getMutuals(userId, io);
      return res.json({ mutuals, friends: mutuals });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getFollowingActivity(req, res) {
    try {
      const userId = req.user.id;
      const io = req.app?.get('io');
      const network = await followRepository.getNetworkForUser(userId, io);
      // Prioritize Mutuals & Online users for the Right Sidebar activity widget
      const topFollowing = network.following.slice(0, 15);
      const activity = await Promise.all(topFollowing.map(async (u) => {
        let nowPlaying = null;
        if (u.isOnline && u.spotifyConnected) {
          const fullUser = await userRepository.findById(u.id).catch(() => null);
          if (fullUser) {
            nowPlaying = await spotifyService.getUserCurrentlyPlaying(fullUser).catch(() => null);
          }
        }
        return {
          ...u,
          nowPlaying
        };
      }));
      return res.json({
        activity,
        counts: network.counts
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getUserFollowLists(req, res) {
    try {
      const { userId } = req.params;
      const viewerId = req.user?.id || null;
      const io = req.app?.get('io');
      const lists = await followRepository.getPublicFollowLists(userId, viewerId, io);
      return res.json(lists);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getRelationshipStatus(req, res) {
    try {
      const viewerId = req.user.id;
      const { targetUserId } = req.params;
      const status = await followRepository.getRelationship(viewerId, targetUserId);
      return res.json(status);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async followUser(req, res) {
    try {
      const followerId = req.user.id;
      const targetUserId = req.params.targetUserId || req.body.targetUserId;

      if (!targetUserId) {
        return res.status(400).json({ error: 'Target user diperlukan' });
      }
      if (targetUserId === followerId) {
        return res.status(400).json({ error: 'Tidak dapat mengikuti diri sendiri' });
      }

      const [follower, target] = await Promise.all([
        userRepository.findById(followerId),
        userRepository.findById(targetUserId)
      ]);
      if (!target) {
        return res.status(404).json({ error: 'Pemain tidak ditemukan' });
      }

      const result = await followRepository.follow(followerId, targetUserId);
      const io = req.app?.get('io');

      if (result.created && follower) {
        const notification = await notificationRepository.create({
          userId: targetUserId,
          senderId: followerId,
          type: 'NEW_FOLLOWER',
          title: result.isMutual
            ? `${follower.displayName} mem-follow balik!`
            : `${follower.displayName} mulai mengikutimu`,
          message: result.isMutual
            ? `${follower.displayName} (@${follower.username}) sekarang Mutual denganmu — kalian bisa saling ajak duel!`
            : `${follower.displayName} (@${follower.username}) mulai mengikutimu di Spotinize.`,
          data: {
            followerId: follower.id,
            followerUsername: follower.username,
            followerName: follower.displayName,
            followerAvatar: follower.avatarUrl,
            isMutual: result.isMutual
          }
        });

        if (io) {
          io.to(`user:${targetUserId}`).emit('notification:new', {
            notification: {
              ...notification.toJSON(),
              sender: {
                id: follower.id,
                displayName: follower.displayName,
                avatarUrl: follower.avatarUrl
              }
            }
          });
          io.to(`user:${targetUserId}`).emit('follow:update', { type: 'FOLLOWED', userId: followerId });
          io.to(`user:${followerId}`).emit('follow:update', { type: 'FOLLOWING', userId: targetUserId });
        }
      }

      return res.json({
        success: true,
        isFollowing: result.isFollowing,
        isFollowedBy: result.isFollowedBy,
        isMutual: result.isMutual
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async unfollowUser(req, res) {
    try {
      const followerId = req.user.id;
      const targetUserId = req.params.targetUserId || req.body.targetUserId;
      if (!targetUserId) {
        return res.status(400).json({ error: 'Target user diperlukan' });
      }

      const result = await followRepository.unfollow(followerId, targetUserId);
      const io = req.app?.get('io');
      if (io) {
        io.to(`user:${targetUserId}`).emit('follow:update', { type: 'UNFOLLOWED', userId: followerId });
        io.to(`user:${followerId}`).emit('follow:update', { type: 'UNFOLLOWING', userId: targetUserId });
      }

      return res.json({
        success: true,
        ...result
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}

export const followController = new FollowController();
export default followController;
