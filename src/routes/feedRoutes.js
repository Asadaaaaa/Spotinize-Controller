import express from 'express';
import { feedController } from '../controllers/FeedController.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', optionalAuth, (req, res) => feedController.getFeed(req, res));
router.get('/user/:userId', optionalAuth, (req, res) => feedController.getUserPosts(req, res));
router.post('/posts', requireAuth, (req, res) => feedController.createPost(req, res));
router.delete('/posts/:postId', requireAuth, (req, res) => feedController.deletePost(req, res));
router.post('/posts/:postId/react', requireAuth, (req, res) => feedController.toggleReaction(req, res));
router.get('/posts/:postId/comments', optionalAuth, (req, res) => feedController.getComments(req, res));
router.post('/posts/:postId/comments', requireAuth, (req, res) => feedController.addComment(req, res));
router.post('/posts/:postId/blind-guess', requireAuth, (req, res) => feedController.submitBlindGuess(req, res));
router.post('/posts/:postId/blind-giveup', requireAuth, (req, res) => feedController.giveUpBlindDrop(req, res));
router.post('/challenges', requireAuth, (req, res) => feedController.createChallenge(req, res));
router.post('/challenges/:postId/play', requireAuth, (req, res) => feedController.playChallenge(req, res));

export default router;
