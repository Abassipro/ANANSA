import type { Pool, PoolClient } from "pg";

export type PointEntryType =
  | "daily_checkin"
  | "social_task"
  | "rewarded_ad"
  | "welcome_bonus"
  | "share_bonus"
  | "admin_adjustment";

export interface PointDeltaInput {
  telegramId: string;
  entryType: PointEntryType;
  delta: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface PointDeltaResult {
  applied: boolean;
  ledgerId: string;
  balance: number;
}

export async function getPointsBalance(
  database: Pool | PoolClient,
  telegramId: string,
): Promise<number> {
  const result = await database.query<{ points: string }>(
    `SELECT COALESCE(sum(delta), 0)::text AS points
     FROM point_ledger
     WHERE telegram_id = $1`,
    [telegramId],
  );
  return parsePointsBalance(result.rows[0]?.points ?? "0");
}

export async function applyPointDeltaInTransaction(
  client: PoolClient,
  input: PointDeltaInput,
): Promise<PointDeltaResult> {
  if (!/^[0-9]{1,20}$/.test(input.telegramId)) {
    throw new TypeError("Points require a valid Telegram account identifier.");
  }
  if (
    !Number.isSafeInteger(input.delta)
    || input.delta === 0
    || input.delta < -2_147_483_648
    || input.delta > 2_147_483_647
  ) {
    throw new RangeError("A points transaction must have a non-zero PostgreSQL integer delta.");
  }
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) {
    throw new TypeError("A bounded idempotency key is required for points transactions.");
  }

  const account = await client.query<{ telegram_id: string }>(
    "SELECT telegram_id FROM users WHERE telegram_id = $1 FOR UPDATE",
    [input.telegramId],
  );
  if (account.rows.length !== 1) {
    throw new Error("The points transaction account does not exist.");
  }

  const metadata = input.metadata ?? {};
  const existing = await client.query<{
    id: string;
    telegram_id: string;
    entry_type: PointEntryType;
    delta: number;
    same_metadata: boolean;
  }>(
    `SELECT id::text, telegram_id, entry_type, delta,
            metadata = $2::jsonb AS same_metadata
     FROM point_ledger
     WHERE idempotency_key = $1`,
    [input.idempotencyKey, JSON.stringify(metadata)],
  );
  const existingEntry = existing.rows[0];
  if (existingEntry) {
    assertSameTransaction(existingEntry, input);
    return {
      applied: false,
      ledgerId: existingEntry.id,
      balance: await getPointsBalance(client, input.telegramId),
    };
  }

  const currentBalance = await getPointsBalance(client, input.telegramId);
  const resultingBalance = currentBalance + input.delta;
  if (!Number.isSafeInteger(resultingBalance)) {
    throw new RangeError("The points transaction would exceed the supported account balance.");
  }
  if (resultingBalance < 0) {
    throw new RangeError("The points transaction would make the account balance negative.");
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO point_ledger (telegram_id, entry_type, delta, idempotency_key, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id::text`,
    [
      input.telegramId,
      input.entryType,
      input.delta,
      input.idempotencyKey,
      JSON.stringify(metadata),
    ],
  );
  const insertedEntry = inserted.rows[0];
  if (insertedEntry) {
    return {
      applied: true,
      ledgerId: insertedEntry.id,
      balance: await getPointsBalance(client, input.telegramId),
    };
  }

  const racedEntry = await client.query<{
    id: string;
    telegram_id: string;
    entry_type: PointEntryType;
    delta: number;
    same_metadata: boolean;
  }>(
    `SELECT id::text, telegram_id, entry_type, delta,
            metadata = $2::jsonb AS same_metadata
     FROM point_ledger
     WHERE idempotency_key = $1`,
    [input.idempotencyKey, JSON.stringify(metadata)],
  );
  const entry = racedEntry.rows[0];
  if (!entry) throw new Error("The points transaction idempotency record could not be loaded.");
  assertSameTransaction(entry, input);
  return {
    applied: false,
    ledgerId: entry.id,
    balance: await getPointsBalance(client, input.telegramId),
  };
}

function assertSameTransaction(
  existing: {
    telegram_id: string;
    entry_type: PointEntryType;
    delta: number;
    same_metadata: boolean;
  },
  input: PointDeltaInput,
): void {
  if (
    existing.telegram_id !== input.telegramId
    || existing.entry_type !== input.entryType
    || existing.delta !== input.delta
    || !existing.same_metadata
  ) {
    throw new Error("The idempotency key is already associated with a different points transaction.");
  }
}

function parsePointsBalance(value: string): number {
  const balance = Number(value);
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new Error("The point ledger produced an invalid account balance.");
  }
  return balance;
}
