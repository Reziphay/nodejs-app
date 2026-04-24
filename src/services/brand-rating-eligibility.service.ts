export type BrandRatingEligibilityLike = {
  completed_at: Date;
};

export function hasCompletedReservationEligibility(
  eligibility: BrandRatingEligibilityLike | null,
): boolean {
  return eligibility !== null;
}
