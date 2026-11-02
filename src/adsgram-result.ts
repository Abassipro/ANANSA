export interface AdsgramShowResult {
  done: boolean;
  description: string;
  state: "load" | "render" | "playing" | "destroy";
  error: boolean;
}

export function isAdsgramRewardedCompletion(result: AdsgramShowResult): boolean {
  return result.done && !result.error;
}

export async function requireAdsgramRewardedCompletion(
  show: () => Promise<AdsgramShowResult>,
): Promise<AdsgramShowResult> {
  const result = await show();
  if (!isAdsgramRewardedCompletion(result)) {
    throw new Error(result.description || "The rewarded ad was not completed.");
  }
  return result;
}
