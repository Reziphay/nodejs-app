import fs from 'fs/promises';
import crypto from 'crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../middlewares/error.middleware';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ValidatedImage {
  buffer: Buffer;
  format: string;
  mimeType: string;
  size: number;
  checksum: string;
}

export const validateAndProcessImage = async (file: Express.Multer.File): Promise<ValidatedImage> => {
  if (file.size > MAX_SIZE_BYTES) {
    const err: AppError = new Error();
    err.statusCode = 413;
    err.messageKey = 'media.file_too_large';
    throw err;
  }

  // Validate by actual file signature, not extension
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    const err: AppError = new Error();
    err.statusCode = 415;
    err.messageKey = 'media.invalid_file_type';
    throw err;
  }

  // Strip EXIF metadata and normalise via sharp, output as webp
  const processed = await sharp(file.buffer)
    .rotate() // auto-rotate based on EXIF orientation then strip
    .webp({ quality: 85 })
    .toBuffer();

  const checksum = crypto.createHash('sha256').update(processed).digest('hex');

  return {
    buffer: processed,
    format: 'webp',
    mimeType: 'image/webp',
    size: processed.length,
    checksum,
  };
};

export const writeFileToDisk = async (storagePath: string, buffer: Buffer): Promise<void> => {
  await fs.writeFile(storagePath, buffer);
};
