import { Router } from 'express';
import multer from 'multer';
import { uploadAvatar, removeAvatar } from '../../controllers/media.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { AppError } from '../../middlewares/error.middleware';

const router: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err: AppError = new Error();
      err.statusCode = 415;
      err.messageKey = 'media.invalid_file_type';
      cb(err as unknown as null, false);
    }
  },
});

/**
 * @openapi
 * /api/v1/users/me/avatar:
 *   post:
 *     tags:
 *       - Media
 *     summary: Upload or replace profile avatar
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image file (jpg, png, webp). Max 5 MB.
 *     responses:
 *       201:
 *         description: Avatar uploaded successfully
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
 *                   example: 201
 *                 message:
 *                   type: string
 *                   example: media.avatar_upload_success
 *                 data:
 *                   type: object
 *                   properties:
 *                     avatar_url:
 *                       type: string
 *                       example: http://localhost:4027/uploads/users/.../file.webp
 *       400:
 *         description: No file provided
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: User not found
 *       413:
 *         description: File too large (max 5 MB)
 *       415:
 *         description: Invalid file type (jpg, png, webp only)
 */
router.post('/me/avatar', authenticate, upload.single('file'), uploadAvatar);

/**
 * @openapi
 * /api/v1/users/me/avatar:
 *   delete:
 *     tags:
 *       - Media
 *     summary: Remove profile avatar
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Avatar removed successfully
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
 *                   example: media.avatar_remove_success
 *                 data:
 *                   type: object
 *                   properties:
 *                     avatar_url:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: User not found
 */
router.delete('/me/avatar', authenticate, removeAvatar);

export default router;
