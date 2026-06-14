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

export const cancelReservationSchema = z.object({
  cancel_reason: z.string().max(1000).trim().optional(),
});

export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;

// ─── Availability query ──────────────────────────────────────────────────────

export const availabilityQuerySchema = z.object({
  service_id: z.string().cuid('Invalid service id'),
  provider_user_id: z.string().cuid('Invalid provider id').optional(),
  // Single day to compute slots for, YYYY-MM-DD.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;

// ─── Provider day-off management ─────────────────────────────────────────────

export const setProviderDayOffSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')).max(60),
});

export type SetProviderDayOffInput = z.infer<typeof setProviderDayOffSchema>;
