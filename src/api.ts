import type { AccountSnapshot, PublicConfig, WithdrawalRecord } from "./types";
import type { TelegramRuntime } from "./main";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  runtime: TelegramRuntime,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (runtime.initData) headers.set("Authorization", `tma ${runtime.initData}`);

  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: "omit",
    cache: "no-store",
  });

  const result = await response.json().catch(() => ({})) as { error?: unknown } & T;
  if (!response.ok) {
    const message = typeof result.error === "string"
      ? result.error
      : `The request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return result;
}

export function loadPublicConfig(runtime: TelegramRuntime): Promise<PublicConfig> {
  return request<PublicConfig>("/config", runtime);
}

export function loadAccount(runtime: TelegramRuntime): Promise<AccountSnapshot> {
  if (!runtime.initData) {
    return Promise.reject(new ApiError("Open ABASSI through the configured Telegram bot to sign in.", 401));
  }
  return request<AccountSnapshot>("/me", runtime);
}

export function submitDailyCheckIn(runtime: TelegramRuntime): Promise<{
  claimed: true;
  awardedPoints: number;
  lifetimePoints: number;
  checkInDate: string;
}> {
  return request("/me/check-in", runtime, { method: "POST" });
}

export function submitSocialTask(
  runtime: TelegramRuntime,
  taskId: string,
): Promise<{
  submitted: boolean;
  status: "pending_verification" | "approved" | "rejected";
  rewardGranted: false;
}> {
  return request(`/me/tasks/${encodeURIComponent(taskId)}/submit`, runtime, { method: "POST" });
}

export interface PointsHistoryEntry {
  id: string;
  type: string;
  delta: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PointsHistoryPage {
  balance: number;
  entries: PointsHistoryEntry[];
  nextBefore: string | null;
}

export function loadPointsHistory(
  runtime: TelegramRuntime,
  before?: string | null,
): Promise<PointsHistoryPage> {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return request(`/me/points${query}`, runtime);
}

export interface RewardOverview {
  transferEnabled: false;
  claimableBalanceMinorUnits: null;
  minimumWithdrawalMinorUnits: null;
  networkFee: null;
  supportedPayoutAssets: [];
  weeklyStatus: "rules_pending";
  latestCycle: {
    starts_at: string;
    ends_at: string;
    status: string;
    policy_version: string;
    currency_code: string;
    dry_run_only: boolean;
  } | null;
  withdrawals: WithdrawalRecord[];
}

export function loadRewards(runtime: TelegramRuntime): Promise<RewardOverview> {
  return request<RewardOverview>("/me/rewards", runtime);
}
