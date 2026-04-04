import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { env } from '../config/env';

export const getUserStorageDir = (userId: string): string =>
  path.resolve(env.STORAGE_DIR, 'users', userId);

export const buildStoragePath = (userId: string, ext: string): string => {
  const filename = `${randomUUID()}.${ext}`;
  return path.join(getUserStorageDir(userId), filename);
};

export const ensureUserStorageDir = async (userId: string): Promise<void> => {
  await fs.mkdir(getUserStorageDir(userId), { recursive: true });
};

export const deleteFile = async (storagePath: string): Promise<void> => {
  await fs.unlink(storagePath).catch(() => undefined);
};

export const deleteUserStorageDir = async (userId: string): Promise<void> => {
  await fs.rm(getUserStorageDir(userId), { recursive: true, force: true });
};

export const buildFileUrl = (storagePath: string): string => {
  const relative = path.relative(env.STORAGE_DIR, storagePath).replace(/\\/g, '/');
  return `${env.BASE_URL}/uploads/${relative}`;
};
