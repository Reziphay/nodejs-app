import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess } from '../utils/response';
import { buildFileUrl } from '../services/storage.service';
import { getRestrictionState } from '../services/auth/auth-policy.service';
import {
  registerUser,
  loginUser,
  completeTwoFactorLogin,
  refreshUserSession,
  resendEmailVerification,
  verifyEmailAddress,
  requestPhoneVerification,
  verifyPhoneNumber,
  forgotPassword,
  resetPassword,
  beginTwoFactorEnrollment,
  confirmTwoFactorEnrollment,
  disableTwoFactor,
  createStepUpChallenge,
} from '../services/auth/auth.service';
import type {
  RegisterInput,
  LoginInput,
  RefreshInput,
  VerifyEmailInput,
  VerifyPhoneInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  CompleteTwoFactorLoginInput,
  ConfirmTwoFactorInput,
  CreateStepUpInput,
} from '../schemas/auth.schema';

const resolveAvatarUrl = (storagePath: string | null | undefined): string | null =>
  storagePath ? buildFileUrl(storagePath) : null;

const meSelect = {
  id: true,
  first_name: true,
  last_name: true,
  birthday: true,
  phone: true,
  country: true,
  email: true,
  type: true,
  phone_verified: true,
  email_verified: true,
  two_factor_enabled_at: true,
  avatar_media: { select: { storage_path: true } },
  created_at: true,
  updated_at: true,
} as const;

const getVerificationToken = (req: Request): string => {
  const queryToken = req.query['token'];

  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken;
  }

  const body = req.body as Partial<VerifyEmailInput>;
  return body.token ?? '';
};

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as RegisterInput;

    const result = await registerUser({
      ...body,
      phone: body.phone ?? null,
      remoteIp: req.ip,
    });

    sendSuccess({
      res,
      status: 201,
      message: 'auth.register_success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as LoginInput;
    const result = await loginUser({
      ...body,
      remoteIp: req.ip,
    });

    sendSuccess({
      res,
      status: 200,
      message: result.requires_two_factor
        ? 'auth.two_factor_challenge_required'
        : 'auth.login_success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const completeLoginTwoFactor = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as CompleteTwoFactorLoginInput;
    const result = await completeTwoFactorLogin(body);

    sendSuccess({
      res,
      status: 200,
      message: 'auth.login_success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { refresh_token } = req.body as RefreshInput;
    const result = await refreshUserSession(refresh_token);

    sendSuccess({
      res,
      status: 200,
      message: 'auth.refresh_success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: meSelect,
    });

    if (!user) {
      const error = new Error() as Error & { statusCode?: number; messageKey?: string };
      error.statusCode = 404;
      error.messageKey = 'auth.user_not_found';
      return next(error);
    }

    const { avatar_media, two_factor_enabled_at, ...rest } = user;

    sendSuccess({
      res,
      status: 200,
      message: 'auth.me_success',
      data: {
        user: {
          ...rest,
          avatar_url: resolveAvatarUrl(avatar_media?.storage_path),
          two_factor_enabled: Boolean(two_factor_enabled_at),
        },
        restriction_state: getRestrictionState(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const resendVerificationEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await resendEmailVerification(req.user.sub);

    sendSuccess({
      res,
      status: 200,
      message: 'auth.email_verification_sent',
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await verifyEmailAddress(getVerificationToken(req));

    sendSuccess({
      res,
      status: 200,
      message: 'auth.email_verified',
    });
  } catch (error) {
    next(error);
  }
};

export const requestPhoneOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await requestPhoneVerification(req.user.sub);

    sendSuccess({
      res,
      status: 200,
      message: 'auth.phone_verification_sent',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyPhoneOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as VerifyPhoneInput;

    await verifyPhoneNumber({
      userId: req.user.sub,
      ...body,
    });

    sendSuccess({
      res,
      status: 200,
      message: 'auth.phone_verified',
    });
  } catch (error) {
    next(error);
  }
};

export const requestPasswordReset = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as ForgotPasswordInput;
    await forgotPassword(body.email);

    sendSuccess({
      res,
      status: 200,
      message: 'auth.password_reset_requested',
    });
  } catch (error) {
    next(error);
  }
};

export const completePasswordReset = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as ResetPasswordInput;
    await resetPassword(body);

    sendSuccess({
      res,
      status: 200,
      message: 'auth.password_reset_success',
    });
  } catch (error) {
    next(error);
  }
};

export const startTwoFactorEnrollment = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await beginTwoFactorEnrollment(req.user.sub);

    sendSuccess({
      res,
      status: 200,
      message: 'auth.two_factor_setup_started',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const confirmTwoFactorSetup = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as ConfirmTwoFactorInput;
    await confirmTwoFactorEnrollment({
      userId: req.user.sub,
      code: body.code,
    });

    sendSuccess({
      res,
      status: 200,
      message: 'auth.two_factor_enabled',
    });
  } catch (error) {
    next(error);
  }
};

export const turnOffTwoFactor = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as ConfirmTwoFactorInput;
    await disableTwoFactor({
      userId: req.user.sub,
      code: body.code,
    });

    sendSuccess({
      res,
      status: 200,
      message: 'auth.two_factor_disabled',
    });
  } catch (error) {
    next(error);
  }
};

export const createStepUp = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = req.body as CreateStepUpInput;
    const result = await createStepUpChallenge({
      userId: req.user.sub,
      purpose: body.purpose,
      password: body.password,
      two_factor_code: body.two_factor_code,
      target: body.target,
    });

    sendSuccess({
      res,
      status: 200,
      message: 'auth.step_up_ready',
      data: {
        step_up_token: result.token,
        expires_at: result.expires_at,
        purpose: body.purpose,
      },
    });
  } catch (error) {
    next(error);
  }
};
