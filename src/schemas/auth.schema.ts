import { z } from 'zod';

export const registerSchema = z.object({
  first_name: z
    .string()
    .min(2, 'First name must be at least 2 characters')
    .max(50)
    .trim(),
  last_name: z
    .string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50)
    .trim(),
  birthday: z
    .string()
    .date('Birthday must be a valid date (YYYY-MM-DD)')
    .refine((val) => {
      const age = (Date.now() - new Date(val).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      return age >= 13;
    }, 'Must be at least 13 years old'),
  country: z.string().min(2).max(100).trim(),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  type: z.enum(['uso', 'ucr']),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
