import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const registerSchema = z.object({
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
  phone: z
    .string()
    .regex(/^\+\d{7,15}$/, 'Phone must be in E.164 format, e.g. +9941234567')
    .nullable()
    .optional(),
  password: passwordSchema,
  type: z.enum(['uso', 'ucr']),
  recaptcha_token: z.string().min(1, 'reCAPTCHA token is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
  recaptcha_token: z.string().min(1, 'reCAPTCHA token is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const verifyPhoneSchema = z.object({
  challenge_id: z.string().cuid('Invalid challenge id'),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export type VerifyPhoneInput = z.infer<typeof verifyPhoneSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const completeTwoFactorLoginSchema = z.object({
  challenge_id: z.string().cuid('Invalid challenge id'),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export type CompleteTwoFactorLoginInput = z.infer<typeof completeTwoFactorLoginSchema>;

export const confirmTwoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export type ConfirmTwoFactorInput = z.infer<typeof confirmTwoFactorSchema>;

export const createStepUpSchema = z.object({
  purpose: z.enum(['delete_account', 'email_change', 'phone_change', 'delete_brand']),
  password: z.string().min(1, 'Password is required'),
  two_factor_code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits').optional(),
  target: z.string().min(1).optional(),
});

export type CreateStepUpInput = z.infer<typeof createStepUpSchema>;
