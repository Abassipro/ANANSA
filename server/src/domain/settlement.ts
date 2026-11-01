export interface SettlementParticipant {
  userId: string;
  weight: bigint;
}

export interface SettlementAllocation {
  userId: string;
  weight: bigint;
  amountMinorUnits: bigint;
  remainder: bigint;
}

export function calculateDryRunAllocations(
  poolMinorUnits: bigint,
  participants: readonly SettlementParticipant[],
): SettlementAllocation[] {
  if (poolMinorUnits < 0n) throw new RangeError("The settlement pool cannot be negative.");
  if (new Set(participants.map(({ userId }) => userId)).size !== participants.length) {
    throw new RangeError("Settlement participants must have unique user identifiers.");
  }
  if (participants.some(({ weight }) => weight <= 0n)) {
    throw new RangeError("Settlement weights must be positive integers.");
  }

  const totalWeight = participants.reduce((sum, item) => sum + item.weight, 0n);
  if (totalWeight === 0n || poolMinorUnits === 0n) {
    return participants.map(({ userId, weight }) => ({
      userId,
      weight,
      amountMinorUnits: 0n,
      remainder: 0n,
    }));
  }

  const allocations = participants.map(({ userId, weight }) => {
    const weightedAmount = poolMinorUnits * weight;
    return {
      userId,
      weight,
      amountMinorUnits: weightedAmount / totalWeight,
      remainder: weightedAmount % totalWeight,
    };
  });

  let unallocated = poolMinorUnits -
    allocations.reduce((sum, allocation) => sum + allocation.amountMinorUnits, 0n);
  const remainderOrder = [...allocations].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.userId.localeCompare(right.userId);
  });

  for (const allocation of remainderOrder) {
    if (unallocated === 0n) break;
    const original = allocations.find((candidate) => candidate.userId === allocation.userId);
    if (original) {
      original.amountMinorUnits += 1n;
      unallocated -= 1n;
    }
  }

  return allocations.sort((left, right) => left.userId.localeCompare(right.userId));
}
