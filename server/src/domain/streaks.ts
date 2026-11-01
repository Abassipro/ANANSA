export function consecutiveUtcDayStreak(
  sortedDatesDescending: readonly string[],
  today: string,
): number {
  if (sortedDatesDescending.length === 0 || !isValidDate(today)) return 0;

  const todayOrdinal = utcDayOrdinal(today);
  const firstOrdinal = utcDayOrdinal(sortedDatesDescending[0] ?? "");
  if (firstOrdinal === null || todayOrdinal === null) return 0;
  if (todayOrdinal - firstOrdinal > 1) return 0;

  let streak = 1;
  let previousOrdinal = firstOrdinal;
  for (const date of sortedDatesDescending.slice(1)) {
    const ordinal = utcDayOrdinal(date);
    if (ordinal === null || previousOrdinal - ordinal !== 1) break;
    streak += 1;
    previousOrdinal = ordinal;
  }
  return streak;
}

export function isMissedUtcStreakDay(
  sortedDatesDescending: readonly string[],
  today: string,
): boolean {
  if (sortedDatesDescending.length === 0) return false;
  const latestOrdinal = utcDayOrdinal(sortedDatesDescending[0] ?? "");
  const todayOrdinal = utcDayOrdinal(today);
  return latestOrdinal !== null && todayOrdinal !== null && todayOrdinal - latestOrdinal > 1;
}

export function utcDayOrdinal(date: string): number | null {
  if (!isValidDate(date)) return null;
  const [yearText, monthText, dayText] = date.split("-");
  return Math.floor(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)) / 86_400_000);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
