import { friendRepository } from '../repositories/FriendRepository.js';
import { userRepository } from '../repositories/UserRepository.js';
import { notificationRepository } from '../repositories/NotificationRepository.js';
import { Notification } from '../models/index.js';

export class FriendController {
  async getFriends(req, res) {
    try {
      const userId = req.user.id;
      const [friends, pending] = await Promise.all([
        friendRepository.getFriends(userId),
        friendRepository.getPendingRequests(userId)
      ]);
      return res.json({
        friends,
        incomingRequests: pending.incoming,
        outgoingRequests: pending.outgoing
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getRequests(req, res) {
    try {
      const userId = req.user.id;
      const pending = await friendRepository.getPendingRequests(userId);
      return res.json(pending);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getFriendshipStatus(req, res) {
    try {
      const userId = req.user.id;
      const { targetUserId } = req.params;
      const relationship = await friendRepository.getRelationship(userId, targetUserId);
      return res.json(relationship);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async searchPlayers(req, res) {
    try {
      const userId = req.user.id;
      const { q } = req.query;
      const players = await friendRepository.searchUsers(q, userId);
      return res.json({ players });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async sendFriendRequest(req, res) {
    try {
      const userId = req.user.id;
      const { friendId } = req.body;

      if (!friendId) {
        return res.status(400).json({ error: 'Target user diperlukan' });
      }
      if (friendId === userId) {
        return res.status(400).json({ error: 'Tidak dapat menambahkan diri sendiri sebagai teman.' });
      }

      const [sender, target] = await Promise.all([
        userRepository.findById(userId),
        userRepository.findById(friendId)
      ]);

      if (!target) {
        return res.status(404).json({ error: 'Pemain tidak ditemukan' });
      }

      const result = await friendRepository.sendFriendRequest(userId, friendId);
      const io = req.app?.get('io');

      if (result.action === 'REQUEST_SENT' && sender) {
        const notification = await notificationRepository.create({
          userId: friendId,
          senderId: userId,
          type: 'FRIEND_REQUEST',
          title: `Permintaan Pertemanan dari ${sender.displayName}`,
          message: `${sender.displayName} (@${sender.username}) ingin berteman denganmu di Spotinize!`,
          data: {
            requestId: result.relation.id,
            requesterId: userId,
            requesterUsername: sender.username,
            requesterName: sender.displayName,
            requesterAvatar: sender.avatarUrl
          }
        });

        if (io) {
          io.to(`user:${friendId}`).emit('notification:new', {
            notification: {
              ...notification.toJSON(),
              sender: {
                id: sender.id,
                displayName: sender.displayName,
                avatarUrl: sender.avatarUrl
              }
            }
          });
          io.to(`user:${friendId}`).emit('friend:update', { type: 'REQUEST_RECEIVED', userId });
        }
      } else if (result.action === 'AUTO_ACCEPTED' && sender) {
        const notification = await notificationRepository.create({
          userId: friendId,
          senderId: userId,
          type: 'SYSTEM',
          title: 'Permintaan Pertemanan Diterima',
          message: `${sender.displayName} (@${sender.username}) juga menambahkanmu — kalian sekarang berteman!`,
          data: {
            friendId: userId,
            friendUsername: sender.username
          }
        });

        if (io) {
          io.to(`user:${friendId}`).emit('notification:new', {
            notification: {
              ...notification.toJSON(),
              sender: {
                id: sender.id,
                displayName: sender.displayName,
                avatarUrl: sender.avatarUrl
              }
            }
          });
          io.to(`user:${friendId}`).emit('friend:update', { type: 'ACCEPTED', userId });
          io.to(`user:${userId}`).emit('friend:update', { type: 'ACCEPTED', userId: friendId });
        }
      }

      return res.json({
        success: true,
        action: result.action,
        status: result.status,
        requestId: result.relation?.id || null
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async acceptFriendRequest(req, res) {
    try {
      const userId = req.user.id;
      const { requestId, requesterId } = req.body;

      const relation = await friendRepository.acceptFriendRequest(userId, { requestId, requesterId });

      // Mark corresponding FRIEND_REQUEST notifications as read
      await Notification.update(
        { isRead: true },
        {
          where: {
            userId,
            senderId: relation.userId,
            type: 'FRIEND_REQUEST',
            isRead: false
          }
        }
      );

      const acceptor = await userRepository.findById(userId);
      const io = req.app?.get('io');

      if (acceptor) {
        const notification = await notificationRepository.create({
          userId: relation.userId,
          senderId: userId,
          type: 'SYSTEM',
          title: 'Permintaan Pertemanan Diterima',
          message: `${acceptor.displayName} (@${acceptor.username}) menerima permintaan pertemananmu!`,
          data: {
            friendId: userId,
            friendUsername: acceptor.username
          }
        });

        if (io) {
          io.to(`user:${relation.userId}`).emit('notification:new', {
            notification: {
              ...notification.toJSON(),
              sender: {
                id: acceptor.id,
                displayName: acceptor.displayName,
                avatarUrl: acceptor.avatarUrl
              }
            }
          });
        }
      }

      if (io) {
        io.to(`user:${relation.userId}`).emit('friend:update', { type: 'ACCEPTED', userId });
        io.to(`user:${userId}`).emit('friend:update', { type: 'ACCEPTED', userId: relation.userId });
      }

      return res.json({
        success: true,
        status: 'ACCEPTED',
        friendId: relation.userId
      });
    } catch (err) {
      const status = err.message.includes('tidak ditemukan') ? 404 : 400;
      return res.status(status).json({ error: err.message });
    }
  }

  async rejectFriendRequest(req, res) {
    try {
      const userId = req.user.id;
      const { requestId, requesterId } = req.body;

      const result = await friendRepository.rejectFriendRequest(userId, { requestId, requesterId });

      await Notification.update(
        { isRead: true },
        {
          where: {
            userId,
            senderId: result.requesterId,
            type: 'FRIEND_REQUEST',
            isRead: false
          }
        }
      );

      const io = req.app?.get('io');
      if (io) {
        io.to(`user:${result.requesterId}`).emit('friend:update', { type: 'REJECTED', userId });
        io.to(`user:${userId}`).emit('friend:update', { type: 'REJECTED', userId: result.requesterId });
      }

      return res.json({ success: true });
    } catch (err) {
      const status = err.message.includes('tidak ditemukan') ? 404 : 400;
      return res.status(status).json({ error: err.message });
    }
  }

  async cancelFriendRequest(req, res) {
    try {
      const userId = req.user.id;
      const { requestId, friendId } = req.body;

      const result = await friendRepository.cancelFriendRequest(userId, { requestId, friendId });

      const io = req.app?.get('io');
      if (io) {
        io.to(`user:${result.targetId}`).emit('friend:update', { type: 'CANCELED', userId });
        io.to(`user:${userId}`).emit('friend:update', { type: 'CANCELED', userId: result.targetId });
      }

      return res.json({ success: true });
    } catch (err) {
      const status = err.message.includes('tidak ditemukan') ? 404 : 400;
      return res.status(status).json({ error: err.message });
    }
  }

  async removeFriend(req, res) {
    try {
      const userId = req.user.id;
      const { friendId } = req.body;

      if (!friendId) {
        return res.status(400).json({ error: 'Target user diperlukan' });
      }

      await friendRepository.removeFriend(userId, friendId);

      const io = req.app?.get('io');
      if (io) {
        io.to(`user:${friendId}`).emit('friend:update', { type: 'REMOVED', userId });
        io.to(`user:${userId}`).emit('friend:update', { type: 'REMOVED', userId: friendId });
      }

      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

export const friendController = new FriendController();
export default friendController;
