import { z } from 'zod';

// ─── Branch ───────────────────────────────────────────────────────────────────

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const urlSchema = z.string().url('Invalid URL').max(500).trim();

const socialLinksSchema = z
  .object({
    instagram: urlSchema.optional(),
    facebook: urlSchema.optional(),
    tiktok: urlSchema.optional(),
    youtube: urlSchema.optional(),
    x: urlSchema.optional(),
  })
  .strict();

const branchBreakSchema = z.object({
  start: z.string().regex(timeRegex, 'Break start must be HH:mm'),
  end: z.string().regex(timeRegex, 'Break end must be HH:mm'),
});

export const createBranchSchema = z
  .object({
    name: z.string().min(2, 'Branch name must be at least 2 characters').max(100).trim(),
    description: z.string().max(1000).trim().optional(),
    address1: z.string().min(2).max(200).trim(),
    address2: z.string().max(200).trim().optional(),
    city: z.string().min(2).max(100).trim().optional(),
    state: z.string().max(100).trim().optional(),
    postal_code: z.string().max(30).trim().optional(),
    country: z.string().max(100).trim().optional(),
    phone: z.string().regex(/^\+?\d{7,20}$/, 'Invalid phone number').optional(),
    email: z.string().email('Invalid email').optional(),
    is_24_7: z.boolean().optional().default(false),
    opening: z.string().regex(timeRegex, 'Opening must be HH:mm').optional(),
    closing: z.string().regex(timeRegex, 'Closing must be HH:mm').optional(),
    breaks: z.array(branchBreakSchema).optional().default([]),
    cover_media_id: z.string().cuid('Invalid media id').nullable().optional(),
    interior_media_ids: z.array(z.string().cuid('Invalid media id')).optional().default([]),
  })
  .refine(
    (data) => data.is_24_7 || (!!data.opening && !!data.closing),
    { message: 'Both opening and closing times are required when is_24_7 is false', path: ['opening'] },
  );

export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = z
  .object({
    name: z.string().min(2).max(100).trim().optional(),
    description: z.string().max(1000).trim().nullable().optional(),
    address1: z.string().min(2).max(200).trim().optional(),
    address2: z.string().max(200).trim().nullable().optional(),
    city: z.string().min(2).max(100).trim().nullable().optional(),
    state: z.string().max(100).trim().nullable().optional(),
    postal_code: z.string().max(30).trim().nullable().optional(),
    country: z.string().max(100).trim().nullable().optional(),
    phone: z.string().regex(/^\+?\d{7,20}$/, 'Invalid phone number').nullable().optional(),
    email: z.string().email('Invalid email').nullable().optional(),
    is_24_7: z.boolean().optional(),
    opening: z.string().regex(timeRegex, 'Opening must be HH:mm').nullable().optional(),
    closing: z.string().regex(timeRegex, 'Closing must be HH:mm').nullable().optional(),
    breaks: z.array(branchBreakSchema).optional(),
    cover_media_id: z.string().cuid('Invalid media id').nullable().optional(),
    interior_media_ids: z.array(z.string().cuid('Invalid media id')).optional(),
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

export const createBrandSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
  description: z.string().max(1000).trim().optional(),
  website_url: urlSchema.optional(),
  social_links: socialLinksSchema.optional(),
  categoryIds: z.array(z.string().cuid('Invalid category id')).optional().default([]),
  logo_media_id: z.string().cuid('Invalid media id').optional(),
  gallery_media_ids: z.array(z.string().cuid('Invalid media id')).optional().default([]),
  branches: z.array(createBranchSchema).min(1, 'At least one branch is required'),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const updateBrandSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  description: z.string().max(1000).trim().nullable().optional(),
  website_url: urlSchema.nullable().optional(),
  social_links: socialLinksSchema.nullable().optional(),
  categoryIds: z.array(z.string().cuid('Invalid category id')).optional(),
  logo_media_id: z.string().cuid('Invalid media id').nullable().optional(),
  gallery_media_ids: z.array(z.string().cuid('Invalid media id')).optional(),
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
  step_up_token: z.string().min(1, 'Step-up token is required'),
});

export type DeleteBrandInput = z.infer<typeof deleteBrandSchema>;
