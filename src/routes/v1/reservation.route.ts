import { Router } from 'express';
import {
  getAvailability,
  createReservation,
  listMyReservations,
  getReservationById,
  confirmReservation,
  cancelByUcr,
  cancelByUso,
  completeReservation,
  markNoShow,
} from '../../controllers/reservation.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  createReservationSchema,
  cancelReservationSchema,
} from '../../schemas/reservation.schema';

const router: Router = Router();

// ─── Public slot availability ────────────────────────────────────────────────
router.get('/availability', authenticate, getAvailability);

// ─── Reservations ────────────────────────────────────────────────────────────
router.get('/reservations/mine', authenticate, listMyReservations);
router.post('/reservations', authenticate, validate(createReservationSchema), createReservation);
router.get('/reservations/:id', authenticate, getReservationById);

// status transitions
router.post('/reservations/:id/confirm', authenticate, confirmReservation);
router.post('/reservations/:id/cancel', authenticate, validate(cancelReservationSchema), cancelByUcr);
router.post('/reservations/:id/reject', authenticate, validate(cancelReservationSchema), cancelByUso);
router.post('/reservations/:id/complete', authenticate, completeReservation);
router.post('/reservations/:id/no-show', authenticate, markNoShow);

export default router;
