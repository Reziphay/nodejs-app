import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import type { ApproveInput, RejectInput } from '../schemas/moderation.schema';
import { listQueueSchema } from '../schemas/moderation.schema';
import * as moderationService from '../services/moderation.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, next: NextFunction): boolean {
  if (req.user.type !== 'admin') {
    const err: AppError = new Error();
    err.statusCode = 403;
    err.messageKey = 'errors.forbidden';
    next(err);
    return false;
  }
  return true;
}

// ─── Queue ────────────────────────────────────────────────────────────────────

/**
 * GET /admin/queue
 * Returns pending brands and/or services awaiting moderation.
 * Optional ?type=brand|service to filter by entity type.
 */
export const listQueue = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireAdmin(req, next)) return;

    const parsed = listQueueSchema.safeParse(req.query);
    if (!parsed.success) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'errors.validation_error';
      return next(err);
    }
    const type = parsed.data.type;

    const queue = await moderationService.getModerationQueue(type);

    sendSuccess({ res, status: 200, message: 'moderation.queue', data: queue });
  } catch (err) {
    next(err);
  }
};

// ─── Brand detail ─────────────────────────────────────────────────────────────

/**
 * GET /admin/brands/:id
 * Full brand detail for admin review.
 */
export const getBrandDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireAdmin(req, next)) return;

    const id = req.params['id'] as string;
    const brand = await moderationService.getBrandModerationDetail(id);

    if (!brand) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }

    sendSuccess({ res, status: 200, message: 'brand.found', data: { brand } });
  } catch (err) {
    next(err);
  }
};

// ─── Service detail ───────────────────────────────────────────────────────────

/**
 * GET /admin/services/:id
 * Full service detail for admin review.
 */
export const getServiceDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireAdmin(req, next)) return;

    const id = req.params['id'] as string;
    const service = await moderationService.getServiceModerationDetail(id);

    if (!service) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    sendSuccess({ res, status: 200, message: 'service.found', data: { service } });
  } catch (err) {
    next(err);
  }
};

// ─── Brand approve / reject ───────────────────────────────────────────────────

/**
 * POST /admin/brands/:id/approve
 * Approve a pending brand. Body: { checklist? }
 */
export const approveBrand = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireAdmin(req, next)) return;

    const id = req.params['id'] as string;
    const body = req.body as ApproveInput;

    const result = await moderationService.approveBrand(id, req.user.sub, body.checklist);

    if ('notFound' in result) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }

    if ('wrongStatus' in result) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'brand.cannot_approve_in_current_status';
      return next(err);
    }

    sendSuccess({ res, status: 200, message: 'brand.approved' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/brands/:id/reject
 * Reject a pending brand. Body: { rejection_reason, checklist? }
 */
export const rejectBrand = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireAdmin(req, next)) return;

    const id = req.params['id'] as string;
    const body = req.body as RejectInput;

    const result = await moderationService.rejectBrand(
      id,
      req.user.sub,
      body.rejection_reason,
      body.checklist,
    );

    if ('notFound' in result) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'brand.not_found';
      return next(err);
    }

    if ('wrongStatus' in result) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'brand.cannot_reject_in_current_status';
      return next(err);
    }

    sendSuccess({ res, status: 200, message: 'brand.rejected' });
  } catch (err) {
    next(err);
  }
};

// ─── Service approve / reject ─────────────────────────────────────────────────

/**
 * POST /admin/services/:id/approve
 * Approve a pending service. Body: { checklist? }
 */
export const approveService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireAdmin(req, next)) return;

    const id = req.params['id'] as string;
    const body = req.body as ApproveInput;

    const result = await moderationService.approveService(id, req.user.sub, body.checklist);

    if ('notFound' in result) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    if ('wrongStatus' in result) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.cannot_approve_in_current_status';
      return next(err);
    }

    if ('inactiveBrand' in result) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.cannot_approve_inactive_brand';
      return next(err);
    }

    sendSuccess({ res, status: 200, message: 'service.approved' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /admin/services/:id/reject
 * Reject a pending service. Body: { rejection_reason, checklist? }
 */
export const rejectService = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!requireAdmin(req, next)) return;

    const id = req.params['id'] as string;
    const body = req.body as RejectInput;

    const result = await moderationService.rejectService(
      id,
      req.user.sub,
      body.rejection_reason,
      body.checklist,
    );

    if ('notFound' in result) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'service.not_found';
      return next(err);
    }

    if ('wrongStatus' in result) {
      const err: AppError = new Error();
      err.statusCode = 400;
      err.messageKey = 'service.cannot_reject_in_current_status';
      return next(err);
    }

    sendSuccess({ res, status: 200, message: 'service.rejected' });
  } catch (err) {
    next(err);
  }
};
