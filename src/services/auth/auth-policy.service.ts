const FULLY_VERIFIED_BLOCKED_ACTIONS = [
  'brand.create',
  'brand.update',
  'brand.delete',
  'brand.transfer',
  'brand.rate',
  'branch.manage',
  'brand-media.upload',
  'team.manage',
] as const;

export interface VerificationSnapshot {
  email_verified: boolean;
  phone_verified: boolean;
}

export interface RestrictionState {
  code: 'verification_incomplete' | null;
  is_fully_verified: boolean;
  is_restricted: boolean;
  missing_verifications: Array<'email' | 'phone'>;
  blocked_actions: string[];
}

export const getRestrictionState = (
  snapshot: VerificationSnapshot,
): RestrictionState => {
  const missing_verifications: Array<'email' | 'phone'> = [];

  if (!snapshot.email_verified) {
    missing_verifications.push('email');
  }

  if (!snapshot.phone_verified) {
    missing_verifications.push('phone');
  }

  const is_fully_verified = missing_verifications.length === 0;

  return {
    code: is_fully_verified ? null : 'verification_incomplete',
    is_fully_verified,
    is_restricted: !is_fully_verified,
    missing_verifications,
    blocked_actions: is_fully_verified ? [] : [...FULLY_VERIFIED_BLOCKED_ACTIONS],
  };
};

export const isFullyVerified = (snapshot: VerificationSnapshot): boolean =>
  getRestrictionState(snapshot).is_fully_verified;
