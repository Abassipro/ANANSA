import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../server/src/config.js";
import { TelegramAuthError, verifyAuthorizationHeader, verifyTelegramInitData } from "../../server/src/telegram-auth.js";

const BOT_TOKEN = "123456789:TEST_ONLY_NOT_A_REAL_TELEGRAM_BOT_TOKEN";
const USER = JSON.stringify({
  id: 123456789,
  first_name: "Abassi",
  username: "community_test",
});

function signedInitData(
  overrides: Record<string, string> = {},
  nowSeconds = 1_700_000_000,
): string {
  const params = new URLSearchParams({
    auth_date: String(nowSeconds),
    query_id: "test-query-id",
    start_param: "ref_0123456789abcdef",
    user: USER,
    ...overrides,
  });
  params.sort();
  const key = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", key)
    .update([...params].map(([name, value]) => `${name}=${value}`).join("\n"))
    .digest("hex");
  params.set("hash", hash);
  return params.toString();
}

describe("Telegram initData verification", () => {
  it("accepts the exact signed user and start parameter", () => {
    const result = verifyTelegramInitData(
      signedInitData(),
      BOT_TOKEN,
      1_700_000_020,
      300,
    );

    expect(result.user).toMatchObject({
      id: "123456789",
      firstName: "Abassi",
      username: "community_test",
    });
    expect(result.startParam).toBe("ref_0123456789abcdef");
  });

  it("rejects altered signed fields and malformed signatures", () => {
    const original = signedInitData();
    const altered = new URLSearchParams(original);
    altered.set("user", JSON.stringify({ id: 2222222, first_name: "Impersonator" }));

    expect(() => verifyTelegramInitData(altered.toString(), BOT_TOKEN, 1_700_000_020)).toThrow(TelegramAuthError);
    expect(() => verifyTelegramInitData(`${original}&hash=00`, BOT_TOKEN, 1_700_000_020)).toThrow(TelegramAuthError);
  });

  it("rejects expired, future-dated, duplicate, and malformed identity data", () => {
    expect(() => verifyTelegramInitData(signedInitData(), BOT_TOKEN, 1_700_004_000, 300)).toThrow(/expired/i);
    expect(() => verifyTelegramInitData(signedInitData(), BOT_TOKEN, 1_699_999_900, 300)).toThrow(/expired/i);
    expect(() => verifyTelegramInitData(`${signedInitData()}&user=%7B%7D`, BOT_TOKEN, 1_700_000_020)).toThrow(/duplicate/i);

    const badUserData = signedInitData({ user: JSON.stringify({ id: Number.MAX_SAFE_INTEGER + 1, first_name: "X" }) });
    expect(() => verifyTelegramInitData(badUserData, BOT_TOKEN, 1_700_000_020)).toThrow(/identity/i);
  });

  it("discards non-HTTPS Telegram profile images", () => {
    const result = verifyTelegramInitData(
      signedInitData({ user: JSON.stringify({ id: 99, first_name: "A", photo_url: "http://not-secure.invalid/avatar" }) }),
      BOT_TOKEN,
      1_700_000_020,
    );
    expect(result.user.photoUrl).toBeNull();
  });

  it("uses server-configured bot credentials and requires signed authorization", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      TELEGRAM_BOT_TOKEN: BOT_TOKEN,
      TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: "300",
    });

    expect(verifyAuthorizationHeader(`tma ${signedInitData()}`, config, 1_700_000_020).user.id).toBe("123456789");
    expect(() => verifyAuthorizationHeader("tma not-init-data", config, 1_700_000_020)).toThrow(TelegramAuthError);
    expect(() => verifyAuthorizationHeader(undefined, loadConfig({ NODE_ENV: "test" }), 1_700_000_020)).toThrow(/not configured/i);
  });
});
