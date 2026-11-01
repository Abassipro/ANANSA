export type TaskKind = "social" | "rewarded_ad" | "daily_checkin";

export interface TaskDefinition {
  id: string;
  kind: TaskKind;
  title: string;
  description: string;
  proposedPoints: number;
  destinationUrl: string | null;
  verification: "provider_required" | "server_checkin";
  frequency: "once" | "daily";
}

export function createTaskDefinitions(
  destinations: Record<string, string | null>,
  checkInPoints: number,
): TaskDefinition[] {
  const socialTasks: Omit<TaskDefinition, "destinationUrl">[] = [
    { id: "follow_x", kind: "social", title: "Follow ABASSI on X", description: "Stay up to date with official project announcements.", proposedPoints: 20, verification: "provider_required", frequency: "once" },
    { id: "telegram_channel", kind: "social", title: "Subscribe to the Telegram channel", description: "Join the official community channel.", proposedPoints: 20, verification: "provider_required", frequency: "once" },
    { id: "join_discord", kind: "social", title: "Join the ABASSI Discord", description: "Meet the community and take part in the conversation.", proposedPoints: 15, verification: "provider_required", frequency: "once" },
    { id: "follow_facebook", kind: "social", title: "Follow on Facebook", description: "Follow the official ABASSI page.", proposedPoints: 20, verification: "provider_required", frequency: "once" },
    { id: "follow_instagram", kind: "social", title: "Follow on Instagram", description: "Follow the official ABASSI account.", proposedPoints: 20, verification: "provider_required", frequency: "once" },
    { id: "subscribe_youtube", kind: "social", title: "Subscribe on YouTube", description: "Follow the project video updates.", proposedPoints: 20, verification: "provider_required", frequency: "once" },
    { id: "engage_x_post", kind: "social", title: "Engage with an X post", description: "Interact with a verified ABASSI community post.", proposedPoints: 30, verification: "provider_required", frequency: "once" },
  ];

  const configuredTasks = socialTasks.map((task) => ({
    ...task,
    destinationUrl: safeHttpsUrl(destinations[task.id] ?? null),
  }));

  return [
    {
      id: "daily_checkin",
      kind: "daily_checkin",
      title: "Daily check-in",
      description: "Check in once per UTC day to keep your daily streak active.",
      proposedPoints: checkInPoints,
      destinationUrl: null,
      verification: "server_checkin",
      frequency: "daily",
    },
    ...configuredTasks,
    ...[5, 10, 15, 20].map((points, index) => ({
      id: `rewarded_ad_${points}`,
      kind: "rewarded_ad" as const,
      title: `Watch a rewarded ad · ${["I", "II", "III", "IV"][index]}`,
      description: "A reward will only be available after a verified provider completion.",
      proposedPoints: points,
      destinationUrl: null,
      verification: "provider_required" as const,
      frequency: "daily" as const,
    })),
  ];
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}
