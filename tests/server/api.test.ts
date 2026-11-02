import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/src/app.js";
import { loadConfig } from "../../server/src/config.js";
import type { Database } from "../../server/src/db.js";

const botToken = "123456789:TEST_ONLY_NOT_A_REAL_TELEGRAM_BOT_TOKEN";
const nowSeconds = 1_800_000_000;
const appInstances: Array<Awaited<ReturnType<typeof createApp>>> = [];

function signedInitData(): string {
  const params = new URLSearchParams({
    auth_date: String(nowSeconds),
    user: JSON.stringify({ id: 123456789, first_name: "Test" }),
  });
  params.sort();
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret)
    .update([...params].map(([key, value]) => `${key}=${value}`).join("\n"))
    .digest("hex");
  params.set("hash", hash);
  return params.toString();
}

async function createTestApp(
  database: Database | null = null,
  overrides: NodeJS.ProcessEnv = {},
) {
  const app = createApp({
    config: loadConfig({
      NODE_ENV: "test",
      TELEGRAM_BOT_TOKEN: botToken,
      TELEGRAM_BOT_USERNAME: "test_abassi_bot",
      APP_ORIGIN: "http://localhost:5173",
      ...overrides,
    }),
    database,
    now: () => new Date(nowSeconds * 1000),
    logger: false,
  });
  appInstances.push(app);
  await app.ready();
  return app;
}

function taskSubmissionDatabase() {
  let taskSubmitted = false;
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const user = {
    telegram_id: "123456789",
    username: null,
    display_name: "Test",
    photo_url: null,
    referral_code: "0123456789abcdef",
    created_at: new Date("2025-01-01T00:00:00.000Z"),
  };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    statements.push({ sql, values });
    if (sql.startsWith("INSERT INTO users")) return { rows: [user], rowCount: 1 };
    if (sql.startsWith("INSERT INTO referrals")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("INSERT INTO task_completions")) {
      if (taskSubmitted) return { rows: [], rowCount: 0 };
      taskSubmitted = true;
      return { rows: [{ status: "pending_verification" }], rowCount: 1 };
    }
    if (sql.includes("FROM task_completions")) {
      return { rows: [{ status: "pending_verification" }], rowCount: 1 };
    }
    return { rows: [], rowCount: null };
  });
  const client = {
    query,
    release: vi.fn(),
  };
  const database = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Database;
  return { database, statements, query };
}

function pointsHistoryDatabase() {
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    statements.push({ sql, values });
    if (sql.includes("COALESCE(sum(delta), 0)::text AS points")) {
      return { rows: [{ points: "75" }], rowCount: 1 };
    }
    if (sql.includes("FROM point_ledger")) {
      return {
        rows: [{
          id: "12",
          entry_type: "daily_checkin",
          delta: 50,
          metadata: { utcDate: "2026-10-30" },
          created_at: new Date("2026-10-30T00:00:00.000Z"),
        }],
        rowCount: 1,
      };
    }
    throw new Error(`Unexpected SQL in points history test: ${sql}`);
  });
  const database = { query } as unknown as Database;
  return { database, statements, query };
}

function checkInDatabase() {
  let checkInExists = false;
  const statements: Array<{ sql: string; values: unknown[] | undefined }> = [];
  const user = {
    telegram_id: "123456789",
    username: null,
    display_name: "Test",
    photo_url: null,
    referral_code: "0123456789abcdef",
    created_at: new Date("2025-01-01T00:00:00.000Z"),
  };
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    statements.push({ sql, values });
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [], rowCount: null };
    }
    if (sql.startsWith("INSERT INTO users")) return { rows: [user], rowCount: 1 };
    if (sql.startsWith("INSERT INTO referrals")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("INSERT INTO daily_check_ins")) {
      if (checkInExists) return { rows: [], rowCount: 0 };
      checkInExists = true;
      return { rows: [{ checkin_date: "2027-01-15" }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT telegram_id FROM users")) {
      return { rows: [{ telegram_id: "123456789" }], rowCount: 1 };
    }
    if (sql.includes("metadata = $2::jsonb AS same_metadata")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("COALESCE(sum(delta), 0)::text AS points")) {
      const current = statements.some((statement) => statement.sql.startsWith("INSERT INTO point_ledger"));
      return { rows: [{ points: current ? "23" : "0" }], rowCount: 1 };
    }
    if (sql.startsWith("INSERT INTO point_ledger")) return { rows: [{ id: "1" }], rowCount: 1 };
    throw new Error(`Unexpected SQL in check-in test: ${sql}`);
  });
  const client = { query, release: vi.fn() };
  const database = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Database;
  return { database, statements, query };
}

afterEach(async () => {
  await Promise.all(appInstances.splice(0).map((app) => app.close()));
});

describe("local API integration", () => {
  it("fails closed on AdsGram Reward URL requests without verifiable callback authentication", async () => {
    const query = vi.fn();
    const database = { query } as unknown as Database;
    const app = await createTestApp(database);

    const missingUser = await app.inject({ method: "GET", url: "/api/reward" });
    const invalidUser = await app.inject({ method: "GET", url: "/api/reward?userid=not-a-telegram-id" });
    const unexpectedReward = await app.inject({ method: "GET", url: "/api/reward?userid=123456789&points=100000" });
    const repeatedUser = await app.inject({ method: "GET", url: "/api/reward?userid=123456789&userid=999999999" });

    expect(missingUser.statusCode).toBe(400);
    expect(invalidUser.statusCode).toBe(400);
    expect(unexpectedReward.statusCode).toBe(400);
    expect(repeatedUser.statusCode).toBe(400);

    const callback = await app.inject({
      method: "GET",
      url: "/api/reward?userid=123456789",
    });
    expect(callback.statusCode).toBe(503);
    expect(callback.json()).toEqual({
      error: "adsgram_callback_verification_unavailable",
    });
    expect(query).not.toHaveBeenCalled();

    const unknownUser = await app.inject({
      method: "GET",
      url: "/api/reward?userid=999999999",
    });
    expect(unknownUser.statusCode).toBe(503);
    expect(query).not.toHaveBeenCalled();
  });

  it("does not turn repeated, concurrent, or client-authenticated AdsGram callbacks into credits", async () => {
    const query = vi.fn();
    const database = { query } as unknown as Database;
    const app = await createTestApp(database);
    const request = (authorization?: string) => app.inject({
      method: "GET",
      url: "/api/reward?userid=123456789",
      ...(authorization ? { headers: { authorization } } : {}),
    });

    const responses = await Promise.all([
      request(),
      request(`tma ${signedInitData()}`),
      request("Bearer forged-token"),
    ]);

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([503, 503, 503]);
    expect(query).not.toHaveBeenCalled();
  });

  it("serves the fail-closed Reward URL over local HTTP without touching the database", async () => {
    const query = vi.fn();
    const app = await createTestApp({ query } as unknown as Database);
    const baseUrl = await app.listen({ host: "127.0.0.1", port: 0 });

    const response = await fetch(new URL("/api/reward?userid=123456789", baseUrl));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "adsgram_callback_verification_unavailable",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed even when database operations would fail", async () => {
    const query = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const app = await createTestApp({ query } as unknown as Database);

    const response = await app.inject({
      method: "GET",
      url: "/api/reward?userid=123456789",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: "adsgram_callback_verification_unavailable",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("reports health and gives a specific readiness response without a database", async () => {
    const app = await createTestApp();
    const health = await app.inject({ method: "GET", url: "/api/v1/health" });
    const readiness = await app.inject({ method: "GET", url: "/api/v1/ready" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      status: "ok",
      databaseConfigured: false,
      telegramConfigured: true,
    });
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toEqual({
      status: "not_ready",
      reason: "database_not_configured",
    });
  });

  it("rejects missing or forged Telegram authorization before account access", async () => {
    const app = await createTestApp();
    const missing = await app.inject({ method: "GET", url: "/api/v1/me" });
    const forged = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: "tma auth_date=1800000000&hash=00&user=%7B%7D" },
    });

    expect(missing.statusCode).toBe(401);
    expect(forged.statusCode).toBe(401);
  });

  it("does not award check-in points when the policy is disabled", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/me/check-in",
      headers: { authorization: `tma ${signedInitData()}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toMatch(/paused/i);
  });

  it("uses only the server-configured check-in amount and prevents duplicate ledger credits", async () => {
    const fake = checkInDatabase();
    const app = await createTestApp(fake.database, {
      DAILY_CHECKIN_ENABLED: "true",
      DAILY_CHECKIN_POINTS: "23",
    });
    const headers = { authorization: `tma ${signedInitData()}` };

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/me/check-in",
      headers,
      payload: { telegram_id: "999999999", points: 999999999 },
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/me/check-in",
      headers,
      payload: { points: -500 },
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      claimed: true,
      awardedPoints: 23,
      lifetimePoints: 23,
      checkInDate: "2027-01-15",
    });
    expect(duplicate.statusCode).toBe(409);
    const ledgerInsert = fake.statements.find(({ sql }) => sql.startsWith("INSERT INTO point_ledger"));
    expect(ledgerInsert?.values).toEqual([
      "123456789",
      "daily_checkin",
      23,
      "check-in:123456789:2027-01-15",
      JSON.stringify({ utcDate: "2027-01-15", policy: "configured_daily_checkin" }),
    ]);
    expect(fake.statements.filter(({ sql }) => sql.startsWith("INSERT INTO point_ledger"))).toHaveLength(1);
    expect(fake.statements.filter(({ sql }) => sql === "BEGIN")).toHaveLength(2);
    expect(fake.statements.filter(({ sql }) => sql === "COMMIT")).toHaveLength(2);
  });

  it("requires verified Telegram authorization for a social-task submission", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/me/tasks/follow_x/submit",
    });

    expect(response.statusCode).toBe(401);
  });

  it("does not accept social-task submissions without persistent storage", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/me/tasks/follow_x/submit",
      headers: { authorization: `tma ${signedInitData()}` },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error).toMatch(/PostgreSQL database/i);
  });

  it("records task claims idempotently and never inserts a points-ledger reward", async () => {
    const fake = taskSubmissionDatabase();
    const app = await createTestApp(fake.database, {
      TASK_URL_X_FOLLOW: "https://x.com/abassi",
    });
    const headers = { authorization: `tma ${signedInitData()}` };

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/me/tasks/follow_x/submit",
      headers,
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/me/tasks/follow_x/submit",
      headers,
    });

    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual({
      submitted: true,
      status: "pending_verification",
      rewardGranted: false,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual({
      submitted: false,
      status: "pending_verification",
      rewardGranted: false,
    });
    expect(fake.statements.filter(({ sql }) => sql.startsWith("INSERT INTO task_completions"))).toHaveLength(2);
    expect(fake.statements.some(({ sql }) => sql.includes("point_ledger"))).toBe(false);
    expect(fake.statements.filter(({ sql }) => sql === "BEGIN")).toHaveLength(2);
    expect(fake.statements.filter(({ sql }) => sql === "COMMIT")).toHaveLength(2);
  });

  it("uses the signed Telegram identity for task ownership, not a client-supplied ID", async () => {
    const fake = taskSubmissionDatabase();
    const app = await createTestApp(fake.database, {
      TASK_URL_X_FOLLOW: "https://x.com/abassi",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/me/tasks/follow_x/submit",
      headers: { authorization: `tma ${signedInitData()}` },
      payload: { telegram_id: "999999999", points: 1000000 },
    });

    expect(response.statusCode).toBe(202);
    const taskInsert = fake.statements.find(({ sql }) => sql.startsWith("INSERT INTO task_completions"));
    expect(taskInsert?.values).toEqual(["123456789", "follow_x"]);
  });

  it("scopes points history to signed Telegram identity and rejects client-selected accounts", async () => {
    const fake = pointsHistoryDatabase();
    const app = await createTestApp(fake.database);

    const unauthenticated = await app.inject({
      method: "GET",
      url: "/api/v1/me/points",
    });
    expect(unauthenticated.statusCode).toBe(401);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/me/points?limit=10",
      headers: { authorization: `tma ${signedInitData()}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      balance: 75,
      entries: [{ id: "12", type: "daily_checkin", delta: 50 }],
      nextBefore: null,
    });
    const historyQuery = fake.statements.find(({ sql }) => sql.includes("SELECT id::text, entry_type, delta, metadata"));
    expect(historyQuery?.sql).toContain("WHERE telegram_id = $1");
    expect(historyQuery?.values).toEqual(["123456789", null, 11]);

    const crossAccount = await app.inject({
      method: "GET",
      url: "/api/v1/me/points?telegram_id=999999999",
      headers: { authorization: `tma ${signedInitData()}` },
    });
    expect(crossAccount.statusCode).toBe(200);
    const crossAccountHistoryQuery = fake.statements
      .filter(({ sql }) => sql.includes("SELECT id::text, entry_type, delta, metadata"))
      .at(-1);
    expect(crossAccountHistoryQuery?.values?.[0]).toBe("123456789");

    const invalidCursor = await app.inject({
      method: "GET",
      url: "/api/v1/me/points?before=9223372036854775808",
      headers: { authorization: `tma ${signedInitData()}` },
    });
    expect(invalidCursor.statusCode).toBe(400);
  });

  it("rejects a Supabase project URL where PostgreSQL connection details are required", () => {
    expect(() => loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: "https://project.supabase.co",
    })).toThrow(/PostgreSQL connection string/i);
  });
});
