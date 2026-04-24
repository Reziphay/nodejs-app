import { Router } from 'express';
import {
  getTeamWorkspace,
  getBranchTeam,
  inviteToTeam,
  acceptInvitation,
  rejectInvitation,
  removeMember,
  getMyInvitations,
} from '../../controllers/team.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { inviteToTeamSchema } from '../../schemas/team.schema';

const router: Router = Router();

// ─── Team workspace (owner view) ─────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/brands/{id}/team-workspace:
 *   get:
 *     tags:
 *       - Team
 *     summary: Get brand team workspace — all branches with their team state (owner only)
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
 *         description: Workspace returned
 *       403:
 *         description: Not the brand owner
 *       404:
 *         description: Brand not found
 */
router.get('/brands/:id/team-workspace', authenticate, getTeamWorkspace);

/**
 * @openapi
 * /api/v1/brands/{id}/branches/{branchId}/team:
 *   get:
 *     tags:
 *       - Team
 *     summary: Get a single branch team in detail (owner only)
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
 *         description: Team returned
 *       403:
 *         description: Not the brand owner
 *       404:
 *         description: Brand or branch not found
 */
router.get('/brands/:id/branches/:branchId/team', authenticate, getBranchTeam);

// ─── Invitations ─────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/brands/{id}/branches/{branchId}/team/invitations:
 *   post:
 *     tags:
 *       - Team
 *     summary: Invite a USO user into a branch team (owner only)
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
 *         description: Invitation sent
 *       400:
 *         description: Cannot invite self or non-USO user
 *       403:
 *         description: Not the brand owner
 *       404:
 *         description: Brand, branch, or target user not found
 *       409:
 *         description: User already has an active invitation or membership
 */
router.post(
  '/brands/:id/branches/:branchId/team/invitations',
  authenticate,
  validate(inviteToTeamSchema),
  inviteToTeam,
);

// ─── Accept / reject (invited user) ──────────────────────────────────────────

/**
 * @openapi
 * /api/v1/team-members/{teamMemberId}/accept:
 *   patch:
 *     tags:
 *       - Team
 *     summary: Accept a pending team invitation (invited user only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamMemberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation accepted
 *       400:
 *         description: Invitation is not in PENDING state
 *       404:
 *         description: Membership not found
 */
router.patch('/team-members/:teamMemberId/accept', authenticate, acceptInvitation);

/**
 * @openapi
 * /api/v1/team-members/{teamMemberId}/reject:
 *   patch:
 *     tags:
 *       - Team
 *     summary: Reject a pending team invitation (invited user only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamMemberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation rejected
 *       400:
 *         description: Invitation is not in PENDING state
 *       404:
 *         description: Membership not found
 */
router.patch('/team-members/:teamMemberId/reject', authenticate, rejectInvitation);

// ─── My pending invitations ───────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/team-members/my-invitations:
 *   get:
 *     tags:
 *       - Team
 *     summary: List all pending team invitations for the authenticated USO user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Invitations returned
 *       403:
 *         description: Not a USO user
 */
// NOTE: this route must be declared BEFORE /:teamMemberId routes so that Express
// matches the literal path segment "my-invitations" before the param wildcard.
router.get('/team-members/my-invitations', authenticate, getMyInvitations);

// ─── Remove member (owner) ────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/brands/{id}/branches/{branchId}/team/members/{teamMemberId}/remove:
 *   patch:
 *     tags:
 *       - Team
 *     summary: Remove a team member (owner only). OWNER role is protected.
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
 *       - in: path
 *         name: teamMemberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed
 *       400:
 *         description: Member already removed
 *       403:
 *         description: Not the brand owner, or attempting to remove OWNER
 *       404:
 *         description: Brand, branch, or membership not found
 */
router.patch(
  '/brands/:id/branches/:branchId/team/members/:teamMemberId/remove',
  authenticate,
  removeMember,
);

export default router;
