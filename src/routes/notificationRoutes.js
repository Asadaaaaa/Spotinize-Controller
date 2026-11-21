import express from 'express';
import { notificationController } from '../controllers/NotificationController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', requireAuth, (req, res) => notificationController.getNotifications(req, res));
router.post('/invite', requireAuth, (req, res) => notificationController.sendInvite(req, res));
router.post('/read-all', requireAuth, (req, res) => notificationController.markAllAsRead(req, res));
router.post('/:id/read', requireAuth, (req, res) => notificationController.markAsRead(req, res));

export default router;
