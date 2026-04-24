import fs from 'fs/promises';
import crypto from 'crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../middlewares/error.middleware';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ASPECT_RATIO_TOLERANCE = 0.02;

export type BrandMediaUsage = 'logo' | 'gallery' | 'branch_cover';

export interface ValidatedImage {
  buffer: Buffer;
  format: string;
  mimeType: string;
  size: number;
  checksum: string;
  width: number;
  height: number;
}

function ensureAspectRatio(
  width: number,
  height: number,
  usage?: BrandMediaUsage,
) {
  if (!usage) return;

  let expectedRatio: number;
  let errorKey: string;

  if (usage === 'logo') {
    expectedRatio = 1;
    errorKey = 'media.invalid_logo_ratio';
  } else if (usage === 'gallery' || usage === 'branch_cover') {
    // Both gallery images and branch cover photos must be 16:9 (wide landscape).
    expectedRatio = 16 / 9;
    errorKey = usage === 'branch_cover' ? 'media.invalid_cover_ratio' : 'media.invalid_gallery_ratio';
  } else {
    return;
  }

  const actualRatio = width / height;
  if (Math.abs(actualRatio - expectedRatio) <= ASPECT_RATIO_TOLERANCE) return;

  const err: AppError = new Error();
  err.statusCode = 400;
  err.messageKey = errorKey;
  throw err;
}

export const validateAndProcessImage = async (
  file: Express.Multer.File,
  usage?: BrandMediaUsage,
): Promise<ValidatedImage> => {
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

  const image = sharp(file.buffer).rotate();
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    const err: AppError = new Error();
    err.statusCode = 415;
    err.messageKey = 'media.invalid_file_type';
    throw err;
  }

  ensureAspectRatio(metadata.width, metadata.height, usage);

  // Strip EXIF metadata and normalise via sharp, output as webp
  const processed = await image
    .webp({ quality: 85 })
    .toBuffer();

  const processedMetadata = await sharp(processed).metadata();
  const width = processedMetadata.width ?? metadata.width;
  const height = processedMetadata.height ?? metadata.height;

  const checksum = crypto.createHash('sha256').update(processed).digest('hex');

  return {
    buffer: processed,
    format: 'webp',
    mimeType: 'image/webp',
    size: processed.length,
    checksum,
    width,
    height,
  };
};

export const writeFileToDisk = async (storagePath: string, buffer: Buffer): Promise<void> => {
  await fs.writeFile(storagePath, buffer);
};
