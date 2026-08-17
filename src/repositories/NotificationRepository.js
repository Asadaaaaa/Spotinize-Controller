import { Notification, User } from '../models/index.js';

export class NotificationRepository {
  async create({ userId, senderId, type = 'INVITE', title, message, data = null }) {
    return await Notification.create({
      userId,
      senderId,
      type,
      title,
      message,
      data,
      isRead: false
    });
  }

  async findByUserId(userId, limit = 20) {
    return await Notification.findAll({
      where: { userId },
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'displayName', 'avatarUrl', 'spotifyId']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  async countUnread(userId) {
    return await Notification.count({
      where: { userId, isRead: false }
    });
  }

  async markAsRead(id, userId) {
    const notif = await Notification.findOne({ where: { id, userId } });
    if (notif) {
      await notif.update({ isRead: true });
    }
    return notif;
  }

  async markAllAsRead(userId) {
    await Notification.update({ isRead: true }, { where: { userId, isRead: false } });
  }

  async delete(id, userId) {
    return await Notification.destroy({ where: { id, userId } });
  }
}

export const notificationRepository = new NotificationRepository();
export default notificationRepository;
