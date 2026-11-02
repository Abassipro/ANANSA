export interface AdsgramShowResult {
  done: boolean;
  description: string;
  state: "load" | "render" | "playing" | "destroy";
  error: boolean;
}

export function isAdsgramRewardedCompletion(result: AdsgramShowResult): boolean {
  return result.done && !result.error;
}
