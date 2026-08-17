import express from 'express';
import { notificationController } from '../controllers/NotificationController.js';

const router = express.Router();

router.get('/', (req, res) => notificationController.getNotifications(req, res));
router.post('/invite', (req, res) => notificationController.sendInvite(req, res));
router.post('/read-all', (req, res) => notificationController.markAllAsRead(req, res));
router.post('/:id/read', (req, res) => notificationController.markAsRead(req, res));

export default router;
