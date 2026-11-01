export interface ReferralTier {
  name: string;
  minimum: number;
  maximum: number | null;
  category: "Micro-influencer" | "Influencer";
}

export const REFERRAL_TIERS: readonly ReferralTier[] = [
  { name: "Bronze", minimum: 10, maximum: 49, category: "Micro-influencer" },
  { name: "Silver", minimum: 50, maximum: 99, category: "Micro-influencer" },
  { name: "Gold", minimum: 100, maximum: 299, category: "Micro-influencer" },
  { name: "Platinum", minimum: 300, maximum: 499, category: "Micro-influencer" },
  { name: "Diamond", minimum: 500, maximum: null, category: "Micro-influencer" },
  { name: "Elite Bronze", minimum: 1000, maximum: 2499, category: "Influencer" },
  { name: "Elite Silver", minimum: 2500, maximum: 3999, category: "Influencer" },
  { name: "Elite Gold", minimum: 4000, maximum: 5999, category: "Influencer" },
  { name: "Elite Platinum", minimum: 6000, maximum: 9999, category: "Influencer" },
  { name: "Global Apex", minimum: 10000, maximum: null, category: "Influencer" },
];

export interface ReferralRank {
  name: string;
  category: ReferralTier["category"] | "Pending confirmation";
  minimumQualifiedInvites: number | null;
  qualifiedInviteCount: number;
  nextTier: string | null;
  nextTierThreshold: number | null;
  progressPercent: number | null;
  rangeDefinitionPending: boolean;
  weeklyPoolMinimumMet: boolean;
}

export function calculateReferralRank(qualifiedInviteCount: number): ReferralRank {
  if (!Number.isSafeInteger(qualifiedInviteCount) || qualifiedInviteCount < 0) {
    throw new RangeError("Qualified referral count must be a non-negative safe integer.");
  }

  const current = [...REFERRAL_TIERS].reverse().find((tier) => qualifiedInviteCount >= tier.minimum);
  const next = REFERRAL_TIERS.find((tier) => tier.minimum > qualifiedInviteCount) ?? null;

  if (!current) {
    return {
      name: "Not ranked yet",
      category: "Micro-influencer",
      minimumQualifiedInvites: 10,
      qualifiedInviteCount,
      nextTier: "Bronze",
      nextTierThreshold: 10,
      progressPercent: Math.min(100, (qualifiedInviteCount / 10) * 100),
      rangeDefinitionPending: false,
      weeklyPoolMinimumMet: qualifiedInviteCount >= 10,
    };
  }

  const denominator = next ? next.minimum - current.minimum : null;
  const progressPercent = denominator
    ? Math.min(100, ((qualifiedInviteCount - current.minimum + 1) / denominator) * 100)
    : null;
  const overlapsUnconfirmedGap =
    current.name === "Diamond" && qualifiedInviteCount < 1000;

  return {
    name: current.name,
    category: overlapsUnconfirmedGap ? "Pending confirmation" : current.category,
    minimumQualifiedInvites: current.minimum,
    qualifiedInviteCount,
    nextTier: next?.name ?? null,
    nextTierThreshold: next?.minimum ?? null,
    progressPercent,
    rangeDefinitionPending: overlapsUnconfirmedGap,
    weeklyPoolMinimumMet: qualifiedInviteCount >= 10,
  };
}

export function parseReferralStartParam(startParam: string | null): string | null {
  if (!startParam) return null;
  const match = /^ref_([A-Za-z0-9_-]{8,64})$/.exec(startParam);
  return match?.[1] ?? null;
}
