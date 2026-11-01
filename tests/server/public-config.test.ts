import { describe, expect, it } from "vitest";
import { loadConfig, publicConfig } from "../../server/src/config.js";

describe("public configuration", () => {
  it("exposes only configured HTTPS links and never returns server credentials", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      TELEGRAM_BOT_TOKEN: "private-test-token",
      DATABASE_URL: "postgresql://private-user:private-password@example.test:5432/db",
      ADSGRAM_SERVER_POSTBACK_SECRET: "private-postback-secret",
      PUBLIC_URL_X: "https://social.example/abassi",
      PUBLIC_URL_TELEGRAM: "javascript:alert(1)",
      PUBLIC_URL_ANNOUNCEMENTS: "http://announcements.example",
      PUBLIC_URL_WEBSITE: "https://user:password@website.example",
      TASK_URL_DISCORD: "not a url",
      TASK_URL_INSTAGRAM: "https://instagram.example/abassi",
    });

    const result = publicConfig(config);
    expect(result.socialLinks).toEqual({
      x: "https://social.example/abassi",
      telegram: null,
      discord: null,
      facebook: null,
      instagram: "https://instagram.example/abassi",
      youtube: null,
      announcements: null,
      website: null,
    });
    expect(result.taskDestinations.discord).toBeNull();

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("private-test-token");
    expect(serialized).not.toContain("private-password");
    expect(serialized).not.toContain("private-postback-secret");
  });
});
