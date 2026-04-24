import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canResendChallenge,
  isChallengeActive,
} from '../services/auth/auth-challenge.service';
import { getRestrictionState } from '../services/auth/auth-policy.service';
import {
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from '../services/auth/totp.service';

test('restriction state blocks non-user actions until email and phone are verified', () => {
  const state = getRestrictionState({
    email_verified: false,
    phone_verified: true,
  });

  assert.equal(state.is_fully_verified, false);
  assert.equal(state.is_restricted, true);
  assert.deepEqual(state.missing_verifications, ['email']);
  assert.ok(state.blocked_actions.includes('brand.create'));
});

test('restriction state clears once both verification flags are true', () => {
  const state = getRestrictionState({
    email_verified: true,
    phone_verified: true,
  });

  assert.equal(state.code, null);
  assert.equal(state.is_fully_verified, true);
  assert.deepEqual(state.blocked_actions, []);
});

test('challenge activity treats used or expired challenges as invalid', () => {
  const now = new Date('2026-04-25T12:00:00.000Z');

  assert.equal(
    isChallengeActive({
      used_at: null,
      expires_at: new Date('2026-04-25T12:05:00.000Z'),
    }, now),
    true,
  );

  assert.equal(
    isChallengeActive({
      used_at: new Date('2026-04-25T12:01:00.000Z'),
      expires_at: new Date('2026-04-25T12:05:00.000Z'),
    }, now),
    false,
  );

  assert.equal(
    isChallengeActive({
      used_at: null,
      expires_at: new Date('2026-04-25T11:59:59.000Z'),
    }, now),
    false,
  );
});

test('challenge resend policy enforces cooldowns and delivery caps', () => {
  const now = new Date('2026-04-25T12:00:00.000Z');

  assert.deepEqual(
    canResendChallenge({
      used_at: null,
      expires_at: new Date('2026-04-25T12:05:00.000Z'),
      delivery_count: 1,
      last_sent_at: new Date('2026-04-25T11:59:30.000Z'),
    }, now, 60_000, 5),
    { allowed: false, reason: 'too_soon' },
  );

  assert.deepEqual(
    canResendChallenge({
      used_at: null,
      expires_at: new Date('2026-04-25T12:05:00.000Z'),
      delivery_count: 5,
      last_sent_at: new Date('2026-04-25T11:58:00.000Z'),
    }, now, 60_000, 5),
    { allowed: false, reason: 'too_many_requests' },
  );

  assert.deepEqual(
    canResendChallenge({
      used_at: null,
      expires_at: new Date('2026-04-25T11:50:00.000Z'),
      delivery_count: 5,
      last_sent_at: new Date('2026-04-25T11:58:00.000Z'),
    }, now, 60_000, 5),
    { allowed: true, reason: null },
  );
});

test('TOTP codes verify for the correct secret and fail for the wrong code', () => {
  const secret = generateTotpSecret();
  const now = new Date('2026-04-25T12:00:00.000Z').getTime();
  const validCode = generateTotpCode(secret, now);

  assert.equal(verifyTotpCode(secret, validCode, now), true);
  assert.equal(verifyTotpCode(secret, '000000', now), false);
});
