import { env } from '../../config/env';

export type RecaptchaAction = 'register' | 'login';

interface RecaptchaValidationInput {
  action: RecaptchaAction;
  token: string;
  remoteIp?: string;
}

interface RecaptchaResponse {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
}

const isBypassMode = (): boolean =>
  env.NODE_ENV !== 'production' && !env.RECAPTCHA_SECRET_KEY;

export const validateRecaptcha = async ({
  action,
  token,
  remoteIp,
}: RecaptchaValidationInput): Promise<void> => {
  if (!token.trim()) {
    throw new Error('auth.recaptcha_required');
  }

  if (isBypassMode()) {
    return;
  }

  if (!env.RECAPTCHA_SECRET_KEY) {
    throw new Error('auth.recaptcha_unavailable');
  }

  const body = new URLSearchParams({
    secret: env.RECAPTCHA_SECRET_KEY,
    response: token,
  });

  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error('auth.recaptcha_failed');
  }

  const result = await response.json() as RecaptchaResponse;

  if (!result.success) {
    throw new Error('auth.recaptcha_failed');
  }

  if (result.action && result.action !== action) {
    throw new Error('auth.recaptcha_failed');
  }

  if (typeof result.score === 'number' && result.score < env.RECAPTCHA_MIN_SCORE) {
    throw new Error('auth.recaptcha_failed');
  }
};
