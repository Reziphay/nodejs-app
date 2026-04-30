import { z } from 'zod';

const socialUrlField = z
  .string()
  .url('Invalid URL')
  .max(500)
  .refine(
    (url) => url.startsWith('https://') || url.startsWith('http://'),
    'URL must use https:// or http://',
  )
  .nullable()
  .optional();

export const updateMeSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters').max(50).trim(),
  last_name: z.string().min(2, 'Last name must be at least 2 characters').max(50).trim(),
  birthday: z
    .string()
    .date('Birthday must be a valid date (YYYY-MM-DD)')
    .refine((val) => {
      const age = (Date.now() - new Date(val).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      return age >= 18;
    }, 'Must be at least 18 years old'),
  country: z.string().min(2).max(100).trim(),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  // Full E.164 format: '+' followed by 7–15 digits (e.g. "+9941234567").
  // The frontend combines the country prefix and local number before sending;
  // the backend stores this value directly without any further manipulation.
  // Pass null to remove the phone number.
  phone: z
    .string()
    .regex(/^\+\d{7,15}$/, 'Phone must be in E.164 format, e.g. +9941234567')
    .nullable()
    .optional(),
  instagram_url: socialUrlField,
  facebook_url:  socialUrlField,
  youtube_url:   socialUrlField,
  whatsapp_url:  socialUrlField,
  linkedin_url:  socialUrlField,
  x_url:         socialUrlField,
  website_url:   socialUrlField,
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
