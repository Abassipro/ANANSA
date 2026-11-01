import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "./config.js";

export interface VerifiedTelegramUser {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
}

export interface VerifiedTelegramInitData {
  user: VerifiedTelegramUser;
  startParam: string | null;
  authDate: number;
}

export class TelegramAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramAuthError";
  }
}

function equalHex(left: string, right: string): boolean {
  if (!/^[a-f\d]{64}$/i.test(left) || !/^[a-f\d]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function verifyTelegramInitData(
  rawInitData: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 3600,
): VerifiedTelegramInitData {
  if (!rawInitData || rawInitData.length > 16_384) {
    throw new TelegramAuthError("Telegram authorization data is missing or too large.");
  }

  const params = new URLSearchParams(rawInitData);
  const allEntries = [...params.entries()];
  const seenKeys = new Set<string>();
  for (const [key] of allEntries) {
    if (seenKeys.has(key)) {
      throw new TelegramAuthError("Telegram authorization data contains duplicate fields.");
    }
    seenKeys.add(key);
  }

  const hashValues = params.getAll("hash");
  const receivedHash = hashValues[0];
  if (!receivedHash || hashValues.length !== 1) {
    throw new TelegramAuthError("Telegram authorization signature is missing or duplicated.");
  }

  const entries = allEntries
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!equalHex(receivedHash, expectedHash)) {
    throw new TelegramAuthError("Telegram authorization signature is invalid.");
  }

  const authDateString = params.get("auth_date");
  if (!authDateString || !/^\d{1,12}$/.test(authDateString)) {
    throw new TelegramAuthError("Telegram authorization time is invalid.");
  }

  const authDate = Number(authDateString);
  const ageSeconds = nowSeconds - authDate;
  if (!Number.isSafeInteger(authDate) || ageSeconds < -30 || ageSeconds > maxAgeSeconds) {
    throw new TelegramAuthError("Telegram authorization data has expired.");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new TelegramAuthError("Telegram user identity is missing.");

  let parsedUser: unknown;
  try {
    parsedUser = JSON.parse(rawUser);
  } catch {
    throw new TelegramAuthError("Telegram user identity is malformed.");
  }

  if (typeof parsedUser !== "object" || parsedUser === null) {
    throw new TelegramAuthError("Telegram user identity is invalid.");
  }

  const user = parsedUser as Record<string, unknown>;
  if (!Number.isSafeInteger(user.id) || Number(user.id) < 1 || typeof user.first_name !== "string") {
    throw new TelegramAuthError("Telegram user identity is invalid.");
  }

  const photoUrl =
    typeof user.photo_url === "string" && isHttpsUrl(user.photo_url) ? user.photo_url : null;

  return {
    user: {
      id: String(user.id),
      firstName: user.first_name.slice(0, 128),
      lastName: typeof user.last_name === "string" ? user.last_name.slice(0, 128) : null,
      username: typeof user.username === "string" ? user.username.slice(0, 64) : null,
      photoUrl,
    },
    startParam: params.get("start_param"),
    authDate,
  };
}

export function verifyAuthorizationHeader(
  authorization: string | undefined,
  config: AppConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedTelegramInitData {
  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new Error("Telegram sign-in is not configured. Set TELEGRAM_BOT_TOKEN on the backend.");
  }
  if (!authorization?.startsWith("tma ")) {
    throw new TelegramAuthError("A valid Telegram Mini App authorization header is required.");
  }
  return verifyTelegramInitData(
    authorization.slice(4),
    config.TELEGRAM_BOT_TOKEN,
    nowSeconds,
    config.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS,
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
