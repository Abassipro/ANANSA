import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  APP_ORIGIN: z.string().url().default("http://127.0.0.1:5173"),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "must be a PostgreSQL connection string, not a Supabase project URL",
    )
    .optional()
    .or(z.literal("")),
  DATABASE_SSL: z.stringbool().default(true),
  DATABASE_CA_CERT_PATH: z.string().trim().min(1).optional().or(z.literal("")),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/).optional(),
  TELEGRAM_INIT_DATA_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  DAILY_CHECKIN_ENABLED: z.stringbool().default(false),
  DAILY_CHECKIN_POINTS: z.coerce.number().int().min(1).max(10000).default(50),
  TASK_URL_X_FOLLOW: z.string().optional().or(z.literal("")),
  TASK_URL_TELEGRAM_CHANNEL: z.string().optional().or(z.literal("")),
  TASK_URL_DISCORD: z.string().optional().or(z.literal("")),
  TASK_URL_FACEBOOK: z.string().optional().or(z.literal("")),
  TASK_URL_INSTAGRAM: z.string().optional().or(z.literal("")),
  TASK_URL_YOUTUBE: z.string().optional().or(z.literal("")),
  TASK_URL_X_POST: z.string().optional().or(z.literal("")),
  PUBLIC_URL_X: z.string().optional().or(z.literal("")),
  PUBLIC_URL_TELEGRAM: z.string().optional().or(z.literal("")),
  PUBLIC_URL_ANNOUNCEMENTS: z.string().optional().or(z.literal("")),
  PUBLIC_URL_WEBSITE: z.string().optional().or(z.literal("")),
  ADSGRAM_ENABLED: z.stringbool().default(false),
  ADSGRAM_BLOCK_ID: z.string().optional(),
  ADSGRAM_SERVER_POSTBACK_SECRET: z.string().optional(),
  WALLET_CHAIN: z.string().default("unconfigured"),
  WALLET_NETWORK: z.string().default("unconfigured"),
  PAYOUTS_ENABLED: z.stringbool().default(false),
  REVENUE_SHARE_ENABLED: z.stringbool().default(false),
  SHARE_REWARD_ENABLED: z.stringbool().default(false),
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid application configuration: ${detail}`);
  }
  return parsed.data;
}

export function publicConfig(config: AppConfig) {
  const destinationUrls = {
    followX: config.TASK_URL_X_FOLLOW,
    telegramChannel: config.TASK_URL_TELEGRAM_CHANNEL,
    discord: config.TASK_URL_DISCORD,
    facebook: config.TASK_URL_FACEBOOK,
    instagram: config.TASK_URL_INSTAGRAM,
    youtube: config.TASK_URL_YOUTUBE,
    xPost: config.TASK_URL_X_POST,
  };
  const taskDestinations = Object.fromEntries(
    Object.entries(destinationUrls).map(([id, value]) => [id, safePublicHttpsUrl(value)]),
  );

  return {
    telegramConfigured: Boolean(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_BOT_USERNAME),
    botUsername: config.TELEGRAM_BOT_USERNAME || null,
    databaseConfigured: Boolean(config.DATABASE_URL),
    checkInEnabled: config.DAILY_CHECKIN_ENABLED && Boolean(config.DATABASE_URL && config.TELEGRAM_BOT_TOKEN),
    checkInPoints: config.DAILY_CHECKIN_POINTS,
    chain: config.WALLET_CHAIN,
    network: config.WALLET_NETWORK,
    walletConfigured: false,
    adsConfigured: false,
    payoutsEnabled: false,
    revenueShareEnabled: false,
    shareRewardEnabled: false,
    taskDestinations,
    socialLinks: {
      x: safePublicHttpsUrl(config.PUBLIC_URL_X || config.TASK_URL_X_FOLLOW || config.TASK_URL_X_POST),
      telegram: safePublicHttpsUrl(config.PUBLIC_URL_TELEGRAM || config.TASK_URL_TELEGRAM_CHANNEL),
      discord: safePublicHttpsUrl(config.TASK_URL_DISCORD),
      facebook: safePublicHttpsUrl(config.TASK_URL_FACEBOOK),
      instagram: safePublicHttpsUrl(config.TASK_URL_INSTAGRAM),
      youtube: safePublicHttpsUrl(config.TASK_URL_YOUTUBE),
      announcements: safePublicHttpsUrl(config.PUBLIC_URL_ANNOUNCEMENTS),
      website: safePublicHttpsUrl(config.PUBLIC_URL_WEBSITE),
    },
  };
}

function safePublicHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}
