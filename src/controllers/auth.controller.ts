import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma';
import { hashPassword } from '../utils/hash';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { RegisterInput } from '../schemas/auth.schema';
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
      const err: AppError = new Error('Email already in use');
      err.statusCode = 409;
      return next(err);
    }

    const hashed_password = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        first_name: body.first_name,
        last_name: body.last_name,
        birthday: new Date(body.birthday),
        country: body.country,
        email: body.email,
        hashed_password,
        type: body.type,
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        type: true,
        email_verified: true,
        created_at: true,
      },
    });

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      type: user.type,
    });

    const jti = randomUUID();
    const refreshToken = signRefreshToken({ sub: user.id, jti });

    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() +
        Number(env.JWT_REFRESH_EXPIRES_IN.replace('d', '') || 7),
    );

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        user_id: user.id,
        expires_at: expiresAt,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        user,
        access_token: accessToken,
        refresh_token: refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
};
