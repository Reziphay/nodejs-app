import { Router } from 'express';
import {
  requestAssignment,
  approveAssignment,
  rejectAssignment,
  withdrawAssignment,
  listBrandAssignmentRequests,
  listMyAssignedServices,
  listAssignableServices,
} from '../../controllers/team-service-assignment.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router: Router = Router();

// ─── Member-side ──────────────────────────────────────────────────────────────

router.get(
  '/brands/:brandId/assignable-services',
  authenticate,
  listAssignableServices,
);

router.post(
  '/brands/:brandId/services/:serviceId/assignment-request',
  authenticate,
  requestAssignment,
);

router.get('/services/assigned/mine', authenticate, listMyAssignedServices);

// ─── Owner-side ───────────────────────────────────────────────────────────────

router.patch(
  '/team-member-services/:assignmentId/approve',
  authenticate,
  approveAssignment,
);

router.get(
  '/brands/:brandId/service-assignment-requests',
  authenticate,
  listBrandAssignmentRequests,
);

router.patch(
  '/team-member-services/:assignmentId/reject',
  authenticate,
  rejectAssignment,
);

// ─── Either side ──────────────────────────────────────────────────────────────

router.delete(
  '/team-member-services/:assignmentId',
  authenticate,
  withdrawAssignment,
);

export default router;
