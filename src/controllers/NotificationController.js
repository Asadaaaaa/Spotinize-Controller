import { notificationRepository } from '../repositories/NotificationRepository.js';
import { userRepository } from '../repositories/UserRepository.js';
import { gameRepository } from '../repositories/GameRepository.js';

export class NotificationController {
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const notifications = await notificationRepository.findByUserId(userId);
      const unreadCount = await notificationRepository.countUnread(userId);

      return res.json({ notifications, unreadCount });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async markAsRead(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const notif = await notificationRepository.markAsRead(id, userId);
      return res.json({ success: true, notification: notif });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;
      await notificationRepository.markAllAsRead(userId);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async sendInvite(req, res) {
    try {
      const hostUserId = req.user.id;
      const { targetUserId, roomCode, gameId } = req.body;

      if (!hostUserId || !targetUserId || !roomCode) {
        return res.status(400).json({ error: 'Data undangan tidak lengkap' });
      }

      const host = await userRepository.findById(hostUserId);
      if (!host) return res.status(404).json({ error: 'Host tidak ditemukan' });

      let game = null;
      if (gameId) {
        game = await gameRepository.findById(gameId);
      } else {
        game = await gameRepository.findByRoomCode(roomCode);
      }

      const title = `Undangan Main dari ${host.displayName}`;
      const message = `${host.displayName} mengajak kamu bermain tebak lagu di Room [${roomCode}] (${game?.category || 'Global Trends'})!`;

      const data = {
        roomCode,
        gameId: game?.id,
        category: game?.category || 'Global Trends',
        numberOfSongs: game?.numberOfSongs || 5,
        hostId: host.id,
        hostName: host.displayName,
        hostAvatar: host.avatarUrl
      };

      const notification = await notificationRepository.create({
        userId: targetUserId,
        senderId: host.id,
        type: 'INVITE',
        title,
        message,
        data
      });

      // Broadcast real-time socket event if user is connected
      const io = req.app?.get('io');
      if (io) {
        io.to(`user:${targetUserId}`).emit('notification:new', {
          notification: {
            ...notification.toJSON(),
            sender: {
              id: host.id,
              displayName: host.displayName,
              avatarUrl: host.avatarUrl
            }
          }
        });
      }

      return res.json({ success: true, notification });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

export const notificationController = new NotificationController();
export default notificationController;
