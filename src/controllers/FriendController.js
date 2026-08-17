import { friendRepository } from '../repositories/FriendRepository.js';

export class FriendController {
  async getFriends(req, res) {
    try {
      const { id } = req.params;
      const friends = await friendRepository.getFriends(id);
      return res.json({ friends });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async searchPlayers(req, res) {
    try {
      const { q, userId } = req.query;
      const players = await friendRepository.searchUsers(q, userId);
      return res.json({ players });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async addFriend(req, res) {
    try {
      const { userId, friendId } = req.body;
      const result = await friendRepository.addFriend(userId, friendId);
      return res.json({ success: true, result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async removeFriend(req, res) {
    try {
      const { userId, friendId } = req.body;
      await friendRepository.removeFriend(userId, friendId);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

export const friendController = new FriendController();
export default friendController;
