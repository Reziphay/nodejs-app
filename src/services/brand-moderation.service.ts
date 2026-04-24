export type BrandStatusLike = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'CLOSED';

export interface BrandModerationResetPatch {
  status?: 'PENDING';
  submitted_for_review_at?: Date;
  moderation_reviewed_at?: null;
  moderation_rejection_reason?: null;
  moderation_reviewer?: { disconnect: true };
}

export function buildBrandResubmissionPatch(
  currentStatus: BrandStatusLike,
  now: Date = new Date(),
): BrandModerationResetPatch {
  if (currentStatus !== 'REJECTED') {
    return {};
  }

  return {
    status: 'PENDING',
    submitted_for_review_at: now,
    moderation_reviewed_at: null,
    moderation_rejection_reason: null,
    moderation_reviewer: { disconnect: true },
  };
}
