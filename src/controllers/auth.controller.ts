import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma';
import { hashPassword, comparePassword } from '../utils/hash';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sendSuccess } from '../utils/response';
import { RegisterInput, LoginInput, RefreshInput } from '../schemas/auth.schema';
import { env } from '../config/env';
import { AppError } from '../middlewares/error.middleware';

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as RegisterInput;

    const existing = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });

    if (existing) {
      const err: AppError = new Error();
      err.statusCode = 409;
      err.messageKey = 'auth.email_already_in_use';
      return next(err);
    }

    const hashed_password = await hashPassword(body.password);

    await prisma.user.create({
      data: {
        first_name: body.first_name,
        last_name: body.last_name,
        birthday: new Date(body.birthday),
        country: body.country,
        email: body.email,
        hashed_password,
        type: body.type,
      },
    });

    sendSuccess({ res, status: 201, message: 'auth.register_success' });
  } catch (err) {
    next(err);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as LoginInput;

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      select: {
        id: true,
        email: true,
        type: true,
        hashed_password: true,
      },
    });

    if (!user) {
      const err: AppError = new Error();
      err.statusCode = 401;
      err.messageKey = 'auth.invalid_credentials';
      return next(err);
    }

    const isValid = await comparePassword(body.password, user.hashed_password);

    if (!isValid) {
      const err: AppError = new Error();
      err.statusCode = 401;
      err.messageKey = 'auth.invalid_credentials';
      return next(err);
    }

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      type: user.type,
    });

    const jti = randomUUID();
    const refreshToken = signRefreshToken({ sub: user.id, jti });

    const days = Number(env.JWT_REFRESH_EXPIRES_IN.replace('d', '')) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        user_id: user.id,
        expires_at: expiresAt,
      },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'auth.login_success',
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const refresh = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { refresh_token } = req.body as RefreshInput;

    let payload: ReturnType<typeof verifyRefreshToken>;
    try {
      payload = verifyRefreshToken(refresh_token);
    } catch {
      const err: AppError = new Error();
      err.statusCode = 401;
      err.messageKey = 'errors.invalid_token';
      return next(err);
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refresh_token },
      select: { id: true, user_id: true, expires_at: true },
    });

    if (!stored || stored.expires_at < new Date()) {
      if (stored) {
        await prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      const err: AppError = new Error();
      err.statusCode = 401;
      err.messageKey = 'errors.invalid_token';
      return next(err);
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, type: true },
    });

    if (!user) {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
      const err: AppError = new Error();
      err.statusCode = 401;
      err.messageKey = 'auth.user_not_found';
      return next(err);
    }

    // Rotate: delete old token, issue new pair
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      type: user.type,
    });

    const jti = randomUUID();
    const newRefreshToken = signRefreshToken({ sub: user.id, jti });

    const days = Number(env.JWT_REFRESH_EXPIRES_IN.replace('d', '')) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        user_id: user.id,
        expires_at: expiresAt,
      },
    });

    sendSuccess({
      res,
      status: 200,
      message: 'auth.refresh_success',
      data: {
        access_token: accessToken,
        refresh_token: newRefreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const me = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        birthday: true,
        phone: true,
        country: true,
        country_prefix: true,
        email: true,
        type: true,
        phone_verified: true,
        email_verified: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      const err: AppError = new Error();
      err.statusCode = 404;
      err.messageKey = 'auth.user_not_found';
      return next(err);
    }

    sendSuccess({ res, status: 200, message: 'auth.me_success', data: { user } });
  } catch (err) {
    next(err);
  }
};
