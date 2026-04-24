import { Router } from 'express';
import multer from 'multer';
import {
  createBrand,
  getMyBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
  transferBrand,
  upsertBrandRating,
  acceptTransfer,
  rejectTransfer,
  cancelTransfer,
  listIncomingTransfers,
  listOutgoingTransfers,
  listPublicBrands,
  addBranch,
  updateBranch,
  deleteBranch,
  listCategories,
} from '../../controllers/brand.controller';
import { uploadBrandMedia } from '../../controllers/media.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { AppError } from '../../middlewares/error.middleware';
import {
  createBrandSchema,
  updateBrandSchema,
  transferBrandSchema,
  upsertBrandRatingSchema,
  deleteBrandSchema,
  createBranchSchema,
  updateBranchSchema,
} from '../../schemas/brand.schema';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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

const router: Router = Router();

// ─── Brand / branch media upload ─────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/brands/media:
 *   post:
 *     tags:
 *       - Brands
 *     summary: Upload a brand or branch image (USO only)
 *     description: |
 *       Upload an image for brand or branch use. Pass `usage` in the form body to
 *       apply the correct aspect-ratio validation:
 *       - `logo` — 1:1 square (brand logo)
 *       - `gallery` — 16:9 landscape (brand gallery)
 *       - `branch_cover` — 16:9 landscape (branch cover photo)
 *       - omit — no ratio check (generic upload)
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
 *                 description: Image file (jpg, png, webp). Max 10 MB.
 *               usage:
 *                 type: string
 *                 enum: [logo, gallery, branch_cover]
 *                 description: Intended use — drives aspect-ratio validation.
 *     responses:
 *       201:
 *         description: Media uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     media_id:
 *                       type: string
 *                     url:
 *                       type: string
 *       400:
 *         description: Invalid aspect ratio for the given usage
 *       413:
 *         description: File too large
 *       415:
 *         description: Invalid file type
 */
router.post('/brands/media', authenticate, upload.single('file'), uploadBrandMedia);

// ─── Categories (public) ──────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/brand-categories:
 *   get:
 *     tags:
 *       - Brands
 *     summary: List all brand categories
 *     responses:
 *       200:
 *         description: Categories returned successfully
 */
router.get('/brand-categories', listCategories);

// ─── Public brand listing ─────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/brands:
 *   get:
 *     tags:
 *       - Brands
 *     summary: List all active (public) brands
 *     responses:
 *       200:
 *         description: Active brands returned successfully
 */
router.get('/brands', listPublicBrands);

// ─── Authenticated brand endpoints ────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/brands/mine:
 *   get:
 *     tags:
 *       - Brands
 *     summary: Get authenticated USO user's own brands
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Own brands returned successfully
 *       403:
 *         description: Forbidden — not a USO user
 */
router.get('/brands/mine', authenticate, getMyBrands);

/**
 * @openapi
 * /api/v1/brands:
 *   post:
 *     tags:
 *       - Brands
 *     summary: Create a new brand (USO only, requires email or phone verified)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: My Brand
 *               description:
 *                 type: string
 *               categoryIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               logo_media_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Brand created
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden
 */
router.post('/brands', authenticate, validate(createBrandSchema), createBrand);

/**
 * @openapi
 * /api/v1/brands/{id}:
 *   get:
 *     tags:
 *       - Brands
 *     summary: Get a brand by ID (public for ACTIVE brands, owner-only otherwise)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Brand returned
 *       404:
 *         description: Brand not found
 */
router.get('/brands/:id', authenticate, getBrandById);

/**
 * @openapi
 * /api/v1/brands/{id}:
 *   patch:
 *     tags:
 *       - Brands
 *     summary: Update a brand (USO owner only)
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
 *         description: Brand updated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Brand not found
 */
router.patch('/brands/:id', authenticate, validate(updateBrandSchema), updateBrand);

/**
 * @openapi
 * /api/v1/brands/{id}:
 *   delete:
 *     tags:
 *       - Brands
 *     summary: Delete a brand (USO owner only)
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
 *         description: Brand deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Brand not found
 */
router.delete('/brands/:id', authenticate, validate(deleteBrandSchema), deleteBrand);

/**
 * @openapi
 * /api/v1/brands/{id}/transfer:
 *   post:
 *     tags:
 *       - Brands
 *     summary: Initiate a brand transfer to another USO user
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
 *               - target_user_id
 *             properties:
 *               target_user_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Transfer initiated
 *       400:
 *         description: Validation error or invalid target
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Brand or target user not found
 */
router.post('/brands/:id/transfer', authenticate, validate(transferBrandSchema), transferBrand);
router.put('/brands/:id/rating', authenticate, validate(upsertBrandRatingSchema), upsertBrandRating);

// List pending incoming transfers for the authenticated user
router.get('/brands/transfers/incoming', authenticate, listIncomingTransfers);
router.get('/brands/transfers/outgoing', authenticate, listOutgoingTransfers);

// Accept / reject / cancel a specific transfer
router.patch('/brands/transfers/:transferId/accept', authenticate, acceptTransfer);
router.patch('/brands/transfers/:transferId/reject', authenticate, rejectTransfer);
router.patch('/brands/transfers/:transferId/cancel', authenticate, cancelTransfer);

// ─── Branches ─────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/brands/{id}/branches:
 *   post:
 *     tags:
 *       - Branches
 *     summary: Add a branch to a brand (USO owner only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Branch created
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Brand not found
 */
router.post('/brands/:id/branches', authenticate, validate(createBranchSchema), addBranch);

/**
 * @openapi
 * /api/v1/brands/{id}/branches/{branchId}:
 *   patch:
 *     tags:
 *       - Branches
 *     summary: Update a branch (USO owner only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Branch updated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Brand or branch not found
 */
router.patch('/brands/:id/branches/:branchId', authenticate, validate(updateBranchSchema), updateBranch);

/**
 * @openapi
 * /api/v1/brands/{id}/branches/{branchId}:
 *   delete:
 *     tags:
 *       - Branches
 *     summary: Delete a branch (USO owner only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Branch deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Brand or branch not found
 */
router.delete('/brands/:id/branches/:branchId', authenticate, deleteBranch);

export default router;
