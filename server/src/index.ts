import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { createApp } from "./app.js";

const config = loadConfig();
const database = createDatabase(config);
const app = createApp({ config, database });

if (!config.TELEGRAM_BOT_TOKEN) {
  app.log.warn("Telegram sign-in disabled: TELEGRAM_BOT_TOKEN is not configured.");
}
if (!config.DATABASE_URL) {
  app.log.warn("Account persistence and real points are disabled: DATABASE_URL is not configured.");
}
if (!config.TELEGRAM_BOT_USERNAME) {
  app.log.warn("Telegram referral links are disabled: TELEGRAM_BOT_USERNAME is not configured.");
}
if (!config.DAILY_CHECKIN_ENABLED) {
  app.log.info("Daily check-in rewards are disabled pending reward-policy approval.");
}
if (config.PAYOUTS_ENABLED || config.REVENUE_SHARE_ENABLED || config.SHARE_REWARD_ENABLED) {
  app.log.warn("Payouts, revenue shares and share bonuses are hard-disabled pending a signed-off settlement policy.");
}

try {
  await app.listen({ host: "127.0.0.1", port: config.API_PORT });
} catch (error) {
  app.log.fatal({ err: error }, "Could not start the ABASSI Mini App API.");
  if (database) await database.end();
  process.exitCode = 1;
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down the application API.");
  await app.close();
  if (database) await database.end();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
