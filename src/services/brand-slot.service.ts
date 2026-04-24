export const FREE_BRAND_SLOT_COUNT = 1;

export type BrandSlotEntitlementLike = {
  additional_slots: number;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  starts_at: Date | null;
  ends_at: Date | null;
};

export interface BrandSlotSnapshot {
  free_slots: number;
  entitlement_slots: number;
  total_slots: number;
  used_slots: number;
  remaining_slots: number;
  has_available_slot: boolean;
}

export function isBrandSlotEntitlementActive(
  entitlement: BrandSlotEntitlementLike,
  now: Date = new Date(),
): boolean {
  if (entitlement.status !== 'ACTIVE') return false;
  if (entitlement.additional_slots <= 0) return false;
  if (entitlement.starts_at && entitlement.starts_at > now) return false;
  if (entitlement.ends_at && entitlement.ends_at < now) return false;
  return true;
}

export function calculateEntitlementBrandSlots(
  entitlements: BrandSlotEntitlementLike[],
  now: Date = new Date(),
): number {
  return entitlements.reduce((sum, entitlement) => {
    if (!isBrandSlotEntitlementActive(entitlement, now)) {
      return sum;
    }

    return sum + entitlement.additional_slots;
  }, 0);
}

export function buildBrandSlotSnapshot(
  ownedBrandCount: number,
  entitlements: BrandSlotEntitlementLike[],
  now: Date = new Date(),
  freeSlots: number = FREE_BRAND_SLOT_COUNT,
): BrandSlotSnapshot {
  const entitlementSlots = calculateEntitlementBrandSlots(entitlements, now);
  const totalSlots = freeSlots + entitlementSlots;
  const remainingSlots = Math.max(totalSlots - ownedBrandCount, 0);

  return {
    free_slots: freeSlots,
    entitlement_slots: entitlementSlots,
    total_slots: totalSlots,
    used_slots: ownedBrandCount,
    remaining_slots: remainingSlots,
    has_available_slot: ownedBrandCount < totalSlots,
  };
}
