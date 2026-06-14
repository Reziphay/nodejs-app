import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { AppError } from '../middlewares/error.middleware';
import type { SetProviderDayOffInput } from '../schemas/reservation.schema';

function forbidNonUso(req: Request, next: NextFunction): boolean {
  if (req.user.type !== 'uso') {
    const err: AppError = new Error();
    err.statusCode = 403;
    err.messageKey = 'errors.forbidden';
    next(err);
    return false;
  }
  return true;
}

// GET the caller's day-offs (vacations). Working hours live per-service.
export const getMyAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const dayoffs = await prisma.providerDayOff.findMany({
      where: { provider_user_id: req.user.sub },
      orderBy: { date: 'asc' },
    });
    sendSuccess({ res, status: 200, message: 'reservation.availability_ok', data: { dayoffs } });
  } catch (err) {
    next(err);
  }
};

// Replace the caller's full day-off list.
export const setMyDayOffs = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!forbidNonUso(req, next)) return;
    const body = req.body as SetProviderDayOffInput;

    await prisma.$transaction([
      prisma.providerDayOff.deleteMany({ where: { provider_user_id: req.user.sub } }),
      prisma.providerDayOff.createMany({
        data: body.dates.map((d) => ({
          provider_user_id: req.user.sub,
          date: new Date(`${d}T00:00:00.000Z`),
        })),
        skipDuplicates: true,
      }),
    ]);

    const dayoffs = await prisma.providerDayOff.findMany({
      where: { provider_user_id: req.user.sub },
      orderBy: { date: 'asc' },
    });
    sendSuccess({ res, status: 200, message: 'reservation.dayoffs_saved', data: dayoffs });
  } catch (err) {
    next(err);
  }
};
