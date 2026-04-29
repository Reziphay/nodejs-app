import { Router } from 'express';
import {
  listQueue,
  getBrandDetail,
  approveBrand,
  rejectBrand,
  getServiceDetail,
  approveService,
  rejectService,
} from '../../controllers/moderation.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  approveSchema,
  rejectSchema,
} from '../../schemas/moderation.schema';

const router: Router = Router();

/**
 * @openapi
 * /api/v1/admin/queue:
 *   get:
 *     tags:
 *       - Admin Moderation
 *     summary: Get the moderation queue
 *     description: Returns pending brands and/or services awaiting admin review.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [brand, service]
 *         description: Filter by entity type. Omit for both.
 *     responses:
 *       200:
 *         description: Moderation queue returned successfully.
 *       403:
 *         description: Forbidden — admin access required.
 */
router.get('/admin/queue', authenticate, listQueue);

/**
 * @openapi
 * /api/v1/admin/brands/{id}:
 *   get:
 *     tags:
 *       - Admin Moderation
 *     summary: Get brand detail for moderation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Brand detail returned.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Brand not found.
 */
router.get('/admin/brands/:id', authenticate, getBrandDetail);

/**
 * @openapi
 * /api/v1/admin/brands/{id}/approve:
 *   post:
 *     tags:
 *       - Admin Moderation
 *     summary: Approve a pending brand
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               checklist:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key: { type: string }
 *                     label: { type: string }
 *                     passed: { type: boolean }
 *     responses:
 *       200:
 *         description: Brand approved.
 *       400:
 *         description: Brand is not in PENDING status.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Brand not found.
 */
router.post('/admin/brands/:id/approve', authenticate, validate(approveSchema), approveBrand);

/**
 * @openapi
 * /api/v1/admin/brands/{id}/reject:
 *   post:
 *     tags:
 *       - Admin Moderation
 *     summary: Reject a pending brand
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rejection_reason
 *             properties:
 *               rejection_reason:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 1000
 *               checklist:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key: { type: string }
 *                     label: { type: string }
 *                     passed: { type: boolean }
 *     responses:
 *       200:
 *         description: Brand rejected.
 *       400:
 *         description: Brand is not in PENDING status or validation failed.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Brand not found.
 */
router.post('/admin/brands/:id/reject', authenticate, validate(rejectSchema), rejectBrand);

/**
 * @openapi
 * /api/v1/admin/services/{id}:
 *   get:
 *     tags:
 *       - Admin Moderation
 *     summary: Get service detail for moderation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Service detail returned.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Service not found.
 */
router.get('/admin/services/:id', authenticate, getServiceDetail);

/**
 * @openapi
 * /api/v1/admin/services/{id}/approve:
 *   post:
 *     tags:
 *       - Admin Moderation
 *     summary: Approve a pending service
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               checklist:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key: { type: string }
 *                     label: { type: string }
 *                     passed: { type: boolean }
 *     responses:
 *       200:
 *         description: Service approved.
 *       400:
 *         description: Service is not in PENDING status.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Service not found.
 */
router.post('/admin/services/:id/approve', authenticate, validate(approveSchema), approveService);

/**
 * @openapi
 * /api/v1/admin/services/{id}/reject:
 *   post:
 *     tags:
 *       - Admin Moderation
 *     summary: Reject a pending service
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rejection_reason
 *             properties:
 *               rejection_reason:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 1000
 *               checklist:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     key: { type: string }
 *                     label: { type: string }
 *                     passed: { type: boolean }
 *     responses:
 *       200:
 *         description: Service rejected.
 *       400:
 *         description: Service is not in PENDING status or validation failed.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Service not found.
 */
router.post('/admin/services/:id/reject', authenticate, validate(rejectSchema), rejectService);

export default router;
