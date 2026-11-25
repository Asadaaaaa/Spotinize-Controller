import { feedService } from '../services/FeedService.js';

export class FeedController {
  async getFeed(req, res) {
    try {
      const viewerId = req.user?.id || null;
      const offset = parseInt(req.query.offset || '0', 10);
      const limit = parseInt(req.query.limit || '15', 10);
      const tab = req.query.tab || 'explore';
      const data = await feedService.getCombinedFeed(viewerId, { offset, limit, tab });
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async getUserPosts(req, res) {
    try {
      const { userId } = req.params;
      const viewerId = req.user?.id || null;
      const posts = await feedService.getUserPosts(userId, viewerId);
      return res.json({ posts });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async createPost(req, res) {
    try {
      const userId = req.user.id;
      const { type, content, track, metadata } = req.body;
      const post = await feedService.createPost(userId, { type, content, track, metadata });
      return res.status(201).json({ post });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async deletePost(req, res) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;
      const result = await feedService.deletePost(postId, userId);
      return res.json(result);
    } catch (err) {
      const status = err.message.includes('tidak ditemukan') ? 404 : 403;
      return res.status(status).json({ error: err.message });
    }
  }

  async toggleReaction(req, res) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;
      const { emoji } = req.body;
      const io = req.app?.get('io');
      const result = await feedService.toggleReaction(postId, userId, emoji, io);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async getComments(req, res) {
    try {
      const { postId } = req.params;
      const comments = await feedService.getComments(postId);
      return res.json({ comments });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async addComment(req, res) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;
      const { content } = req.body;
      const io = req.app?.get('io');
      const result = await feedService.addComment(postId, userId, content, io);
      return res.status(201).json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async submitBlindGuess(req, res) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;
      const { guessedTrack, revealLevel } = req.body;
      const result = await feedService.submitBlindDropGuess(postId, userId, guessedTrack, revealLevel);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async giveUpBlindDrop(req, res) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;
      const result = await feedService.giveUpBlindDrop(postId, userId);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async createChallenge(req, res) {
    try {
      const userId = req.user.id;
      const { sourceGameId, content } = req.body;
      const post = await feedService.createChallengePost(userId, { sourceGameId, content });
      return res.status(201).json({ post });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  async playChallenge(req, res) {
    try {
      const userId = req.user.id;
      const { postId } = req.params;
      const gameState = await feedService.playChallenge(postId, userId);
      return res.json(gameState);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}

export const feedController = new FeedController();
export default feedController;
