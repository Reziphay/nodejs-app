import { Router } from 'express';
import {
  register,
  login,
  completeLoginTwoFactor,
  refresh,
  me,
  resendVerificationEmail,
  verifyEmail,
  requestPhoneOtp,
  verifyPhoneOtp,
  requestPasswordReset,
  completePasswordReset,
  startTwoFactorEnrollment,
  confirmTwoFactorSetup,
  turnOffTwoFactor,
  createStepUp,
} from '../../controllers/auth.controller';
import { validate } from '../../middlewares/validate.middleware';
import { authenticate } from '../../middlewares/auth.middleware';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  verifyEmailSchema,
  verifyPhoneSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  completeTwoFactorLoginSchema,
  confirmTwoFactorSchema,
  createStepUpSchema,
} from '../../schemas/auth.schema';

const router: Router = Router();

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user and start verification flows
 */
router.post('/register', validate(registerSchema), register);

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with password or begin a 2FA challenge
 */
router.post('/login', validate(loginSchema), login);

/**
 * @openapi
 * /api/v1/auth/login/2fa:
 *   post:
 *     tags: [Auth]
 *     summary: Complete a pending 2FA login challenge
 */
router.post('/login/2fa', validate(completeTwoFactorLoginSchema), completeLoginTwoFactor);

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh the access and refresh token pair
 */
router.post('/refresh', validate(refreshSchema), refresh);

/**
 * @openapi
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current authenticated user and restriction state
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', authenticate, me);

/**
 * @openapi
 * /api/v1/auth/email-verification/resend:
 *   post:
 *     tags: [Auth]
 *     summary: Resend the email verification magic link
 *     security:
 *       - bearerAuth: []
 */
router.post('/email-verification/resend', authenticate, resendVerificationEmail);

/**
 * @openapi
 * /api/v1/auth/email-verification/verify:
 *   get:
 *     tags: [Auth]
 *     summary: Verify an email address with a magic-link token
 */
router.get('/email-verification/verify', verifyEmail);
router.post('/email-verification/verify', validate(verifyEmailSchema), verifyEmail);

/**
 * @openapi
 * /api/v1/auth/phone-verification/request:
 *   post:
 *     tags: [Auth]
 *     summary: Send or resend the current user's phone verification OTP
 *     security:
 *       - bearerAuth: []
 */
router.post('/phone-verification/request', authenticate, requestPhoneOtp);

/**
 * @openapi
 * /api/v1/auth/phone-verification/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify the current user's phone number with an OTP
 *     security:
 *       - bearerAuth: []
 */
router.post('/phone-verification/verify', authenticate, validate(verifyPhoneSchema), verifyPhoneOtp);

/**
 * @openapi
 * /api/v1/auth/password/forgot:
 *   post:
 *     tags: [Auth]
 *     summary: Start the password reset flow
 */
router.post('/password/forgot', validate(forgotPasswordSchema), requestPasswordReset);

/**
 * @openapi
 * /api/v1/auth/password/reset:
 *   post:
 *     tags: [Auth]
 *     summary: Reset a password with a single-use token
 */
router.post('/password/reset', validate(resetPasswordSchema), completePasswordReset);

/**
 * @openapi
 * /api/v1/auth/2fa/enroll:
 *   post:
 *     tags: [Auth]
 *     summary: Begin TOTP 2FA enrollment
 *     security:
 *       - bearerAuth: []
 */
router.post('/2fa/enroll', authenticate, startTwoFactorEnrollment);

/**
 * @openapi
 * /api/v1/auth/2fa/confirm:
 *   post:
 *     tags: [Auth]
 *     summary: Confirm TOTP 2FA enrollment with a valid code
 *     security:
 *       - bearerAuth: []
 */
router.post('/2fa/confirm', authenticate, validate(confirmTwoFactorSchema), confirmTwoFactorSetup);

/**
 * @openapi
 * /api/v1/auth/2fa/disable:
 *   post:
 *     tags: [Auth]
 *     summary: Disable TOTP 2FA
 *     security:
 *       - bearerAuth: []
 */
router.post('/2fa/disable', authenticate, validate(confirmTwoFactorSchema), turnOffTwoFactor);

/**
 * @openapi
 * /api/v1/auth/step-up:
 *   post:
 *     tags: [Auth]
 *     summary: Perform step-up authentication for a sensitive action
 *     security:
 *       - bearerAuth: []
 */
router.post('/step-up', authenticate, validate(createStepUpSchema), createStepUp);

export default router;
