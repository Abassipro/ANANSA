import { isAdsgramRewardedCompletion, type AdsgramShowResult } from "./adsgram-result.js";

export { isAdsgramRewardedCompletion } from "./adsgram-result.js";

interface AdsgramController {
  show(): Promise<AdsgramShowResult>;
}

interface AdsgramApi {
  init(options: { blockId: string }): AdsgramController;
}

declare global {
  interface Window {
    Adsgram?: AdsgramApi;
  }
}

let sdkPromise: Promise<AdsgramApi> | null = null;
const controllers = new Map<string, AdsgramController>();

export async function showAdsgramRewardedAd(blockId: string): Promise<AdsgramShowResult> {
  if (!/^[0-9]+$/.test(blockId)) {
    throw new TypeError("A valid AdsGram block ID is required.");
  }

  const sdk = await loadAdsgramSdk();
  let controller = controllers.get(blockId);
  if (!controller) {
    controller = sdk.init({ blockId });
    controllers.set(blockId, controller);
  }

  const result = await controller.show();
  if (!isAdsgramRewardedCompletion(result)) {
    throw new Error(result.description || "The rewarded ad was not completed.");
  }
  return result;
}

function loadAdsgramSdk(): Promise<AdsgramApi> {
  if (window.Adsgram) return Promise.resolve(window.Adsgram);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<AdsgramApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sad.adsgram.ai/js/sad.min.js";
    script.async = true;
    script.dataset.adsgramSdk = "true";
    script.onload = () => {
      if (window.Adsgram) {
        resolve(window.Adsgram);
      } else {
        sdkPromise = null;
        reject(new Error("AdsGram loaded without exposing its SDK."));
      }
    };
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("The AdsGram SDK could not be loaded."));
    };
    document.head.append(script);
  });

  return sdkPromise;
}
