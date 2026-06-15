import { z } from 'zod';

// ─── Booking ─────────────────────────────────────────────────────────────────

export const createReservationSchema = z.object({
  service_id: z.string().cuid('Invalid service id'),
  // Omit to let the system pick the first available provider for the service.
  provider_user_id: z.string().cuid('Invalid provider id').nullable().optional(),
  branch_id: z.string().cuid('Invalid branch id').nullable().optional(),
  // ISO-8601 start; end is derived from the service duration server-side.
  starts_at: z.string().datetime('starts_at must be an ISO-8601 datetime'),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

// Reason is optional at the schema level; controllers enforce the ≥20-char rule
// where it applies (cancelling a CONFIRMED reservation, or any USO cancel/reject).
// A UCR withdrawing a still-PENDING request needs no reason.
export const cancelReservationSchema = z.object({
  cancel_reason: z.string().trim().max(1000).optional(),
});

export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;

// Completing a reservation requires the 6-digit confirmation code the UCR holds.
export const completeReservationSchema = z.object({
  confirmation_code: z.string().regex(/^\d{6}$/, 'confirmation_code must be 6 digits'),
});

export type CompleteReservationInput = z.infer<typeof completeReservationSchema>;

// ─── Rating ──────────────────────────────────────────────────────────────────

export const rateUserSchema = z.object({
  value: z.number().int().min(1).max(5),
});

export type RateUserInput = z.infer<typeof rateUserSchema>;

// ─── Availability query ──────────────────────────────────────────────────────

export const availabilityQuerySchema = z.object({
  service_id: z.string().cuid('Invalid service id'),
  provider_user_id: z.string().cuid('Invalid provider id').optional(),
  // Single day to compute slots for, YYYY-MM-DD.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
