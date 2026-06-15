import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import { emitNotification } from '../lib/notifications';
import { computeSlots } from '../services/availability.service';
import {
  availabilityQuerySchema,
  type CreateReservationInput,
  type CancelReservationInput,
} from '../schemas/reservation.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fail(next: NextFunction, statusCode: number, messageKey: string): false {
  const err: AppError = new Error();
  err.statusCode = statusCode;
  err.messageKey = messageKey;
  next(err);
  return false;
}

/**
 * Users eligible to provide a service: the owner plus team members with an
 * ACCEPTED assignment for that service.
 */
async function getEligibleProviderIds(serviceId: string): Promise<string[]> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { owner_id: true },
  });
  if (!service) return [];

  const assignments = await prisma.teamMemberServiceAssignment.findMany({
    where: { service_id: serviceId, status: 'ACCEPTED' },
    select: { team_member: { select: { user_id: true } } },
  });

  const ids = new Set<string>([service.owner_id]);
  for (const a of assignments) ids.add(a.team_member.user_id);
  return [...ids];
}

// ─── Availability ──────────────────────────────────────────────────────────────

export const getAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = availabilityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return void fail(next, 400, 'errors.validation_error');
    }
    const { service_id, provider_user_id, date } = parsed.data;

    const eligible = await getEligibleProviderIds(service_id);
    if (eligible.length === 0) return void fail(next, 404, 'reservation.service_not_found');

    // Single provider requested, or aggregate across all eligible providers.
    const providers = provider_user_id
      ? eligible.includes(provider_user_id)
        ? [provider_user_id]
        : []
      : eligible;

    if (providers.length === 0) return void fail(next, 400, 'reservation.provider_not_eligible');

    const perProvider = await Promise.all(
      providers.map(async (pid) => ({
        provider_user_id: pid,
        slots: await computeSlots({ serviceId: service_id, providerUserId: pid, date }),
      })),
    );

    sendSuccess({
      res,
      status: 200,
      message: 'reservation.availability_ok',
      data: { date, providers: perProvider },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Create (UCR books) ─────────────────────────────────────────────────────────

export const createReservation = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (req.user.type !== 'ucr') return void fail(next, 403, 'errors.forbidden');

    const body = req.body as CreateReservationInput;

    const service = await prisma.service.findUnique({
      where: { id: body.service_id },
      select: { id: true, duration: true, price: true, status: true, title: true, brand: { select: { status: true } } },
    });
    if (!service) return void fail(next, 404, 'reservation.service_not_found');
    if (service.status !== 'ACTIVE') return void fail(next, 400, 'reservation.service_not_active');
    if (service.brand && service.brand.status !== 'ACTIVE')
      return void fail(next, 400, 'reservation.service_not_active');
    if (!service.duration || service.duration <= 0)
      return void fail(next, 400, 'reservation.service_no_duration');

    const eligible = await getEligibleProviderIds(service.id);
    const startsAt = new Date(body.starts_at);
    const dateStr = startsAt.toISOString().slice(0, 10);

    // Resolve the provider: explicit choice, else first eligible whose slot is free.
    let providerId: string | null = null;
    if (body.provider_user_id) {
      if (!eligible.includes(body.provider_user_id))
        return void fail(next, 400, 'reservation.provider_not_eligible');
      providerId = body.provider_user_id;
    } else {
      for (const pid of eligible) {
        const slots = await computeSlots({ serviceId: service.id, providerUserId: pid, date: dateStr });
        if (slots.some((s) => s.starts_at === startsAt.toISOString())) {
          providerId = pid;
          break;
        }
      }
      if (!providerId) return void fail(next, 409, 'reservation.no_provider_available');
    }

    // Validate the requested slot is actually offered for the chosen provider.
    const slots = await computeSlots({ serviceId: service.id, providerUserId: providerId, date: dateStr });
    const slot = slots.find((s) => s.starts_at === startsAt.toISOString());
    if (!slot) return void fail(next, 409, 'reservation.slot_unavailable');

    try {
      const reservation = await prisma.reservation.create({
        data: {
          service_id: service.id,
          provider_user_id: providerId,
          ucr_id: req.user.sub,
          branch_id: body.branch_id ?? null,
          starts_at: new Date(slot.starts_at),
          ends_at: new Date(slot.ends_at),
          status: 'PENDING',
          price_snapshot: service.price ?? null,
        },
      });

      await emitNotification({
        user_id: providerId,
        type: 'reservation_requested',
        data: {
          reservation_id: reservation.id,
          service_id: service.id,
          service_title: service.title,
          starts_at: reservation.starts_at.toISOString(),
        },
        fallback_title: 'New reservation request',
        fallback_body: `New reservation request for "${service.title}".`,
      });

      sendSuccess({ res, status: 201, message: 'reservation.created', data: reservation });
    } catch (e: unknown) {
      // Unique(provider_user_id, starts_at) violation → slot taken concurrently.
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
        return void fail(next, 409, 'reservation.slot_taken');
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
};

// ─── Listing ────────────────────────────────────────────────────────────────────

export const listMyReservations = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // role=customer → bookings I made; role=provider → bookings assigned to me.
    const role = req.query['role'] === 'provider' ? 'provider' : 'customer';
    const where =
      role === 'provider'
        ? { provider_user_id: req.user.sub }
        : { ucr_id: req.user.sub };

    const reservations = await prisma.reservation.findMany({
      where,
      orderBy: { starts_at: 'desc' },
      take: 100,
      include: {
        service: { select: { id: true, title: true, duration: true } },
        provider: { select: { id: true, first_name: true, last_name: true } },
        ucr: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    sendSuccess({ res, status: 200, message: 'reservation.list_ok', data: reservations });
  } catch (err) {
    next(err);
  }
};

export const getReservationById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: req.params['id'] as string },
      include: {
        service: { select: { id: true, title: true, duration: true } },
        provider: { select: { id: true, first_name: true, last_name: true } },
        ucr: { select: { id: true, first_name: true, last_name: true } },
      },
    });
    if (!reservation) return void fail(next, 404, 'reservation.not_found');
    if (reservation.ucr_id !== req.user.sub && reservation.provider_user_id !== req.user.sub)
      return void fail(next, 403, 'errors.forbidden');

    sendSuccess({ res, status: 200, message: 'reservation.get_ok', data: reservation });
  } catch (err) {
    next(err);
  }
};

// ─── Status transitions ─────────────────────────────────────────────────────────

type Loaded = NonNullable<Awaited<ReturnType<typeof prisma.reservation.findUnique>>>;

async function loadOwned(
  id: string,
  next: NextFunction,
): Promise<Loaded | null> {
  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (!reservation) {
    fail(next, 404, 'reservation.not_found');
    return null;
  }
  return reservation;
}

// USO accepts a pending request.
export const confirmReservation = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const r = await loadOwned(req.params['id'] as string, next);
    if (!r) return;
    if (r.provider_user_id !== req.user.sub) return void fail(next, 403, 'errors.forbidden');
    if (r.status !== 'PENDING') return void fail(next, 400, 'reservation.invalid_transition');

    const updated = await prisma.reservation.update({
      where: { id: r.id },
      data: { status: 'CONFIRMED', responded_at: new Date() },
    });
    await emitNotification({
      user_id: r.ucr_id,
      type: 'reservation_confirmed',
      data: { reservation_id: r.id, service_id: r.service_id, starts_at: r.starts_at.toISOString() },
      fallback_title: 'Reservation confirmed',
    });
    sendSuccess({ res, status: 200, message: 'reservation.confirmed', data: updated });
  } catch (err) {
    next(err);
  }
};

// UCR cancels their own reservation.
export const cancelByUcr = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const r = await loadOwned(req.params['id'] as string, next);
    if (!r) return;
    if (r.ucr_id !== req.user.sub) return void fail(next, 403, 'errors.forbidden');
    if (r.status !== 'PENDING' && r.status !== 'CONFIRMED')
      return void fail(next, 400, 'reservation.invalid_transition');

    const body = req.body as CancelReservationInput;
    const updated = await prisma.reservation.update({
      where: { id: r.id },
      data: { status: 'CANCELLED_BY_UCR', cancel_reason: body.cancel_reason ?? null },
    });
    await emitNotification({
      user_id: r.provider_user_id,
      type: 'reservation_cancelled_by_ucr',
      data: { reservation_id: r.id, service_id: r.service_id, starts_at: r.starts_at.toISOString() },
      fallback_title: 'Reservation cancelled',
    });
    sendSuccess({ res, status: 200, message: 'reservation.cancelled', data: updated });
  } catch (err) {
    next(err);
  }
};

// USO cancels/rejects (pending reject or confirmed cancel).
export const cancelByUso = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const r = await loadOwned(req.params['id'] as string, next);
    if (!r) return;
    if (r.provider_user_id !== req.user.sub) return void fail(next, 403, 'errors.forbidden');
    if (r.status !== 'PENDING' && r.status !== 'CONFIRMED')
      return void fail(next, 400, 'reservation.invalid_transition');

    const body = req.body as CancelReservationInput;
    const updated = await prisma.reservation.update({
      where: { id: r.id },
      data: { status: 'CANCELLED_BY_USO', cancel_reason: body.cancel_reason ?? null, responded_at: new Date() },
    });
    await emitNotification({
      user_id: r.ucr_id,
      type: 'reservation_cancelled_by_uso',
      data: { reservation_id: r.id, service_id: r.service_id, starts_at: r.starts_at.toISOString() },
      fallback_title: 'Reservation cancelled by provider',
    });
    sendSuccess({ res, status: 200, message: 'reservation.cancelled', data: updated });
  } catch (err) {
    next(err);
  }
};

// USO marks a confirmed reservation completed → opens the rating gate for UCR.
export const completeReservation = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const r = await loadOwned(req.params['id'] as string, next);
    if (!r) return;
    if (r.provider_user_id !== req.user.sub) return void fail(next, 403, 'errors.forbidden');
    if (r.status !== 'CONFIRMED') return void fail(next, 400, 'reservation.invalid_transition');

    const updated = await prisma.reservation.update({
      where: { id: r.id },
      data: { status: 'COMPLETED' },
    });
    await emitNotification({
      user_id: r.ucr_id,
      type: 'reservation_completed',
      data: { reservation_id: r.id, service_id: r.service_id },
      fallback_title: 'Reservation completed',
    });
    sendSuccess({ res, status: 200, message: 'reservation.completed', data: updated });
  } catch (err) {
    next(err);
  }
};

// USO marks a no-show.
export const markNoShow = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const r = await loadOwned(req.params['id'] as string, next);
    if (!r) return;
    if (r.provider_user_id !== req.user.sub) return void fail(next, 403, 'errors.forbidden');
    if (r.status !== 'CONFIRMED') return void fail(next, 400, 'reservation.invalid_transition');

    const updated = await prisma.reservation.update({
      where: { id: r.id },
      data: { status: 'NO_SHOW' },
    });
    sendSuccess({ res, status: 200, message: 'reservation.no_show', data: updated });
  } catch (err) {
    next(err);
  }
};
