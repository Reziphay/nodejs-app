import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma';
import { hashPassword, comparePassword } from '../utils/hash';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { RegisterInput, LoginInput } from '../schemas/auth.schema';
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
        first_name: true,
        last_name: true,
        email: true,
        type: true,
        email_verified: true,
        created_at: true,
      },
    });

    res.status(201).json({
      success: true,
      data: { user },
    });
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
        first_name: true,
        last_name: true,
        email_verified: true,
      },
    });

    if (!user) {
      const err: AppError = new Error('Invalid email or password');
      err.statusCode = 401;
      return next(err);
    }

    const isValid = await comparePassword(body.password, user.hashed_password);

    if (!isValid) {
      const err: AppError = new Error('Invalid email or password');
      err.statusCode = 401;
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

    const { hashed_password: _, ...safeUser } = user;

    res.status(200).json({
      success: true,
      data: {
        user: safeUser,
        access_token: accessToken,
        refresh_token: refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
};
