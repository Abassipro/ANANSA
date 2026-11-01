import { describe, expect, it } from "vitest";
import { calculateReferralRank, parseReferralStartParam } from "../../server/src/domain/referrals.js";
import { consecutiveUtcDayStreak, isMissedUtcStreakDay } from "../../server/src/domain/streaks.js";
import { createTaskDefinitions } from "../../server/src/domain/tasks.js";
import {
  calculateDryRunAllocations,
} from "../../server/src/domain/settlement.js";
import {
  canTransitionWithdrawal,
  validateWithdrawalRequest,
  type WithdrawalStatus,
} from "../../server/src/domain/withdrawals.js";

describe("UTC check-in streak rules", () => {
  it("counts consecutive UTC dates across a month boundary", () => {
    expect(consecutiveUtcDayStreak(
      ["2025-03-01", "2025-02-28", "2025-02-27"],
      "2025-03-01",
    )).toBe(3);
  });

  it("allows a streak to continue through the previous UTC day before today's check-in", () => {
    expect(consecutiveUtcDayStreak(["2025-06-03", "2025-06-02"], "2025-06-04")).toBe(2);
    expect(consecutiveUtcDayStreak(["2025-06-02"], "2025-06-04")).toBe(0);
  });

  it("only identifies a broken streak after an actual missed UTC date", () => {
    expect(isMissedUtcStreakDay(["2025-06-02"], "2025-06-03")).toBe(false);
    expect(isMissedUtcStreakDay(["2025-06-01"], "2025-06-03")).toBe(true);
    expect(isMissedUtcStreakDay([], "2025-06-03")).toBe(false);
    expect(consecutiveUtcDayStreak(["2025-02-30"], "2025-03-01")).toBe(0);
  });
});

describe("server-validated referral rules", () => {
  it.each([
    [0, "Not ranked yet"],
    [10, "Bronze"],
    [49, "Bronze"],
    [50, "Silver"],
    [99, "Silver"],
    [100, "Gold"],
    [300, "Platinum"],
    [500, "Diamond"],
    [999, "Diamond"],
    [1000, "Elite Bronze"],
    [2500, "Elite Silver"],
    [4000, "Elite Gold"],
    [6000, "Elite Platinum"],
    [10000, "Global Apex"],
  ])("maps %i qualified referrals to the specified %s threshold", (count, expectedRank) => {
    expect(calculateReferralRank(count).name).toBe(expectedRank);
  });

  it("makes the overlapping 500–999 rank interval explicit", () => {
    expect(calculateReferralRank(700)).toMatchObject({
      name: "Diamond",
      category: "Pending confirmation",
      rangeDefinitionPending: true,
      nextTier: "Elite Bronze",
      nextTierThreshold: 1000,
    });
  });

  it("requires valid signed Telegram referral start parameters", () => {
    expect(parseReferralStartParam("ref_0123456789abcdef")).toBe("0123456789abcdef");
    expect(parseReferralStartParam(null)).toBeNull();
    expect(parseReferralStartParam("not-a-referral")).toBeNull();
    expect(parseReferralStartParam("ref_short")).toBeNull();
    expect(parseReferralStartParam("ref_../../admin")).toBeNull();
    expect(() => calculateReferralRank(-1)).toThrow(RangeError);
  });
});

describe("task providers and proposed rewards", () => {
  it("never treats a click or an unconfigured ad as a verified reward", () => {
    const tasks = createTaskDefinitions({
      follow_x: "https://x.com/verified-profile",
      telegram_channel: "http://insecure.invalid/",
    }, 50);

    expect(tasks.find((task) => task.id === "follow_x")?.destinationUrl).toBe("https://x.com/verified-profile");
    expect(tasks.find((task) => task.id === "telegram_channel")?.destinationUrl).toBeNull();
    expect(tasks.filter((task) => task.kind === "rewarded_ad").every((task) => task.verification === "provider_required")).toBe(true);
    expect(tasks.filter((task) => task.kind === "rewarded_ad").map((task) => task.proposedPoints)).toEqual([5, 10, 15, 20]);
    expect(tasks.find((task) => task.id === "daily_checkin")?.proposedPoints).toBe(50);
  });
});

describe("deterministic dry-run settlement arithmetic", () => {
  it("distributes the entire pool by explicitly supplied weights and stable remainders", () => {
    const result = calculateDryRunAllocations(10n, [
      { userId: "a", weight: 1n },
      { userId: "b", weight: 1n },
      { userId: "c", weight: 1n },
    ]);

    expect(result.map(({ userId, amountMinorUnits }) => [userId, amountMinorUnits])).toEqual([
      ["a", 4n],
      ["b", 3n],
      ["c", 3n],
    ]);
    expect(result.reduce((sum, item) => sum + item.amountMinorUnits, 0n)).toBe(10n);
  });

  it("handles zero pools without arbitrary allocations", () => {
    expect(calculateDryRunAllocations(0n, [{ userId: "a", weight: 10n }])[0]?.amountMinorUnits).toBe(0n);
    expect(calculateDryRunAllocations(5n, [])[0]).toBeUndefined();
  });

  it("rejects negative pools, zero weights, and duplicate participants", () => {
    expect(() => calculateDryRunAllocations(-1n, [])).toThrow(RangeError);
    expect(() => calculateDryRunAllocations(5n, [{ userId: "a", weight: 0n }])).toThrow(RangeError);
    expect(() => calculateDryRunAllocations(5n, [
      { userId: "a", weight: 1n },
      { userId: "a", weight: 2n },
    ])).toThrow(/unique/i);
  });
});

describe("withdrawal safety and state transitions", () => {
  const statuses: WithdrawalStatus[] = ["pending", "processing", "submitted", "confirmed", "failed", "cancelled"];

  it("allows only auditable forward withdrawal transitions", () => {
    expect(canTransitionWithdrawal("pending", "processing")).toBe(true);
    expect(canTransitionWithdrawal("processing", "submitted")).toBe(true);
    expect(canTransitionWithdrawal("submitted", "confirmed")).toBe(true);
    for (const status of ["confirmed", "failed", "cancelled"] as const) {
      for (const next of statuses) expect(canTransitionWithdrawal(status, next)).toBe(false);
    }
    expect(canTransitionWithdrawal("confirmed", "processing")).toBe(false);
  });

  it("keeps transfers disabled until an approved configured payout policy exists", () => {
    expect(() => validateWithdrawalRequest(10n, null, false)).toThrow(/unavailable/i);
    expect(() => validateWithdrawalRequest(10n, 10n, false)).toThrow(/unavailable/i);
    expect(() => validateWithdrawalRequest(10n, 10n, true)).not.toThrow();
    expect(() => validateWithdrawalRequest(0n, 10n, true)).toThrow(RangeError);
    expect(() => validateWithdrawalRequest(9n, 10n, true)).toThrow(RangeError);
  });
});
