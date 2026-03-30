import { Router } from 'express';
import { register } from '../../controllers/auth.controller';
import { validate } from '../../middlewares/validate.middleware';
import { registerSchema } from '../../schemas/auth.schema';

const router: Router = Router();

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Register a new user
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
 *               - password
 *               - type
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
 *               email:
 *                 type: string
 *                 format: email
 *                 example: vugar@example.com
 *               password:
 *                 type: string
 *                 example: Secret123
 *               type:
 *                 type: string
 *                 enum: [uso, ucr]
 *                 example: uso
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already in use
 */
router.post('/register', validate(registerSchema), register);

export default router;
