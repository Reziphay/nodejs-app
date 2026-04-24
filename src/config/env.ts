import dotenv from 'dotenv';

dotenv.config();

export const env = {
  NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  HOST: process.env['HOST'] ?? '0.0.0.0',
  PORT: Number(process.env['PORT'] ?? 3000),
  DATABASE_URL: process.env['DATABASE_URL'] ?? '',
  JWT_ACCESS_SECRET: process.env['JWT_ACCESS_SECRET'] ?? '',
  JWT_REFRESH_SECRET: process.env['JWT_REFRESH_SECRET'] ?? '',
  JWT_ACCESS_EXPIRES_IN: process.env['JWT_ACCESS_EXPIRES_IN'] ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d',
  STORAGE_DIR: process.env['STORAGE_DIR'] ?? 'storage',
  BASE_URL: process.env['BASE_URL'] ?? `http://localhost:${process.env['PORT'] ?? 3000}`,
  CORS_ORIGINS: process.env['CORS_ORIGINS'] ?? '',
  RECAPTCHA_SECRET_KEY: process.env['RECAPTCHA_SECRET_KEY'] ?? '',
  RECAPTCHA_MIN_SCORE: Number(process.env['RECAPTCHA_MIN_SCORE'] ?? 0.5),
  AUTH_EMAIL_VERIFICATION_TTL_MS: Number(process.env['AUTH_EMAIL_VERIFICATION_TTL_MS'] ?? 24 * 60 * 60 * 1000),
  AUTH_PHONE_VERIFICATION_TTL_MS: Number(process.env['AUTH_PHONE_VERIFICATION_TTL_MS'] ?? 10 * 60 * 1000),
  AUTH_PASSWORD_RESET_TTL_MS: Number(process.env['AUTH_PASSWORD_RESET_TTL_MS'] ?? 60 * 60 * 1000),
  AUTH_TWO_FACTOR_CHALLENGE_TTL_MS: Number(process.env['AUTH_TWO_FACTOR_CHALLENGE_TTL_MS'] ?? 10 * 60 * 1000),
  AUTH_TWO_FACTOR_ENROLL_TTL_MS: Number(process.env['AUTH_TWO_FACTOR_ENROLL_TTL_MS'] ?? 10 * 60 * 1000),
  AUTH_STEP_UP_TTL_MS: Number(process.env['AUTH_STEP_UP_TTL_MS'] ?? 10 * 60 * 1000),
  AUTH_RESEND_INTERVAL_MS: Number(process.env['AUTH_RESEND_INTERVAL_MS'] ?? 60 * 1000),
  AUTH_MAX_CHALLENGE_DELIVERIES: Number(process.env['AUTH_MAX_CHALLENGE_DELIVERIES'] ?? 5),
  AUTH_MAX_CHALLENGE_ATTEMPTS: Number(process.env['AUTH_MAX_CHALLENGE_ATTEMPTS'] ?? 5),
};
