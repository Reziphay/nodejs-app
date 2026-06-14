/**
 * Notification helper.
 *
 * Persists a Notification row whose `type` + structured `data` are the source of
 * truth. The frontend localizes the message from `type` (an i18n key) and
 * interpolates `data`. `title`/`body` are kept only as a non-localized fallback
 * for older clients — never rely on them for display.
 */

import prisma from './prisma';
import type { Prisma } from '../generated/prisma/client';

export type NotificationType =
  // reservation domain
  | 'reservation_requested'
  | 'reservation_confirmed'
  | 'reservation_cancelled_by_ucr'
  | 'reservation_cancelled_by_uso'
  | 'reservation_completed'
  | 'reservation_no_show'
  | 'reservation_reminder';

interface EmitNotificationArgs {
  user_id: string;
  type: NotificationType;
  /** Structured payload the client uses to build & localize the message. */
  data: Record<string, unknown>;
  /** Non-localized fallback subject. */
  fallback_title?: string;
  /** Non-localized fallback body. */
  fallback_body?: string;
}

/**
 * Create a single persistent notification. Accepts an optional Prisma
 * transaction client so emission can join an atomic reservation mutation.
 */
export async function emitNotification(
  args: EmitNotificationArgs,
  tx: Pick<typeof prisma, 'notification'> = prisma,
): Promise<void> {
  await tx.notification.create({
    data: {
      user_id: args.user_id,
      type: args.type,
      title: args.fallback_title ?? args.type,
      body: args.fallback_body ?? '',
      data: args.data as Prisma.InputJsonValue,
    },
  });
}
