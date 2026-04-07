import { Router } from 'express';
import {
  createBrand,
  getMyBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
  transferBrand,
  listPublicBrands,
  addBranch,
  updateBranch,
  deleteBranch,
  listCategories,
} from '../../controllers/brand.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  createBrandSchema,
  updateBrandSchema,
  transferBrandSchema,
  createBranchSchema,
  updateBranchSchema,
} from '../../schemas/brand.schema';

const router: Router = Router();

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
router.delete('/brands/:id', authenticate, deleteBrand);

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
