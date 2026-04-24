import test from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import {
  buildBrandSlotSnapshot,
  isBrandSlotEntitlementActive,
} from '../services/brand-slot.service';
import { buildBrandResubmissionPatch } from '../services/brand-moderation.service';
import { hasCompletedReservationEligibility } from '../services/brand-rating-eligibility.service';
import { createBrandSchema } from '../schemas/brand.schema';

test('brand slot snapshot includes the free slot and active entitlement slots only', () => {
  const now = new Date('2026-04-25T12:00:00.000Z');

  const snapshot = buildBrandSlotSnapshot(
    2,
    [
      {
        additional_slots: 2,
        status: 'ACTIVE',
        starts_at: new Date('2026-04-01T00:00:00.000Z'),
        ends_at: new Date('2026-05-01T00:00:00.000Z'),
      },
      {
        additional_slots: 3,
        status: 'REVOKED',
        starts_at: null,
        ends_at: null,
      },
    ],
    now,
  );

  assert.equal(snapshot.free_slots, 1);
  assert.equal(snapshot.entitlement_slots, 2);
  assert.equal(snapshot.total_slots, 3);
  assert.equal(snapshot.used_slots, 2);
  assert.equal(snapshot.remaining_slots, 1);
  assert.equal(snapshot.has_available_slot, true);
});

test('brand slot entitlements must be active and within their validity window', () => {
  const now = new Date('2026-04-25T12:00:00.000Z');

  assert.equal(
    isBrandSlotEntitlementActive(
      {
        additional_slots: 1,
        status: 'ACTIVE',
        starts_at: new Date('2026-04-26T00:00:00.000Z'),
        ends_at: null,
      },
      now,
    ),
    false,
  );

  assert.equal(
    isBrandSlotEntitlementActive(
      {
        additional_slots: 1,
        status: 'ACTIVE',
        starts_at: null,
        ends_at: new Date('2026-04-24T23:59:59.000Z'),
      },
      now,
    ),
    false,
  );
});

test('editing a rejected brand produces a resubmission moderation reset patch', () => {
  const now = new Date('2026-04-25T12:00:00.000Z');

  assert.deepEqual(buildBrandResubmissionPatch('ACTIVE', now), {});
  assert.deepEqual(buildBrandResubmissionPatch('REJECTED', now), {
    status: 'PENDING',
    submitted_for_review_at: now,
    moderation_reviewed_at: null,
    moderation_rejection_reason: null,
    moderation_reviewer: { disconnect: true },
  });
});

test('brand rating eligibility requires a completed reservation marker', () => {
  assert.equal(hasCompletedReservationEligibility(null), false);
  assert.equal(
    hasCompletedReservationEligibility({
      completed_at: new Date('2026-04-24T12:00:00.000Z'),
    }),
    true,
  );
});

test('creating a brand requires at least one branch', () => {
  assert.throws(
    () =>
      createBrandSchema.parse({
        name: 'Reziphay',
        branches: [],
      }),
    (error: unknown) =>
      error instanceof ZodError &&
      error.issues.some(
        (issue) => issue.path.join('.') === 'branches' && issue.message === 'At least one branch is required',
      ),
  );
});

test('creating a brand accepts website, social links, and rich branch payloads', () => {
  const parsed = createBrandSchema.parse({
    name: 'Reziphay',
    website_url: 'https://reziphay.example',
    social_links: {
      instagram: 'https://instagram.com/reziphay',
      tiktok: 'https://www.tiktok.com/@reziphay',
    },
    branches: [
      {
        name: 'Downtown',
        address1: '123 Main Street',
        city: 'Baku',
        country: 'Azerbaijan',
        opening: '09:00',
        closing: '18:00',
        interior_media_ids: ['ck1234567890123456789012'],
      },
    ],
  });

  assert.equal(parsed.website_url, 'https://reziphay.example');
  assert.equal(parsed.social_links?.instagram, 'https://instagram.com/reziphay');
  assert.equal(parsed.branches[0]?.city, 'Baku');
  assert.deepEqual(parsed.branches[0]?.interior_media_ids, ['ck1234567890123456789012']);
});
