import { Router } from 'express';
import { getUserById } from '../../controllers/user.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router: Router = Router();

/**
 * @openapi
 * /api/v1/users/{id}:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get a user profile by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     responses:
 *       200:
 *         description: User profile returned successfully
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: User not found
 */
router.get('/:id', authenticate, getUserById);

export default router;
