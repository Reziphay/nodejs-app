import { z } from 'zod';
import { sanitizeRichHtml } from '../lib/rich-text';

const richDescription = (max: number) =>
  z.string().max(max).trim().transform((v) => sanitizeRichHtml(v));

// ─── Branch ───────────────────────────────────────────────────────────────────

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const branchBreakSchema = z.object({
  start: z.string().regex(timeRegex, 'Break start must be HH:mm'),
  end: z.string().regex(timeRegex, 'Break end must be HH:mm'),
});

export const createBranchSchema = z
  .object({
    name: z.string().min(2, 'Branch name must be at least 2 characters').max(100).trim(),
    description: richDescription(1000).optional(),
    address1: z.string().min(2).max(200).trim(),
    address2: z.string().max(200).trim().optional(),
    phone: z.string().regex(/^\+?\d{7,20}$/, 'Invalid phone number').optional(),
    email: z.string().email('Invalid email').optional(),
    is_24_7: z.boolean().optional().default(false),
    opening: z.string().regex(timeRegex, 'Opening must be HH:mm').optional(),
    closing: z.string().regex(timeRegex, 'Closing must be HH:mm').optional(),
    breaks: z.array(branchBreakSchema).optional().default([]),
    cover_media_id: z.string().cuid('Invalid media id').nullable().optional(),
  })
  .refine(
    (data) => data.is_24_7 || (!!data.opening && !!data.closing),
    { message: 'Both opening and closing times are required when is_24_7 is false', path: ['opening'] },
  );

export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = z
  .object({
    name: z.string().min(2).max(100).trim().optional(),
    description: richDescription(1000).nullable().optional(),
    address1: z.string().min(2).max(200).trim().optional(),
    address2: z.string().max(200).trim().nullable().optional(),
    phone: z.string().regex(/^\+?\d{7,20}$/, 'Invalid phone number').nullable().optional(),
    email: z.string().email('Invalid email').nullable().optional(),
    is_24_7: z.boolean().optional(),
    opening: z.string().regex(timeRegex, 'Opening must be HH:mm').nullable().optional(),
    closing: z.string().regex(timeRegex, 'Closing must be HH:mm').nullable().optional(),
    breaks: z.array(branchBreakSchema).optional(),
    cover_media_id: z.string().cuid('Invalid media id').nullable().optional(),
  })
  .refine(
    (data) => {
      // Only validate when is_24_7 is explicitly false AND either time is being updated
      if (data.is_24_7 === false) {
        return !!data.opening && !!data.closing;
      }
      return true;
    },
    { message: 'Both opening and closing times are required when is_24_7 is false', path: ['opening'] },
  );

export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

// ─── Brand ────────────────────────────────────────────────────────────────────

const socialUrlSchema = z
  .string()
  .url('Invalid URL')
  .max(500)
  .refine(
    (url) => url.startsWith('https://') || url.startsWith('http://'),
    'URL must use https:// or http://',
  )
  .nullable()
  .optional();

const socialLinksShape = {
  instagram_url: socialUrlSchema,
  facebook_url:  socialUrlSchema,
  youtube_url:   socialUrlSchema,
  whatsapp_url:  socialUrlSchema,
  linkedin_url:  socialUrlSchema,
  x_url:         socialUrlSchema,
  website_url:   socialUrlSchema,
};

export const createBrandSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
  description: richDescription(1000).optional(),
  categoryIds: z.array(z.string().cuid('Invalid category id')).optional().default([]),
  logo_media_id: z.string().cuid('Invalid media id').optional(),
  gallery_media_ids: z.array(z.string().cuid('Invalid media id')).optional().default([]),
  branches: z.array(createBranchSchema).optional().default([]),
  ...socialLinksShape,
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const updateBrandSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  description: richDescription(1000).nullable().optional(),
  categoryIds: z.array(z.string().cuid('Invalid category id')).optional(),
  logo_media_id: z.string().cuid('Invalid media id').nullable().optional(),
  gallery_media_ids: z.array(z.string().cuid('Invalid media id')).optional(),
  ...socialLinksShape,
});

export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

export const transferBrandSchema = z.object({
  target_user_id: z.string().cuid('Invalid user id'),
});

export type TransferBrandInput = z.infer<typeof transferBrandSchema>;

export const upsertBrandRatingSchema = z.object({
  value: z.number().int().min(1).max(5),
});

export type UpsertBrandRatingInput = z.infer<typeof upsertBrandRatingSchema>;

// Only `delete_with_services` is accepted until the Service domain is built.
// Transfer-service paths are intentionally excluded to prevent misleading clients.
export const deleteBrandSchema = z.object({
  service_handling: z.literal('delete_with_services').default('delete_with_services'),
});

export type DeleteBrandInput = z.infer<typeof deleteBrandSchema>;
