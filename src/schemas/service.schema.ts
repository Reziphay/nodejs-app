import { z } from 'zod';

export const createServiceSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(150).trim(),
  description: z.string().max(2000).trim().optional(),
  branch_id: z.string().cuid('Invalid branch id').nullable().optional(),
  service_category_id: z.string().cuid('Invalid category id').nullable().optional(),
  price: z.number().positive().optional(),
  price_type: z.enum(['FIXED', 'STARTING_FROM', 'FREE']).default('FIXED'),
  duration: z.number().int().positive().max(1440).optional(),
  address: z.string().max(500).trim().optional(),
  image_media_ids: z.array(z.string().cuid('Invalid media id')).optional().default([]),
}).refine(
  (data) => data.branch_id || data.address,
  { message: 'Either branch_id or address is required for an individual service', path: ['address'] },
);

export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z.object({
  title: z.string().min(2).max(150).trim().optional(),
  description: z.string().max(2000).trim().nullable().optional(),
  branch_id: z.string().cuid('Invalid branch id').nullable().optional(),
  service_category_id: z.string().cuid('Invalid category id').nullable().optional(),
  price: z.number().positive().nullable().optional(),
  price_type: z.enum(['FIXED', 'STARTING_FROM', 'FREE']).optional(),
  duration: z.number().int().positive().max(1440).nullable().optional(),
  address: z.string().max(500).trim().nullable().optional(),
  image_media_ids: z.array(z.string().cuid('Invalid media id')).optional(),
});

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const rejectServiceSchema = z.object({
  rejection_reason: z.string().min(10).max(1000).trim(),
});

export type RejectServiceInput = z.infer<typeof rejectServiceSchema>;
