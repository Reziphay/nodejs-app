import dotenv from 'dotenv';

dotenv.config();

export const env = {
  NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  PORT: Number(process.env['PORT'] ?? 3000),
  DATABASE_URL: process.env['DATABASE_URL'] ?? '',
  JWT_ACCESS_SECRET: process.env['JWT_ACCESS_SECRET'] ?? '',
  JWT_REFRESH_SECRET: process.env['JWT_REFRESH_SECRET'] ?? '',
  JWT_ACCESS_EXPIRES_IN: process.env['JWT_ACCESS_EXPIRES_IN'] ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d',
  STORAGE_DIR: process.env['STORAGE_DIR'] ?? 'storage',
  BASE_URL: process.env['BASE_URL'] ?? `http://localhost:${process.env['PORT'] ?? 3000}`,
};
