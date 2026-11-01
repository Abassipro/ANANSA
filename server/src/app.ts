import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { AppConfig } from "./config.js";
import { publicConfig } from "./config.js";
import { inTransaction, type Database } from "./db.js";
import { createTaskDefinitions } from "./domain/tasks.js";
import { applyPointDeltaInTransaction, getPointsBalance } from "./domain/points.js";
import { calculateReferralRank, parseReferralStartParam } from "./domain/referrals.js";
import { consecutiveUtcDayStreak, isMissedUtcStreakDay } from "./domain/streaks.js";
import { TelegramAuthError, verifyAuthorizationHeader, type VerifiedTelegramUser } from "./telegram-auth.js";

interface TelegramRequest extends FastifyRequest {
  telegramIdentity?: VerifiedTelegramUser;
  telegramStartParam?: string | null;
}

const REQUIRED_DATABASE_TABLES = [
  "users",
  "point_ledger",
  "daily_check_ins",
  "task_completions",
  "referrals",
  "provider_reward_events",
  "reward_cycles",
  "reward_allocations",
  "withdrawal_requests",
  "withdrawal_status_history",
  "admin_audit_events",
] as const;

const REQUIRED_DATABASE_INDEXES = [
  "point_ledger_user_created_idx",
  "daily_check_ins_user_date_idx",
  "task_completions_user_status_idx",
  "referrals_referrer_status_idx",
  "withdrawal_requests_user_created_idx",
  "withdrawal_history_request_created_idx",
  "admin_audit_events_created_idx",
] as const;

export interface AppDependencies {
  config: AppConfig;
  database: Database | null;
  now?: () => Date;
  logger?: boolean;
}

export function createApp({
  config,
  database,
  now = () => new Date(),
  logger = true,
}: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger,
    bodyLimit: 16 * 1024,
    trustProxy: false,
    requestIdHeader: "x-request-id",
    ...(logger ? { redact: ["req.headers.authorization", "req.headers.cookie"] } : {}),
  });

  void app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
  void app.register(cors, {
    origin: config.APP_ORIGIN,
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 600,
  });
  void app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    return payload;
  });

  const authenticateTelegram = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    try {
      const verified = verifyAuthorizationHeader(
        request.headers.authorization,
        config,
        Math.floor(now().getTime() / 1000),
      );
      const telegramRequest = request as TelegramRequest;
      telegramRequest.telegramIdentity = verified.user;
      telegramRequest.telegramStartParam = verified.startParam;
    } catch (error: unknown) {
      if (error instanceof TelegramAuthError) {
        await reply.code(401).send({ error: error.message });
        return;
      }
      await reply.code(503).send({
        error: error instanceof Error ? error.message : "Telegram authentication is unavailable.",
      });
    }
  };

  app.get("/api/v1/health", async () => ({
    status: "ok",
    databaseConfigured: Boolean(database),
    telegramConfigured: Boolean(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_BOT_USERNAME),
  }));

  app.get("/api/v1/ready", async (request, reply) => {
    if (!database) {
      return reply.code(503).send({ status: "not_ready", reason: "database_not_configured" });
    }
    try {
      const [tables, indexes] = await Promise.all([
        database.query<{ name: string; exists: boolean }>(
          `SELECT t.name,
                  to_regclass('public.' || quote_ident(t.name)) IS NOT NULL AS exists
           FROM unnest($1::text[]) AS t(name)`,
          [REQUIRED_DATABASE_TABLES],
        ),
        database.query<{ name: string; exists: boolean }>(
          `SELECT required.name,
                  EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND indexname = required.name
                  ) AS exists
           FROM unnest($1::text[]) AS required(name)`,
          [REQUIRED_DATABASE_INDEXES],
        ),
      ]);
      const missing = [
        ...tables.rows.filter(({ exists }) => !exists).map(({ name }) => `table:${name}`),
        ...indexes.rows.filter(({ exists }) => !exists).map(({ name }) => `index:${name}`),
      ];
      if (missing.length > 0) {
        return reply.code(503).send({
          status: "not_ready",
          reason: "schema_incomplete",
          missing,
        });
      }
      return { status: "ready" };
    } catch (error: unknown) {
      request.log.error({ err: error }, "PostgreSQL readiness check failed.");
      return reply.code(503).send({ status: "not_ready", reason: "database_unavailable" });
    }
  });

  app.get("/api/v1/config", async () => ({
    ...publicConfig(config),
    tasks: createTaskDefinitions(
      {
        follow_x: config.TASK_URL_X_FOLLOW || null,
        telegram_channel: config.TASK_URL_TELEGRAM_CHANNEL || null,
        join_discord: config.TASK_URL_DISCORD || null,
        follow_facebook: config.TASK_URL_FACEBOOK || null,
        follow_instagram: config.TASK_URL_INSTAGRAM || null,
        subscribe_youtube: config.TASK_URL_YOUTUBE || null,
        engage_x_post: config.TASK_URL_X_POST || null,
      },
      config.DAILY_CHECKIN_POINTS,
    ).map((task) => ({
      ...task,
      enabled:
        task.id === "daily_checkin"
          ? publicConfig(config).checkInEnabled
          : task.kind === "social"
            ? task.destinationUrl !== null
            : false,
    })),
  }));

  app.get(
    "/api/v1/me",
    { preHandler: authenticateTelegram },
    async (request, reply) => {
      if (!database) {
        return reply.code(503).send({
          error: "Accounts and reward history require DATABASE_URL. No sample balance is displayed as a real account.",
        });
      }

      const identity = (request as TelegramRequest).telegramIdentity;
      if (!identity) return reply.code(401).send({ error: "Telegram identity is required." });

      try {
        const user = await upsertTelegramUser(
          database,
          identity,
          (request as TelegramRequest).telegramStartParam ?? null,
        );
        const overview = await loadAccountOverview(database, user.telegram_id, now());
        return {
          authenticated: true,
          user: {
            id: user.telegram_id,
            username: user.username,
            displayName: user.display_name,
            photoUrl: user.photo_url,
            referralCode: user.referral_code,
            points: overview.points,
            createdAt: user.created_at,
          },
          referrals: overview.referrals,
          recentCheckInDates: overview.recentCheckInDates,
          taskStatuses: overview.taskStatuses,
          streak: overview.streak,
          streakBroken: overview.streakBroken,
          todaysCheckIn: overview.todaysCheckIn,
          currentWeekCheckIns: overview.currentWeekCheckIns,
        };
      } catch (error: unknown) {
        request.log.error({ err: error }, "Could not load the Telegram account.");
        return reply.code(503).send({ error: "Could not load the account. Try again shortly." });
      }
    },
  );

  app.get<{ Querystring: { limit?: number; before?: string } }>(
    "/api/v1/me/points",
    {
      preHandler: authenticateTelegram,
      schema: {
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100 },
            before: { type: "string", pattern: "^[1-9][0-9]{0,18}$" },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const identity = (request as TelegramRequest).telegramIdentity;
      if (!identity) return reply.code(401).send({ error: "Telegram identity is required." });
      if (!database) {
        return reply.code(503).send({ error: "A configured PostgreSQL database is required." });
      }

      const limit = request.query.limit ?? 25;
      const before = request.query.before;
      if (before && BigInt(before) > 9_223_372_036_854_775_807n) {
        return reply.code(400).send({ error: "The points history cursor is invalid." });
      }
      try {
        const [balance, entries] = await Promise.all([
          getPointsBalance(database, identity.id),
          database.query<{
            id: string;
            entry_type: string;
            delta: number;
            metadata: Record<string, unknown>;
            created_at: Date;
          }>(
            `SELECT id::text, entry_type, delta, metadata, created_at
             FROM point_ledger
             WHERE telegram_id = $1
               AND ($2::bigint IS NULL OR id < $2::bigint)
             ORDER BY id DESC
             LIMIT $3`,
            [identity.id, before ?? null, limit + 1],
          ),
        ]);
        const hasMore = entries.rows.length > limit;
        const page = entries.rows.slice(0, limit);
        return {
          balance,
          entries: page.map((entry) => ({
            id: entry.id,
            type: entry.entry_type,
            delta: entry.delta,
            metadata: entry.metadata,
            createdAt: entry.created_at,
          })),
          nextBefore: hasMore ? page.at(-1)?.id ?? null : null,
        };
      } catch (error: unknown) {
        request.log.error({ err: error }, "Could not load the points ledger history.");
        return reply.code(503).send({ error: "Points history is temporarily unavailable." });
      }
    },
  );

  app.get(
    "/api/v1/me/rewards",
    { preHandler: authenticateTelegram },
    async (request, reply) => {
      if (!database) {
        return reply.code(503).send({
          error: "Verified account and withdrawal history require DATABASE_URL.",
        });
      }
      const identity = (request as TelegramRequest).telegramIdentity;
      if (!identity) return reply.code(401).send({ error: "Telegram identity is required." });

      try {
        await upsertTelegramUser(
          database,
          identity,
          (request as TelegramRequest).telegramStartParam ?? null,
        );
        const [withdrawals, latestCycle] = await Promise.all([
          database.query<{
            id: string;
            amount_minor_units: string;
            asset_code: string;
            status: string;
            transaction_hash: string | null;
            created_at: Date;
          }>(
            `SELECT id, amount_minor_units::text, asset_code, status, transaction_hash, created_at
             FROM withdrawal_requests
             WHERE telegram_id = $1
             ORDER BY created_at DESC
             LIMIT 25`,
            [identity.id],
          ),
          database.query<{
            starts_at: Date;
            ends_at: Date;
            status: string;
            policy_version: string;
            currency_code: string;
            dry_run_only: boolean;
          }>(
            `SELECT starts_at, ends_at, status, policy_version, currency_code, dry_run_only
             FROM reward_cycles
             ORDER BY created_at DESC
             LIMIT 1`,
          ),
        ]);

        return {
          transferEnabled: false,
          claimableBalanceMinorUnits: null,
          minimumWithdrawalMinorUnits: null,
          networkFee: null,
          supportedPayoutAssets: [],
          weeklyStatus: "rules_pending",
          latestCycle: latestCycle.rows[0] ?? null,
          withdrawals: withdrawals.rows.map((withdrawal) => ({
            id: withdrawal.id,
            amountMinorUnits: withdrawal.amount_minor_units,
            asset: withdrawal.asset_code,
            status: withdrawal.status,
            transactionHash: withdrawal.transaction_hash,
            createdAt: withdrawal.created_at,
          })),
        };
      } catch (error: unknown) {
        request.log.error({ err: error }, "Could not load reward history.");
        return reply.code(503).send({ error: "Verified reward history is temporarily unavailable." });
      }
    },
  );

  app.post<{ Params: { taskId: string } }>(
    "/api/v1/me/tasks/:taskId/submit",
    {
      preHandler: authenticateTelegram,
      schema: {
        params: {
          type: "object",
          properties: { taskId: { type: "string", minLength: 1, maxLength: 64 } },
          required: ["taskId"],
          additionalProperties: false,
        },
      },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const identity = (request as TelegramRequest).telegramIdentity;
      if (!identity) return reply.code(401).send({ error: "Telegram identity is required." });
      if (!database) {
        return reply.code(503).send({ error: "A configured PostgreSQL database is required." });
      }

      const task = createTaskDefinitions(
        {
          follow_x: config.TASK_URL_X_FOLLOW || null,
          telegram_channel: config.TASK_URL_TELEGRAM_CHANNEL || null,
          join_discord: config.TASK_URL_DISCORD || null,
          follow_facebook: config.TASK_URL_FACEBOOK || null,
          follow_instagram: config.TASK_URL_INSTAGRAM || null,
          subscribe_youtube: config.TASK_URL_YOUTUBE || null,
          engage_x_post: config.TASK_URL_X_POST || null,
        },
        config.DAILY_CHECKIN_POINTS,
      ).find(({ id }) => id === request.params.taskId);
      if (!task || task.kind !== "social" || !task.destinationUrl) {
        return reply.code(404).send({ error: "This social task is not configured for submission." });
      }

      try {
        const submission = await inTransaction(database, async (client) => {
          await upsertTelegramUser(
            client,
            identity,
            (request as TelegramRequest).telegramStartParam ?? null,
          );
          const inserted = await client.query<{ status: "pending_verification" }>(
            `INSERT INTO task_completions (telegram_id, task_id)
             VALUES ($1, $2)
             ON CONFLICT (telegram_id, task_id) DO NOTHING
             RETURNING status`,
            [identity.id, task.id],
          );
          const status = inserted.rows[0]?.status
            ?? (await client.query<{ status: "pending_verification" | "approved" | "rejected" }>(
              `SELECT status
               FROM task_completions
               WHERE telegram_id = $1 AND task_id = $2`,
              [identity.id, task.id],
            )).rows[0]?.status;
          if (!status) throw new Error("The task submission status could not be loaded.");
          return { inserted: inserted.rowCount === 1, status };
        });

        return reply
          .code(submission.inserted ? 202 : 200)
          .send({ submitted: submission.inserted, status: submission.status, rewardGranted: false });
      } catch (error: unknown) {
        request.log.error({ err: error }, "Social task submission transaction failed.");
        return reply.code(500).send({ error: "The task submission could not be recorded." });
      }
    },
  );

  app.post(
    "/api/v1/me/check-in",
    {
      preHandler: authenticateTelegram,
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      if (!config.DAILY_CHECKIN_ENABLED) {
        return reply.code(403).send({
          error: "Daily check-in rewards are paused until the reward policy is approved.",
        });
      }
      if (!database) {
        return reply.code(503).send({ error: "A configured PostgreSQL database is required." });
      }

      const identity = (request as TelegramRequest).telegramIdentity;
      if (!identity) return reply.code(401).send({ error: "Telegram identity is required." });

      try {
        const result = await inTransaction(database, async (client) => {
          await upsertTelegramUser(
            client,
            identity,
            (request as TelegramRequest).telegramStartParam ?? null,
          );
          const insertedCheckIn = await client.query<{ checkin_date: string }>(
            `INSERT INTO daily_check_ins (telegram_id, checkin_date, awarded_points)
             VALUES ($1, (now() AT TIME ZONE 'UTC')::date, $2)
             ON CONFLICT (telegram_id, checkin_date) DO NOTHING
             RETURNING to_char(checkin_date, 'YYYY-MM-DD') AS checkin_date`,
            [identity.id, config.DAILY_CHECKIN_POINTS],
          );

          if (insertedCheckIn.rowCount === 0) return { alreadyClaimed: true as const };

          const checkInDate = insertedCheckIn.rows[0]?.checkin_date;
          if (!checkInDate) throw new Error("The saved daily check-in is missing its UTC date.");
          const idempotencyKey = `check-in:${identity.id}:${checkInDate}`;
          const points = await applyPointDeltaInTransaction(client, {
            telegramId: identity.id,
            entryType: "daily_checkin",
            delta: config.DAILY_CHECKIN_POINTS,
            idempotencyKey,
            metadata: { utcDate: checkInDate, policy: "configured_daily_checkin" },
          });
          return {
            alreadyClaimed: false as const,
            awardedPoints: config.DAILY_CHECKIN_POINTS,
            lifetimePoints: points.balance,
            checkInDate,
          };
        });

        if (result.alreadyClaimed) {
          return reply.code(409).send({ error: "Today's UTC check-in has already been recorded." });
        }
        return {
          claimed: true,
          awardedPoints: result.awardedPoints,
          lifetimePoints: result.lifetimePoints,
          checkInDate: result.checkInDate,
        };
      } catch (error: unknown) {
        request.log.error({ err: error }, "Daily check-in transaction failed.");
        return reply.code(500).send({ error: "The check-in could not be confirmed. Check your activity before trying again." });
      }
    },
  );

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: "This API endpoint does not exist." }),
  );

  app.setErrorHandler((error: unknown, request, reply) => {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: number }).statusCode)
      : undefined;

    request.log.error({ err: error }, "Unhandled API error.");
    reply.code(statusCode && statusCode < 500 ? statusCode : 500).send({
      error: statusCode === 429 ? "Too many requests. Try again shortly." : "An unexpected server error occurred.",
    });
  });

  return app;
}

interface UserRow {
  telegram_id: string;
  username: string | null;
  display_name: string;
  photo_url: string | null;
  referral_code: string;
  created_at: Date;
}

interface Queryable {
  query: Database["query"];
}

async function upsertTelegramUser(
  database: Queryable,
  identity: VerifiedTelegramUser,
  signedStartParam: string | null,
): Promise<UserRow> {
  const clientLike = database as { query: (text: string, values?: unknown[]) => Promise<{ rows: UserRow[] }> };
  const displayName = [identity.firstName, identity.lastName].filter(Boolean).join(" ").slice(0, 256);
  const result = await clientLike.query(
    `INSERT INTO users (telegram_id, username, display_name, photo_url, referral_code)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       photo_url = EXCLUDED.photo_url,
       updated_at = now()
     RETURNING telegram_id, username, display_name, photo_url, referral_code, created_at`,
    [
      identity.id,
      identity.username,
      displayName || identity.firstName,
      identity.photoUrl,
      randomBytes(8).toString("hex"),
    ],
  );
  const user = result.rows[0];
  if (!user) throw new Error("The authenticated Telegram account could not be created.");

  const referralCode = parseReferralStartParam(signedStartParam);
  if (referralCode) {
    await clientLike.query(
      `INSERT INTO referrals (referrer_telegram_id, referred_telegram_id)
       SELECT telegram_id, $1
       FROM users
       WHERE referral_code = $2 AND telegram_id <> $1
       ON CONFLICT (referred_telegram_id) DO NOTHING`,
      [identity.id, referralCode],
    );
  }

  return user;
}

async function loadAccountOverview(database: Database, telegramId: string, now: Date) {
  const utcToday = now.toISOString().slice(0, 10);
  const todayOrdinal = Date.UTC(
    Number(utcToday.slice(0, 4)),
    Number(utcToday.slice(5, 7)) - 1,
    Number(utcToday.slice(8, 10)),
  );
  const mondayOffset = (new Date(todayOrdinal).getUTCDay() + 6) % 7;
  const weekStart = new Date(todayOrdinal - mondayOffset * 86_400_000).toISOString().slice(0, 10);

  const [points, referralCounts, checkIns, taskStatuses] = await Promise.all([
    getPointsBalance(database, telegramId),
    database.query<{ invited: string; qualified: string }>(
      `SELECT count(*)::text AS invited,
              count(*) FILTER (WHERE status = 'qualified')::text AS qualified
       FROM referrals
       WHERE referrer_telegram_id = $1`,
      [telegramId],
    ),
    database.query<{ checkin_date: string }>(
      `SELECT to_char(checkin_date, 'YYYY-MM-DD') AS checkin_date
       FROM daily_check_ins
       WHERE telegram_id = $1
         AND checkin_date >= ((now() AT TIME ZONE 'UTC')::date - 13)
       ORDER BY checkin_date DESC`,
      [telegramId],
    ),
    database.query<{ task_id: string; status: "pending_verification" | "approved" | "rejected" }>(
      `SELECT task_id, status
       FROM task_completions
       WHERE telegram_id = $1`,
      [telegramId],
    ),
  ]);

  const dates = checkIns.rows.map((row) => row.checkin_date);
  const referral = referralCounts.rows[0];
  if (!referral) throw new Error("The referral summary could not be loaded.");

  return {
    points,
    referrals: {
      invited: Number(referral.invited),
      qualified: Number(referral.qualified),
      rank: calculateReferralRank(Number(referral.qualified)),
    },
    recentCheckInDates: dates,
    taskStatuses: Object.fromEntries(taskStatuses.rows.map(({ task_id, status }) => [task_id, status])),
    streak: consecutiveUtcDayStreak(dates, utcToday),
    streakBroken: isMissedUtcStreakDay(dates, utcToday),
    todaysCheckIn: dates.includes(utcToday),
    currentWeekCheckIns: dates.filter((date) => date >= weekStart && date <= utcToday).length,
  };
}
