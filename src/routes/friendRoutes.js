import express from 'express';
import { friendController } from '../controllers/FriendController.js';

const router = express.Router();

router.get('/search', (req, res) => friendController.searchPlayers(req, res));
router.post('/add', (req, res) => friendController.addFriend(req, res));
router.post('/remove', (req, res) => friendController.removeFriend(req, res));
router.get('/:id', (req, res) => friendController.getFriends(req, res));

export default router;
