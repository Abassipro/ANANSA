export type WithdrawalStatus =
  | "pending"
  | "processing"
  | "submitted"
  | "confirmed"
  | "failed"
  | "cancelled";

const ALLOWED_TRANSITIONS: Readonly<Record<WithdrawalStatus, readonly WithdrawalStatus[]>> = {
  pending: ["processing", "cancelled", "failed"],
  processing: ["submitted", "failed", "cancelled"],
  submitted: ["confirmed", "failed"],
  confirmed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionWithdrawal(
  previous: WithdrawalStatus,
  next: WithdrawalStatus,
): boolean {
  return ALLOWED_TRANSITIONS[previous].includes(next);
}

export function validateWithdrawalRequest(
  amountMinorUnits: bigint,
  minimumMinorUnits: bigint | null,
  policyApproved: boolean,
): void {
  if (!policyApproved || minimumMinorUnits === null) {
    throw new Error("Withdrawals are unavailable until payout rules and funding are approved.");
  }
  if (amountMinorUnits <= 0n) {
    throw new RangeError("Withdrawal amount must be greater than zero.");
  }
  if (amountMinorUnits < minimumMinorUnits) {
    throw new RangeError("Withdrawal amount is below the configured minimum.");
  }
}
