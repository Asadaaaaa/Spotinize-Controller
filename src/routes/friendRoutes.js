import express from 'express';
import { friendController } from '../controllers/FriendController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', requireAuth, (req, res) => friendController.getFriends(req, res));
router.get('/requests', requireAuth, (req, res) => friendController.getRequests(req, res));
router.get('/search', requireAuth, (req, res) => friendController.searchPlayers(req, res));
router.get('/status/:targetUserId', requireAuth, (req, res) => friendController.getFriendshipStatus(req, res));
router.post('/request', requireAuth, (req, res) => friendController.sendFriendRequest(req, res));
router.post('/add', requireAuth, (req, res) => friendController.sendFriendRequest(req, res));
router.post('/accept', requireAuth, (req, res) => friendController.acceptFriendRequest(req, res));
router.post('/reject', requireAuth, (req, res) => friendController.rejectFriendRequest(req, res));
router.post('/cancel', requireAuth, (req, res) => friendController.cancelFriendRequest(req, res));
router.post('/remove', requireAuth, (req, res) => friendController.removeFriend(req, res));
router.get('/:id', requireAuth, (req, res) => friendController.getFriends(req, res));

export default router;
