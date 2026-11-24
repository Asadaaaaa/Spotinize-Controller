import express from 'express';
import { followController } from '../controllers/FollowController.js';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/me', requireAuth, (req, res) => followController.getMyNetwork(req, res));
router.get('/mutuals', requireAuth, (req, res) => followController.getMutuals(req, res));
router.get('/activity', requireAuth, (req, res) => followController.getFollowingActivity(req, res));
router.get('/user/:userId', optionalAuth, (req, res) => followController.getUserFollowLists(req, res));
router.get('/status/:targetUserId', requireAuth, (req, res) => followController.getRelationshipStatus(req, res));
router.post('/:targetUserId', requireAuth, (req, res) => followController.followUser(req, res));
router.delete('/:targetUserId', requireAuth, (req, res) => followController.unfollowUser(req, res));

export default router;
