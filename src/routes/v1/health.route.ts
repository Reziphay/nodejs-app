import { Router } from 'express';
import { healthCheck } from '../../controllers/health.controller';

const router = Router();

/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Server is running
 */
router.get('/', healthCheck);

export default router;
