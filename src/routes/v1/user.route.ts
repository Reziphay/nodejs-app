import { Router } from 'express';
import { deleteMe, getUserById, updateMe, searchUsoUsers } from '../../controllers/user.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { deleteMeSchema, updateMeSchema } from '../../schemas/user.schema';

const router: Router = Router();

/**
 * @openapi
 * /api/v1/users/me:
 *   patch:
 *     tags:
 *       - Users
 *     summary: Update authenticated user's own profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - last_name
 *               - birthday
 *               - country
 *               - email
 *             properties:
 *               first_name:
 *                 type: string
 *                 example: Vugar
 *               last_name:
 *                 type: string
 *                 example: Safarzada
 *               birthday:
 *                 type: string
 *                 format: date
 *                 example: "1995-06-15"
 *               country:
 *                 type: string
 *                 example: Azerbaijan
 *               country_prefix:
 *                 type: string
 *                 nullable: true
 *                 example: "+994"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: vugar@example.com
 *               phone:
 *                 type: string
 *                 nullable: true
 *                 example: "501234567"
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: User not found
 *       409:
 *         description: |
 *           Conflict. Possible message keys:
 *           - user.email_already_in_use — email belongs to another account
 *           - user.phone_already_in_use — phone belongs to another account
 *           - user.email_change_not_allowed — email is verified and cannot be changed
 *           - user.phone_change_not_allowed — phone is verified and cannot be changed
 */
router.patch('/me', authenticate, validate(updateMeSchema), updateMe);

/**
 * @openapi
 * /api/v1/users/me:
 *   delete:
 *     tags:
 *       - Users
 *     summary: Delete the authenticated account after step-up authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted successfully
 */
router.delete('/me', authenticate, validate(deleteMeSchema), deleteMe);

// Search USO users by name / email / phone for brand transfer (USO only)
router.get('/search', authenticate, searchUsoUsers);

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
 *         description: Public user profile returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: user.profile_success
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         first_name:
 *                           type: string
 *                         last_name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         type:
 *                           type: string
 *                           enum: [uso, ucr, admin]
 *                         created_at:
 *                           type: string
 *                           format: date-time
 *                         updated_at:
 *                           type: string
 *                           format: date-time
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: User not found
 */
router.get('/:id', authenticate, getUserById);

export default router;
