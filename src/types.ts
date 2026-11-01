export type TaskKind = "social" | "rewarded_ad" | "daily_checkin";
export type TaskFilter = "all" | "daily" | "social" | "ads";

export interface TaskDefinition {
  id: string;
  kind: TaskKind;
  title: string;
  description: string;
  proposedPoints: number;
  destinationUrl: string | null;
  verification: "provider_required" | "server_checkin";
  frequency: "once" | "daily";
  enabled: boolean;
}

export interface ReferralRank {
  name: string;
  category: "Micro-influencer" | "Influencer" | "Pending confirmation";
  minimumQualifiedInvites: number | null;
  qualifiedInviteCount: number;
  nextTier: string | null;
  nextTierThreshold: number | null;
  progressPercent: number | null;
  rangeDefinitionPending: boolean;
  weeklyPoolMinimumMet: boolean;
}

export interface AccountSnapshot {
  authenticated: true;
  user: {
    id: string;
    username: string | null;
    displayName: string;
    photoUrl: string | null;
    referralCode: string;
    points: number;
    createdAt: string;
  };
  referrals: {
    invited: number;
    qualified: number;
    rank: ReferralRank;
  };
  recentCheckInDates: string[];
  taskStatuses: Record<string, "pending_verification" | "approved" | "rejected">;
  streak: number;
  streakBroken: boolean;
  todaysCheckIn: boolean;
  currentWeekCheckIns: number;
}

export interface PublicConfig {
  telegramConfigured: boolean;
  botUsername: string | null;
  databaseConfigured: boolean;
  checkInEnabled: boolean;
  checkInPoints: number;
  chain: string;
  network: string;
  walletConfigured: false;
  adsConfigured: false;
  payoutsEnabled: false;
  revenueShareEnabled: false;
  shareRewardEnabled: false;
  taskDestinations: Record<string, string | null>;
  socialLinks: {
    x: string | null;
    telegram: string | null;
    discord: string | null;
    facebook: string | null;
    instagram: string | null;
    youtube: string | null;
    announcements: string | null;
    website: string | null;
  };
  tasks: TaskDefinition[];
}

export interface WithdrawalRecord {
  id: string;
  amountMinorUnits: string;
  asset: string;
  status: "pending" | "processing" | "submitted" | "confirmed" | "failed" | "cancelled";
  transactionHash: string | null;
  createdAt: string;
}
