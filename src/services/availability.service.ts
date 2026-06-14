/**
 * Availability service.
 *
 * Computes bookable time slots for a (service, provider, date) triple.
 *
 * Working windows come from the service's configured hours:
 *   - hours_source = CUSTOM → the service's ServiceSchedule rows for that weekday.
 *   - hours_source = BRANCH → the linked branch's opening hours minus breaks
 *     (stored as "HH:MM" strings, parsed here; skipped when the branch is 24/7).
 *
 * Then we subtract:
 *   - the provider's existing PENDING/CONFIRMED reservations across ALL their
 *     services (padded by the service buffer on both sides), so one provider is
 *     never double-booked,
 *   - fully blocked ProviderDayOff dates.
 *
 * Time handling: wall-clock minutes-of-day are treated as UTC for the given
 * calendar date (Azerbaijan has no DST). A slot at 13:00 on 2026-06-20 becomes
 * 2026-06-20T13:00:00.000Z. Reservations are stored the same way, so all
 * comparisons are consistent.
 */

import prisma from '../lib/prisma';
import { ReservationStatus } from '../generated/prisma/enums';

export interface Slot {
  /** ISO-8601 start, e.g. "2026-06-20T13:00:00.000Z" */
  starts_at: string;
  /** ISO-8601 end */
  ends_at: string;
}

interface Interval {
  start: number; // minutes from midnight
  end: number;
}

const ACTIVE_STATUSES: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
];

// Fallback hours for legacy services that have no schedule configured at all.
const DEFAULT_START_MIN = 9 * 60; // 09:00
const DEFAULT_END_MIN = 18 * 60; // 18:00

/** Parse "HH:MM" → minutes from midnight. Returns null when malformed. */
function parseHHMM(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Subtract a set of intervals from a base interval, returning the remainder. */
function subtractIntervals(base: Interval, blocks: Interval[]): Interval[] {
  let free: Interval[] = [base];
  for (const block of blocks) {
    const next: Interval[] = [];
    for (const f of free) {
      if (block.end <= f.start || block.start >= f.end) {
        next.push(f);
        continue;
      }
      if (block.start > f.start) next.push({ start: f.start, end: block.start });
      if (block.end < f.end) next.push({ start: block.end, end: f.end });
    }
    free = next;
  }
  return free.filter((i) => i.end > i.start);
}

function toIso(date: string, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
}

/** Minutes-of-day for a stored reservation Date. */
function reservationMinutes(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

interface ComputeArgs {
  serviceId: string;
  providerUserId: string;
  /** YYYY-MM-DD */
  date: string;
}

export async function computeSlots(args: ComputeArgs): Promise<Slot[]> {
  const { serviceId, providerUserId, date } = args;

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      duration: true,
      buffer_min: true,
      status: true,
      hours_source: true,
      branch_id: true,
      schedules: { select: { weekday: true, start_min: true, end_min: true } },
    },
  });
  if (!service || service.status !== 'ACTIVE') return [];

  const duration = service.duration ?? 0;
  if (duration <= 0) return [];
  const buffer = service.buffer_min ?? 0;

  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const dayStart = new Date(`${date}T00:00:00.000Z`);

  const [branch, reservations] = await Promise.all([
    service.hours_source === 'BRANCH' && service.branch_id
      ? prisma.branch.findUnique({
          where: { id: service.branch_id },
          select: { is_24_7: true, opening: true, closing: true, breaks: { select: { start: true, end: true } } },
        })
      : Promise.resolve(null),
    prisma.reservation.findMany({
      where: {
        provider_user_id: providerUserId,
        status: { in: ACTIVE_STATUSES },
        starts_at: { gte: dayStart, lt: new Date(`${date}T23:59:59.999Z`) },
      },
      select: { starts_at: true, ends_at: true },
    }),
  ]);

  // Derive working windows for this weekday from the service's hours.
  let windows: Interval[] = [];
  if (service.hours_source === 'BRANCH') {
    if (branch && !branch.is_24_7) {
      const open = parseHHMM(branch.opening);
      const close = parseHHMM(branch.closing);
      if (open === null || close === null || close <= open) return [];
      const breaks = branch.breaks
        .map((b) => ({ start: parseHHMM(b.start), end: parseHHMM(b.end) }))
        .filter((b): b is Interval => b.start !== null && b.end !== null && b.end > b.start);
      windows = subtractIntervals({ start: open, end: close }, breaks);
    } else if (branch) {
      windows = [{ start: 0, end: 24 * 60 }]; // 24/7
    }
  } else {
    // CUSTOM
    if (service.schedules.length === 0) {
      windows = [{ start: DEFAULT_START_MIN, end: DEFAULT_END_MIN }]; // legacy fallback
    } else {
      windows = service.schedules
        .filter((s) => s.weekday === weekday)
        .map((s) => ({ start: s.start_min, end: s.end_min }));
    }
  }
  if (windows.length === 0) return [];

  // Subtract existing reservations, padded by buffer on both sides.
  const busy: Interval[] = reservations.map((r) => ({
    start: reservationMinutes(r.starts_at) - buffer,
    end: reservationMinutes(r.ends_at) + buffer,
  }));
  const freeWindows = windows.flatMap((w) => subtractIntervals(w, busy));

  // Generate non-overlapping slots of `duration` (step = duration + buffer).
  const step = duration + buffer;
  const nowMin =
    new Date().toISOString().slice(0, 10) === date
      ? new Date().getUTCHours() * 60 + new Date().getUTCMinutes()
      : -1;

  const slots: Slot[] = [];
  for (const w of freeWindows) {
    let cursor = w.start;
    while (cursor + duration <= w.end) {
      if (cursor > nowMin) {
        slots.push({ starts_at: toIso(date, cursor), ends_at: toIso(date, cursor + duration) });
      }
      cursor += step;
    }
  }
  return slots;
}
