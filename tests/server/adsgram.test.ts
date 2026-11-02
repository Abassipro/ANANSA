import { describe, expect, it } from "vitest";
import {
  isAdsgramRewardedCompletion,
  requireAdsgramRewardedCompletion,
} from "../../src/adsgram-result.js";
import { loadConfig, publicConfig } from "../../server/src/config.js";

describe("AdsGram rewarded ad configuration", () => {
  it("only exposes a numeric block ID when AdsGram is explicitly enabled", () => {
    const disabled = publicConfig(loadConfig({
      NODE_ENV: "test",
      ADSGRAM_ENABLED: "false",
      ADSGRAM_BLOCK_ID: "123456",
    }));
    const enabled = publicConfig(loadConfig({
      NODE_ENV: "test",
      ADSGRAM_ENABLED: "true",
      ADSGRAM_BLOCK_ID: "123456",
      ADSGRAM_SERVER_POSTBACK_SECRET: "server-only-test-secret",
    }));
    const invalid = publicConfig(loadConfig({
      NODE_ENV: "test",
      ADSGRAM_ENABLED: "true",
      ADSGRAM_BLOCK_ID: "invalid-id",
    }));

    expect(disabled.adsgramBlockId).toBeNull();
    expect(enabled.adsgramBlockId).toBe("123456");
    expect(invalid.adsgramBlockId).toBeNull();
    expect(enabled.adsConfigured).toBe(false);
    expect(JSON.stringify(enabled)).not.toContain("server-only-test-secret");
  });

  it("accepts only successful non-error SDK completion results", () => {
    expect(isAdsgramRewardedCompletion({
      done: true,
      description: "completed",
      state: "destroy",
      error: false,
    })).toBe(true);
    expect(isAdsgramRewardedCompletion({
      done: false,
      description: "skipped",
      state: "destroy",
      error: false,
    })).toBe(false);
    expect(isAdsgramRewardedCompletion({
      done: true,
      description: "error",
      state: "destroy",
      error: true,
    })).toBe(false);
  });

  it("rejects skipped ads and SDK-reported failures", async () => {
    const skipped = {
      done: false,
      description: "skipped",
      state: "destroy" as const,
      error: false,
    };
    const failed = {
      done: true,
      description: "provider error",
      state: "destroy" as const,
      error: true,
    };

    await expect(requireAdsgramRewardedCompletion(async () => skipped))
      .rejects.toThrow("skipped");
    await expect(requireAdsgramRewardedCompletion(async () => failed))
      .rejects.toThrow("provider error");
    await expect(requireAdsgramRewardedCompletion(async () => {
      throw new Error("SDK request failed");
    })).rejects.toThrow("SDK request failed");
  });
});
