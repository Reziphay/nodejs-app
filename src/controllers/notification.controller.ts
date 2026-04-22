import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';

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
