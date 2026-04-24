import logger from '../../lib/logger';

export const sendEmailVerificationLink = async ({
  email,
  verificationLink,
}: {
  email: string;
  verificationLink: string;
}): Promise<void> => {
  logger.info(`Email verification delivery queued for ${email}: ${verificationLink}`);
};

export const sendPasswordResetLink = async ({
  email,
  resetLink,
}: {
  email: string;
  resetLink: string;
}): Promise<void> => {
  logger.info(`Password reset delivery queued for ${email}: ${resetLink}`);
};

export const sendPhoneVerificationOtp = async ({
  phone,
  code,
}: {
  phone: string;
  code: string;
}): Promise<void> => {
  logger.info(`Phone verification OTP queued for ${phone}: ${code}`);
};
