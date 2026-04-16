import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import { buildFeed } from '../services/notification-feed.service';
import { NotificationFeedSourceType } from '../generated/prisma/client';

// ─── Notification Feed ────────────────────────────────────────────────────────

const VALID_SOURCE_TYPES = new Set<NotificationFeedSourceType>([
  'notification',
  'team_invitation',
  'incoming_transfer',
  'outgoing_transfer',
]);

/**
 * GET /notifications/feed
 * Returns the unified notification feed for the authenticated user.
 * Applies cleared_before watermark and per-item dismissal filters.
 */
export const getFeed = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.sub;
    const result = await buildFeed(userId);

    sendSuccess({
      res,
      status: 200,
      message: 'notification.feed',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /notifications/feed/items/:sourceType/:sourceId
 * Dismisses a single feed item for the authenticated user (visibility only).
 * Does NOT reject invitations, cancel transfers, or delete notifications.
 */
export const dismissFeedItem = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.sub;
    const sourceType = req.params['sourceType'] as string;
    const sourceId = req.params['sourceId'] as string;

    if (!VALID_SOURCE_TYPES.has(sourceType as NotificationFeedSourceType)) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'notification.invalid_source_type';
      return next(err);
    }

    // Upsert — calling dismiss twice is idempotent
    await prisma.notificationFeedDismissal.upsert({
      where: {
        user_id_source_type_source_id: {
          user_id: userId,
          source_type: sourceType as NotificationFeedSourceType,
          source_id: sourceId,
        },
      },
      create: {
        user_id: userId,
        source_type: sourceType as NotificationFeedSourceType,
        source_id: sourceId,
      },
      update: { dismissed_at: new Date() },
    });

    sendSuccess({ res, status: 200, message: 'notification.dismissed' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /notifications/feed/clear
 * Sets cleared_before = now() so all current feed items are hidden.
 * Future items (created after this timestamp) will still appear.
 * Does NOT delete any business records.
 */
export const clearFeed = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.sub;
    const now = new Date();

    await prisma.notificationFeedState.upsert({
      where: { user_id: userId },
      create: { user_id: userId, cleared_before: now },
      update: { cleared_before: now },
    });

    sendSuccess({ res, status: 200, message: 'notification.feed_cleared' });
  } catch (err) {
    next(err);
  }
};

// ─── Legacy notification endpoints ───────────────────────────────────────────

/**
 * GET /notifications
 * Returns the 50 most-recent notifications for the authenticated user.
 */
export const listNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.sub;

    const notifications = await prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    sendSuccess({
      res,
      status: 200,
      message: 'notification.list',
      data: {
        notifications: notifications.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          data: n.data,
          read: n.read,
          created_at: n.created_at.toISOString(),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /notifications/:id/read
 * Marks a single notification as read (owner only).
 */
export const markNotificationRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.sub;
    const id = req.params['id'] as string;

    const notification = await prisma.notification.findUnique({
      where: { id },
      select: { user_id: true },
    });

    if (!notification || notification.user_id !== userId) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'notification.not_found';
      return next(err);
    }

    await prisma.notification.update({ where: { id }, data: { read: true } });

    sendSuccess({ res, status: 200, message: 'notification.marked_read' });
  } catch (err) {
    next(err);
  }
};
