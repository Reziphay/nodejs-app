import { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

export const authRateLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    status: 429,
    message: 'auth.too_many_attempts',
  },
});
