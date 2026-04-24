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
  step_up_token: z.string().min(1).optional(),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const deleteMeSchema = z.object({
  step_up_token: z.string().min(1, 'Step-up token is required'),
});

export type DeleteMeInput = z.infer<typeof deleteMeSchema>;
