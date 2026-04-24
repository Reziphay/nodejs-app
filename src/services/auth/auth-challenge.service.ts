import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import type { PrismaClient, Prisma, AuthChallenge } from '../../generated/prisma/client';
import { AuthChallengeKind } from '../../generated/prisma/client';
import { env } from '../../config/env';

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

const EMAIL_VERIFICATION_PURPOSE = 'verify_email';
const PHONE_VERIFICATION_PURPOSE = 'verify_phone';
const PASSWORD_RESET_PURPOSE = 'reset_password';
const TWO_FACTOR_LOGIN_PURPOSE = 'login_two_factor';

export const STEP_UP_PURPOSES = {
  deleteAccount: 'delete_account',
  emailChange: 'email_change',
  phoneChange: 'phone_change',
  deleteBrand: 'delete_brand',
} as const;

export type StepUpPurpose = typeof STEP_UP_PURPOSES[keyof typeof STEP_UP_PURPOSES];

export interface ChallengeState {
  used_at: Date | null;
  expires_at: Date;
  delivery_count: number;
  last_sent_at: Date | null;
}

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const hashSecret = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export const generateOpaqueToken = (): string =>
  randomBytes(32).toString('hex');

export const generateNumericCode = (digits = 6): string =>
  randomInt(0, 10 ** digits).toString().padStart(digits, '0');

export const isChallengeActive = (challenge: Pick<AuthChallenge, 'used_at' | 'expires_at'>, now = new Date()): boolean =>
  challenge.used_at === null && challenge.expires_at.getTime() > now.getTime();

export const canResendChallenge = (
  challenge: ChallengeState,
  now = new Date(),
  minIntervalMs = env.AUTH_RESEND_INTERVAL_MS,
  maxDeliveries = env.AUTH_MAX_CHALLENGE_DELIVERIES,
): { allowed: boolean; reason: 'too_soon' | 'too_many_requests' | null } => {
  if (challenge.last_sent_at && now.getTime() - challenge.last_sent_at.getTime() < minIntervalMs) {
    return { allowed: false, reason: 'too_soon' };
  }

  if (challenge.delivery_count >= maxDeliveries && challenge.expires_at.getTime() > now.getTime()) {
    return { allowed: false, reason: 'too_many_requests' };
  }

  return { allowed: true, reason: null };
};

const markMatchingChallengesUsed = async (
  client: PrismaClientLike,
  where: Prisma.AuthChallengeWhereInput,
): Promise<void> => {
  await client.authChallenge.updateMany({
    where: {
      ...where,
      used_at: null,
    },
    data: {
      used_at: new Date(),
    },
  });
};

const createChallengeRecord = async (
  client: PrismaClientLike,
  data: Prisma.AuthChallengeCreateInput,
): Promise<AuthChallenge> =>
  client.authChallenge.create({ data });

export const issueEmailVerificationChallenge = async (
  client: PrismaClientLike,
  {
    userId,
    email,
  }: {
    userId: string;
    email: string;
  },
): Promise<{ token: string; expires_at: Date }> => {
  await markMatchingChallengesUsed(client, {
    user_id: userId,
    kind: AuthChallengeKind.EMAIL_VERIFICATION,
    purpose: EMAIL_VERIFICATION_PURPOSE,
  });

  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + env.AUTH_EMAIL_VERIFICATION_TTL_MS);

  await createChallengeRecord(client, {
    user: { connect: { id: userId } },
    kind: AuthChallengeKind.EMAIL_VERIFICATION,
    purpose: EMAIL_VERIFICATION_PURPOSE,
    target: email,
    token_hash: hashSecret(token),
    expires_at: expiresAt,
    delivery_count: 1,
    last_sent_at: new Date(),
  });

  return { token, expires_at: expiresAt };
};

export const consumeEmailVerificationChallenge = async (
  client: PrismaClientLike,
  token: string,
): Promise<AuthChallenge> => {
  const hashedToken = hashSecret(token);
  const challenge = await client.authChallenge.findUnique({
    where: { token_hash: hashedToken },
  });

  if (
    !challenge
    || challenge.kind !== AuthChallengeKind.EMAIL_VERIFICATION
    || challenge.purpose !== EMAIL_VERIFICATION_PURPOSE
    || !isChallengeActive(challenge)
  ) {
    throw new Error('errors.invalid_token');
  }

  return client.authChallenge.update({
    where: { id: challenge.id },
    data: { used_at: new Date() },
  });
};

export const issuePasswordResetChallenge = async (
  client: PrismaClientLike,
  {
    userId,
    email,
  }: {
    userId: string;
    email: string;
  },
): Promise<{ token: string; expires_at: Date }> => {
  await markMatchingChallengesUsed(client, {
    user_id: userId,
    kind: AuthChallengeKind.PASSWORD_RESET,
    purpose: PASSWORD_RESET_PURPOSE,
  });

  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + env.AUTH_PASSWORD_RESET_TTL_MS);

  await createChallengeRecord(client, {
    user: { connect: { id: userId } },
    kind: AuthChallengeKind.PASSWORD_RESET,
    purpose: PASSWORD_RESET_PURPOSE,
    target: email,
    token_hash: hashSecret(token),
    expires_at: expiresAt,
    delivery_count: 1,
    last_sent_at: new Date(),
  });

  return { token, expires_at: expiresAt };
};

export const consumePasswordResetChallenge = async (
  client: PrismaClientLike,
  token: string,
): Promise<AuthChallenge> => {
  const hashedToken = hashSecret(token);
  const challenge = await client.authChallenge.findUnique({
    where: { token_hash: hashedToken },
  });

  if (
    !challenge
    || challenge.kind !== AuthChallengeKind.PASSWORD_RESET
    || challenge.purpose !== PASSWORD_RESET_PURPOSE
    || !isChallengeActive(challenge)
  ) {
    throw new Error('errors.invalid_token');
  }

  return client.authChallenge.update({
    where: { id: challenge.id },
    data: { used_at: new Date() },
  });
};

export const issuePhoneVerificationChallenge = async (
  client: PrismaClientLike,
  {
    userId,
    phone,
  }: {
    userId: string;
    phone: string;
  },
): Promise<{ challenge_id: string; code: string; expires_at: Date }> => {
  const existing = await client.authChallenge.findFirst({
    where: {
      user_id: userId,
      kind: AuthChallengeKind.PHONE_VERIFICATION,
      purpose: PHONE_VERIFICATION_PURPOSE,
      target: phone,
      used_at: null,
    },
    orderBy: { created_at: 'desc' },
  });

  if (existing && isChallengeActive(existing)) {
    const resendState = canResendChallenge(existing);

    if (!resendState.allowed) {
      throw new Error(
        resendState.reason === 'too_soon'
          ? 'auth.challenge_resend_too_soon'
          : 'auth.challenge_rate_limited',
      );
    }

    const code = generateNumericCode();
    const expiresAt = new Date(Date.now() + env.AUTH_PHONE_VERIFICATION_TTL_MS);
    const updated = await client.authChallenge.update({
      where: { id: existing.id },
      data: {
        code_hash: hashSecret(code),
        expires_at: expiresAt,
        last_sent_at: new Date(),
        delivery_count: { increment: 1 },
        attempt_count: 0,
      },
    });

    return { challenge_id: updated.id, code, expires_at: expiresAt };
  }

  await markMatchingChallengesUsed(client, {
    user_id: userId,
    kind: AuthChallengeKind.PHONE_VERIFICATION,
    purpose: PHONE_VERIFICATION_PURPOSE,
  });

  const code = generateNumericCode();
  const expiresAt = new Date(Date.now() + env.AUTH_PHONE_VERIFICATION_TTL_MS);
  const created = await createChallengeRecord(client, {
    user: { connect: { id: userId } },
    kind: AuthChallengeKind.PHONE_VERIFICATION,
    purpose: PHONE_VERIFICATION_PURPOSE,
    target: phone,
    code_hash: hashSecret(code),
    expires_at: expiresAt,
    delivery_count: 1,
    last_sent_at: new Date(),
    max_attempts: env.AUTH_MAX_CHALLENGE_ATTEMPTS,
  });

  return { challenge_id: created.id, code, expires_at: expiresAt };
};

export const verifyPhoneVerificationChallenge = async (
  client: PrismaClientLike,
  {
    userId,
    challengeId,
    code,
  }: {
    userId: string;
    challengeId: string;
    code: string;
  },
): Promise<AuthChallenge> => {
  const challenge = await client.authChallenge.findUnique({
    where: { id: challengeId },
  });

  if (
    !challenge
    || challenge.user_id !== userId
    || challenge.kind !== AuthChallengeKind.PHONE_VERIFICATION
    || challenge.purpose !== PHONE_VERIFICATION_PURPOSE
    || !isChallengeActive(challenge)
    || !challenge.code_hash
  ) {
    throw new Error('errors.invalid_token');
  }

  if (!safeEqual(challenge.code_hash, hashSecret(code))) {
    const nextAttempts = challenge.attempt_count + 1;

    await client.authChallenge.update({
      where: { id: challenge.id },
      data: {
        attempt_count: nextAttempts,
        ...(nextAttempts >= challenge.max_attempts ? { used_at: new Date() } : {}),
      },
    });

    throw new Error('auth.invalid_otp');
  }

  return client.authChallenge.update({
    where: { id: challenge.id },
    data: { used_at: new Date() },
  });
};

export const issueTwoFactorLoginChallenge = async (
  client: PrismaClientLike,
  userId: string,
): Promise<{ challenge_id: string; expires_at: Date }> => {
  await markMatchingChallengesUsed(client, {
    user_id: userId,
    kind: AuthChallengeKind.TWO_FACTOR_LOGIN,
    purpose: TWO_FACTOR_LOGIN_PURPOSE,
  });

  const expiresAt = new Date(Date.now() + env.AUTH_TWO_FACTOR_CHALLENGE_TTL_MS);
  const challenge = await createChallengeRecord(client, {
    user: { connect: { id: userId } },
    kind: AuthChallengeKind.TWO_FACTOR_LOGIN,
    purpose: TWO_FACTOR_LOGIN_PURPOSE,
    expires_at: expiresAt,
  });

  return { challenge_id: challenge.id, expires_at: expiresAt };
};

export const consumeTwoFactorLoginChallenge = async (
  client: PrismaClientLike,
  {
    userId,
    challengeId,
  }: {
    userId: string;
    challengeId: string;
  },
): Promise<AuthChallenge> => {
  const challenge = await client.authChallenge.findUnique({
    where: { id: challengeId },
  });

  if (
    !challenge
    || challenge.user_id !== userId
    || challenge.kind !== AuthChallengeKind.TWO_FACTOR_LOGIN
    || challenge.purpose !== TWO_FACTOR_LOGIN_PURPOSE
    || !isChallengeActive(challenge)
  ) {
    throw new Error('errors.invalid_token');
  }

  return client.authChallenge.update({
    where: { id: challenge.id },
    data: { used_at: new Date() },
  });
};

export const issueStepUpToken = async (
  client: PrismaClientLike,
  {
    userId,
    purpose,
    target,
  }: {
    userId: string;
    purpose: StepUpPurpose;
    target?: string;
  },
): Promise<{ token: string; expires_at: Date }> => {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + env.AUTH_STEP_UP_TTL_MS);

  const metadata = target ? { target } : undefined;

  await createChallengeRecord(client, {
    user: { connect: { id: userId } },
    kind: AuthChallengeKind.STEP_UP,
    purpose,
    target,
    token_hash: hashSecret(token),
    expires_at: expiresAt,
    metadata,
  });

  return { token, expires_at: expiresAt };
};

export const consumeStepUpToken = async (
  client: PrismaClientLike,
  {
    userId,
    purpose,
    token,
    target,
  }: {
    userId: string;
    purpose: StepUpPurpose;
    token: string;
    target?: string;
  },
): Promise<AuthChallenge> => {
  const challenge = await client.authChallenge.findUnique({
    where: { token_hash: hashSecret(token) },
  });

  if (
    !challenge
    || challenge.user_id !== userId
    || challenge.kind !== AuthChallengeKind.STEP_UP
    || challenge.purpose !== purpose
    || !isChallengeActive(challenge)
    || (target !== undefined && challenge.target !== target)
  ) {
    throw new Error('auth.step_up_required');
  }

  return client.authChallenge.update({
    where: { id: challenge.id },
    data: { used_at: new Date() },
  });
};
