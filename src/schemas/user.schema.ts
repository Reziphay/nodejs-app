import { z } from 'zod';

export const updateMeSchema = z.object({
  first_name: z.string().min(2, 'First name must be at least 2 characters').max(50).trim(),
  last_name: z.string().min(2, 'Last name must be at least 2 characters').max(50).trim(),
  birthday: z
    .string()
    .date('Birthday must be a valid date (YYYY-MM-DD)')
    .refine((val) => {
      const age = (Date.now() - new Date(val).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      return age >= 13;
    }, 'Must be at least 13 years old'),
  country: z.string().min(2).max(100).trim(),
  country_prefix: z
    .string()
    .regex(/^\+\d{1,4}$/, 'Country prefix must be like +994 or +1')
    .nullable(),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  phone: z
    .string()
    .regex(/^\d{7,15}$/, 'Phone must be 7-15 digits')
    .nullable(),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
