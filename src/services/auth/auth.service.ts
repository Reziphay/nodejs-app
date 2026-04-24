import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma';
import { env } from '../../config/env';
import { comparePassword, hashPassword } from '../../utils/hash';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { buildFileUrl } from '../storage.service';
import { validateRecaptcha } from './recaptcha.service';
import { getRestrictionState } from './auth-policy.service';
import {
  STEP_UP_PURPOSES,
  consumeEmailVerificationChallenge,
  consumePasswordResetChallenge,
  consumeStepUpToken,
  consumeTwoFactorLoginChallenge,
  issueEmailVerificationChallenge,
  issuePasswordResetChallenge,
  issuePhoneVerificationChallenge,
  issueStepUpToken,
  issueTwoFactorLoginChallenge,
  verifyPhoneVerificationChallenge,
  type StepUpPurpose,
} from './auth-challenge.service';
import {
  sendEmailVerificationLink,
  sendPasswordResetLink,
  sendPhoneVerificationOtp,
} from './delivery.service';
import {
  buildOtpAuthUrl,
  generateTotpSecret,
  verifyTotpCode,
} from './totp.service';

const REZIPHAY_ISSUER = 'Reziphay';

interface AppErrorLike extends Error {
  statusCode?: number;
  messageKey?: string;
  details?: unknown;
}

interface SessionUser {
  id: string;
  email: string;
  type: string;
  email_verified: boolean;
  phone_verified: boolean;
  avatar_url?: string | null;
}

const createAppError = (
  statusCode: number,
  messageKey: string,
  details?: unknown,
): AppErrorLike => {
  const error = new Error(messageKey) as AppErrorLike;
  error.statusCode = statusCode;
  error.messageKey = messageKey;

  if (details !== undefined) {
    error.details = details;
  }

  return error;
};

const getRefreshExpiryDate = (): Date => {
  const days = Number(env.JWT_REFRESH_EXPIRES_IN.replace('d', '')) || 7;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
};

const buildVerificationLink = (token: string): string =>
  `${env.BASE_URL}/api/v1/auth/email-verification/verify?token=${encodeURIComponent(token)}`;

const buildPasswordResetLink = (token: string): string =>
  `${env.BASE_URL}/api/v1/auth/password/reset?token=${encodeURIComponent(token)}`;

const resolveAvatarUrl = (storagePath: string | null | undefined): string | null =>
  storagePath ? buildFileUrl(storagePath) : null;

const issueSession = async (user: SessionUser) => {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    type: user.type,
  });

  const refreshToken = signRefreshToken({
    sub: user.id,
    jti: randomUUID(),
  });

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      user_id: user.id,
      expires_at: getRefreshExpiryDate(),
    },
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    avatar_url: user.avatar_url ?? null,
    restriction_state: getRestrictionState(user),
  };
};

export const sendEmailVerificationForUser = async (
  user: {
    id: string;
    email: string;
  },
): Promise<void> => {
  const challenge = await issueEmailVerificationChallenge(prisma, {
    userId: user.id,
    email: user.email,
  });

  await sendEmailVerificationLink({
    email: user.email,
    verificationLink: buildVerificationLink(challenge.token),
  });
};

export const requestPhoneVerificationForUser = async (
  user: {
    id: string;
    phone: string;
  },
): Promise<{ challenge_id: string; expires_at: Date }> => {
  const challenge = await issuePhoneVerificationChallenge(prisma, {
    userId: user.id,
    phone: user.phone,
  });

  await sendPhoneVerificationOtp({
    phone: user.phone,
    code: challenge.code,
  });

  return {
    challenge_id: challenge.challenge_id,
    expires_at: challenge.expires_at,
  };
};

export const registerUser = async ({
  first_name,
  last_name,
  birthday,
  country,
  email,
  phone,
  password,
  type,
  recaptcha_token,
  remoteIp,
}: {
  first_name: string;
  last_name: string;
  birthday: string;
  country: string;
  email: string;
  phone?: string | null;
  password: string;
  type: 'uso' | 'ucr';
  recaptcha_token: string;
  remoteIp?: string;
}) => {
  try {
    await validateRecaptcha({
      action: 'register',
      token: recaptcha_token,
      remoteIp,
    });
  } catch (error) {
    const messageKey = error instanceof Error ? error.message : 'auth.recaptcha_failed';
    throw createAppError(messageKey === 'auth.recaptcha_required' ? 400 : 401, messageKey);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    throw createAppError(409, 'auth.email_already_in_use');
  }

  if (phone) {
    const phoneOwner = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (phoneOwner) {
      throw createAppError(409, 'user.phone_already_in_use');
    }
  }

  const user = await prisma.user.create({
    data: {
      first_name,
      last_name,
      birthday: new Date(birthday),
      country,
      email,
      phone,
      hashed_password: await hashPassword(password),
      type,
    },
    select: {
      id: true,
      email: true,
      phone: true,
      email_verified: true,
      phone_verified: true,
    },
  });

  await sendEmailVerificationForUser({
    id: user.id,
    email: user.email,
  });

  const phoneVerification = user.phone
    ? await requestPhoneVerificationForUser({
      id: user.id,
      phone: user.phone,
    })
    : null;

  return {
    restriction_state: getRestrictionState(user),
    ...(phoneVerification
      ? {
        phone_verification: phoneVerification,
      }
      : {}),
  };
};

export const loginUser = async ({
  email,
  password,
  recaptcha_token,
  remoteIp,
}: {
  email: string;
  password: string;
  recaptcha_token: string;
  remoteIp?: string;
}) => {
  try {
    await validateRecaptcha({
      action: 'login',
      token: recaptcha_token,
      remoteIp,
    });
  } catch (error) {
    const messageKey = error instanceof Error ? error.message : 'auth.recaptcha_failed';
    throw createAppError(messageKey === 'auth.recaptcha_required' ? 400 : 401, messageKey);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      type: true,
      hashed_password: true,
      email_verified: true,
      phone_verified: true,
      two_factor_secret: true,
      two_factor_enabled_at: true,
      avatar_media: { select: { storage_path: true } },
    },
  });

  if (!user) {
    throw createAppError(401, 'auth.invalid_credentials');
  }

  const isValidPassword = await comparePassword(password, user.hashed_password);

  if (!isValidPassword) {
    throw createAppError(401, 'auth.invalid_credentials');
  }

  if (user.two_factor_secret && user.two_factor_enabled_at) {
    const challenge = await issueTwoFactorLoginChallenge(prisma, user.id);

    return {
      requires_two_factor: true,
      challenge_id: challenge.challenge_id,
      challenge_expires_at: challenge.expires_at,
    };
  }

  return {
    requires_two_factor: false,
    ...(await issueSession({
      ...user,
      avatar_url: resolveAvatarUrl(user.avatar_media?.storage_path),
    })),
  };
};

export const completeTwoFactorLogin = async ({
  challenge_id,
  code,
}: {
  challenge_id: string;
  code: string;
}) => {
  const challenge = await prisma.authChallenge.findUnique({
    where: { id: challenge_id },
    select: {
      id: true,
      user_id: true,
      kind: true,
      purpose: true,
      expires_at: true,
      used_at: true,
      user: {
        select: {
          id: true,
          email: true,
          type: true,
          email_verified: true,
          phone_verified: true,
          two_factor_secret: true,
          two_factor_enabled_at: true,
          avatar_media: { select: { storage_path: true } },
        },
      },
    },
  });

  if (!challenge || !challenge.user.two_factor_secret || !challenge.user.two_factor_enabled_at) {
    throw createAppError(401, 'errors.invalid_token');
  }

  if (!verifyTotpCode(challenge.user.two_factor_secret, code)) {
    throw createAppError(401, 'auth.invalid_two_factor_code');
  }

  await consumeTwoFactorLoginChallenge(prisma, {
    userId: challenge.user_id,
    challengeId: challenge_id,
  });

  return issueSession({
    ...challenge.user,
    avatar_url: resolveAvatarUrl(challenge.user.avatar_media?.storage_path),
  });
};

export const refreshUserSession = async (refresh_token: string) => {
  let payload: ReturnType<typeof verifyRefreshToken>;

  try {
    payload = verifyRefreshToken(refresh_token);
  } catch {
    throw createAppError(401, 'errors.invalid_token');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refresh_token },
    select: { id: true, user_id: true, expires_at: true },
  });

  if (!stored || stored.expires_at < new Date()) {
    if (stored) {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
    }

    throw createAppError(401, 'errors.invalid_token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      type: true,
      email_verified: true,
      phone_verified: true,
      avatar_media: { select: { storage_path: true } },
    },
  });

  if (!user) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw createAppError(401, 'auth.user_not_found');
  }

  await prisma.refreshToken.delete({ where: { id: stored.id } });

  return issueSession({
    ...user,
    avatar_url: resolveAvatarUrl(user.avatar_media?.storage_path),
  });
};

export const resendEmailVerification = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, email_verified: true },
  });

  if (!user) {
    throw createAppError(404, 'auth.user_not_found');
  }

  if (user.email_verified) {
    throw createAppError(409, 'auth.email_already_verified');
  }

  await sendEmailVerificationForUser(user);
};

export const verifyEmailAddress = async (token: string): Promise<void> => {
  const challenge = await consumeEmailVerificationChallenge(prisma, token);

  const user = await prisma.user.findUnique({
    where: { id: challenge.user_id },
    select: { id: true, email: true },
  });

  if (!user || user.email !== challenge.target) {
    throw createAppError(401, 'errors.invalid_token');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      email_verified: true,
    },
  });
};

export const requestPhoneVerification = async (
  userId: string,
): Promise<{ challenge_id: string; expires_at: Date }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, phone_verified: true },
  });

  if (!user) {
    throw createAppError(404, 'auth.user_not_found');
  }

  if (!user.phone) {
    throw createAppError(400, 'auth.phone_required');
  }

  if (user.phone_verified) {
    throw createAppError(409, 'auth.phone_already_verified');
  }

  return requestPhoneVerificationForUser({
    id: user.id,
    phone: user.phone,
  });
};

export const verifyPhoneNumber = async ({
  userId,
  challenge_id,
  code,
}: {
  userId: string;
  challenge_id: string;
  code: string;
}) => {
  const challenge = await verifyPhoneVerificationChallenge(prisma, {
    userId,
    challengeId: challenge_id,
    code,
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true },
  });

  if (!user || !user.phone || user.phone !== challenge.target) {
    throw createAppError(401, 'errors.invalid_token');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      phone_verified: true,
    },
  });
};

export const forgotPassword = async (email: string): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    return;
  }

  const challenge = await issuePasswordResetChallenge(prisma, {
    userId: user.id,
    email: user.email,
  });

  await sendPasswordResetLink({
    email: user.email,
    resetLink: buildPasswordResetLink(challenge.token),
  });
};

export const resetPassword = async ({
  token,
  password,
}: {
  token: string;
  password: string;
}) => {
  const challenge = await consumePasswordResetChallenge(prisma, token);
  const hashedPassword = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: challenge.user_id },
      data: {
        hashed_password: hashedPassword,
      },
    }),
    prisma.refreshToken.deleteMany({
      where: { user_id: challenge.user_id },
    }),
    prisma.authChallenge.updateMany({
      where: {
        user_id: challenge.user_id,
        used_at: null,
      },
      data: {
        used_at: new Date(),
      },
    }),
  ]);
};

export const beginTwoFactorEnrollment = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      email_verified: true,
      phone_verified: true,
      two_factor_secret: true,
      two_factor_enabled_at: true,
    },
  });

  if (!user) {
    throw createAppError(404, 'auth.user_not_found');
  }

  if (!getRestrictionState(user).is_fully_verified) {
    throw createAppError(403, 'auth.verification_required', {
      restriction_state: getRestrictionState(user),
    });
  }

  if (user.two_factor_secret && user.two_factor_enabled_at) {
    throw createAppError(409, 'auth.two_factor_already_enabled');
  }

  const secret = generateTotpSecret();
  const startedAt = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: {
      pending_two_factor_secret: secret,
      pending_two_factor_started_at: startedAt,
    },
  });

  return {
    secret,
    otp_auth_url: buildOtpAuthUrl({
      accountName: user.email,
      issuer: REZIPHAY_ISSUER,
      secret,
    }),
    expires_at: new Date(startedAt.getTime() + env.AUTH_TWO_FACTOR_ENROLL_TTL_MS),
  };
};

export const confirmTwoFactorEnrollment = async ({
  userId,
  code,
}: {
  userId: string;
  code: string;
}) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      pending_two_factor_secret: true,
      pending_two_factor_started_at: true,
    },
  });

  if (
    !user
    || !user.pending_two_factor_secret
    || !user.pending_two_factor_started_at
    || user.pending_two_factor_started_at.getTime() + env.AUTH_TWO_FACTOR_ENROLL_TTL_MS < Date.now()
  ) {
    throw createAppError(400, 'auth.two_factor_setup_expired');
  }

  if (!verifyTotpCode(user.pending_two_factor_secret, code)) {
    throw createAppError(401, 'auth.invalid_two_factor_code');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      two_factor_secret: user.pending_two_factor_secret,
      two_factor_enabled_at: new Date(),
      pending_two_factor_secret: null,
      pending_two_factor_started_at: null,
    },
  });
};

export const disableTwoFactor = async ({
  userId,
  code,
}: {
  userId: string;
  code: string;
}) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      two_factor_secret: true,
      two_factor_enabled_at: true,
    },
  });

  if (!user || !user.two_factor_secret || !user.two_factor_enabled_at) {
    throw createAppError(409, 'auth.two_factor_not_enabled');
  }

  if (!verifyTotpCode(user.two_factor_secret, code)) {
    throw createAppError(401, 'auth.invalid_two_factor_code');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      two_factor_secret: null,
      two_factor_enabled_at: null,
      pending_two_factor_secret: null,
      pending_two_factor_started_at: null,
    },
  });
};

export const createStepUpChallenge = async ({
  userId,
  purpose,
  password,
  two_factor_code,
  target,
}: {
  userId: string;
  purpose: StepUpPurpose;
  password: string;
  two_factor_code?: string;
  target?: string;
}) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      hashed_password: true,
      two_factor_secret: true,
      two_factor_enabled_at: true,
    },
  });

  if (!user) {
    throw createAppError(404, 'auth.user_not_found');
  }

  const isValidPassword = await comparePassword(password, user.hashed_password);

  if (!isValidPassword) {
    throw createAppError(401, 'auth.invalid_credentials');
  }

  if (user.two_factor_secret && user.two_factor_enabled_at) {
    if (!two_factor_code || !verifyTotpCode(user.two_factor_secret, two_factor_code)) {
      throw createAppError(401, 'auth.invalid_two_factor_code');
    }
  }

  return issueStepUpToken(prisma, {
    userId,
    purpose,
    target,
  });
};

export const requireStepUp = async ({
  userId,
  purpose,
  token,
  target,
}: {
  userId: string;
  purpose: StepUpPurpose;
  token: string | undefined;
  target?: string;
}) => {
  if (!token) {
    throw createAppError(403, 'auth.step_up_required', {
      purpose,
      step_up_required: true,
    });
  }

  try {
    await consumeStepUpToken(prisma, {
      userId,
      purpose,
      token,
      target,
    });
  } catch {
    throw createAppError(403, 'auth.step_up_required', {
      purpose,
      step_up_required: true,
    });
  }
};

export const getStepUpPurpose = STEP_UP_PURPOSES;
