import { Router } from 'express';
import { DeployController } from '../controllers/DeployController.js';

const router = Router();

// Endpoint for GitHub Webhook: POST /api/deploy/webhook
router.post('/webhook', (req, res) => DeployController.handleWebhook(req, res));

export default router;
