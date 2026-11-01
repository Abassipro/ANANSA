import { describe, expect, it } from "vitest";
import { inTransaction, type Database } from "../../server/src/db.js";
import {
  applyPointDeltaInTransaction,
  getPointsBalance,
  type PointEntryType,
  type PointDeltaInput,
} from "../../server/src/domain/points.js";

interface LedgerEntry {
  id: string;
  telegramId: string;
  entryType: PointEntryType;
  delta: number;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}

function createMemoryPool(accounts: string[]) {
  const ledger: LedgerEntry[] = [];
  let nextId = 1;
  let lockTail = Promise.resolve();
  let failBalanceAfterInsert = false;
  let failOnBalanceQuery = false;

  const pool = {
    async connect() {
      const previousLock = lockTail;
      let releaseLock: (() => void) | undefined;
      lockTail = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      await previousLock;

      const startingLedger = ledger.map((entry) => ({ ...entry }));
      const startingId = nextId;
      let transactionStarted = false;

      const client = {
        async query(sql: string, values: unknown[] = []) {
          if (sql === "BEGIN") {
            transactionStarted = true;
            return { rows: [], rowCount: null };
          }
          if (sql === "COMMIT") {
            transactionStarted = false;
            return { rows: [], rowCount: null };
          }
          if (sql === "ROLLBACK") {
            if (transactionStarted) {
              ledger.splice(0, ledger.length, ...startingLedger);
              nextId = startingId;
              transactionStarted = false;
            }
            return { rows: [], rowCount: null };
          }
          if (sql.startsWith("SELECT telegram_id FROM users")) {
            const telegramId = String(values[0]);
            return {
              rows: accounts.includes(telegramId) ? [{ telegram_id: telegramId }] : [],
              rowCount: accounts.includes(telegramId) ? 1 : 0,
            };
          }
          if (sql.includes("metadata = $2::jsonb AS same_metadata")) {
            const [key, serializedMetadata] = values as [string, string];
            const entry = ledger.find((candidate) => candidate.idempotencyKey === key);
            return {
              rows: entry
                ? [{
                    id: entry.id,
                    telegram_id: entry.telegramId,
                    entry_type: entry.entryType,
                    delta: entry.delta,
                    same_metadata: JSON.stringify(entry.metadata) === serializedMetadata,
                  }]
                : [],
              rowCount: entry ? 1 : 0,
            };
          }
          if (sql.includes("COALESCE(sum(delta), 0)::text AS points")) {
            if (failOnBalanceQuery) {
              failOnBalanceQuery = false;
              throw new Error("Injected balance-read failure");
            }
            const telegramId = String(values[0]);
            return {
              rows: [{ points: String(ledger
                .filter((entry) => entry.telegramId === telegramId)
                .reduce((sum, entry) => sum + entry.delta, 0)) }],
              rowCount: 1,
            };
          }
          if (sql.startsWith("INSERT INTO point_ledger")) {
            const [telegramId, entryType, delta, idempotencyKey, serializedMetadata] = values as [
              string,
              PointEntryType,
              number,
              string,
              string,
            ];
            if (ledger.some((entry) => entry.idempotencyKey === idempotencyKey)) {
              return { rows: [], rowCount: 0 };
            }
            const id = String(nextId++);
            ledger.push({
              id,
              telegramId,
              entryType,
              delta,
              idempotencyKey,
              metadata: JSON.parse(serializedMetadata) as Record<string, unknown>,
            });
            if (failBalanceAfterInsert) {
              failBalanceAfterInsert = false;
              failOnBalanceQuery = true;
            }
            return { rows: [{ id }], rowCount: 1 };
          }
          throw new Error(`Unexpected SQL in points test: ${sql}`);
        },
        release() {
          releaseLock?.();
        },
      };
      return client;
    },
    async query(sql: string, values: unknown[] = []) {
      if (sql.includes("COALESCE(sum(delta), 0)::text AS points")) {
        const telegramId = String(values[0]);
        return {
          rows: [{ points: String(ledger
            .filter((entry) => entry.telegramId === telegramId)
            .reduce((sum, entry) => sum + entry.delta, 0)) }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected pool SQL in points test: ${sql}`);
    },
    get ledger() {
      return ledger;
    },
    failNextBalanceQuery() {
      failBalanceAfterInsert = true;
    },
  };
  return pool as unknown as Database & {
    ledger: LedgerEntry[];
    failNextBalanceQuery: () => Promise<void>;
  };
}

const checkInDelta = {
  telegramId: "123456789",
  entryType: "daily_checkin" as const,
  delta: 50,
  idempotencyKey: "check-in:123456789:2026-10-30",
  metadata: { utcDate: "2026-10-30" },
};

async function apply(pool: Database, input: PointDeltaInput = checkInDelta) {
  return inTransaction(pool, (client) => applyPointDeltaInTransaction(client, input));
}

describe("authoritative points ledger", () => {
  it("calculates balances from persisted ledger deltas", async () => {
    const pool = createMemoryPool(["123456789"]);
    await apply(pool);
    await inTransaction(pool, (client) => applyPointDeltaInTransaction(client, {
      ...checkInDelta,
      entryType: "admin_adjustment",
      delta: -15,
      idempotencyKey: "adjustment:1",
      metadata: { reason: "test deduction" },
    }));

    await expect(getPointsBalance(pool, "123456789")).resolves.toBe(35);
    expect(pool.ledger.map(({ delta }) => delta)).toEqual([50, -15]);
  });

  it("returns an idempotent replay without inserting a second ledger entry", async () => {
    const pool = createMemoryPool(["123456789"]);
    await expect(apply(pool)).resolves.toMatchObject({ applied: true, balance: 50 });
    await expect(apply(pool)).resolves.toMatchObject({ applied: false, balance: 50 });
    expect(pool.ledger).toHaveLength(1);
  });

  it("rejects reused keys with changed amount or account and prevents negative balances", async () => {
    const pool = createMemoryPool(["123456789", "999999999"]);
    await apply(pool);

    await expect(apply(pool, { ...checkInDelta, delta: 75 })).rejects.toThrow(/different points transaction/i);
    await expect(apply(pool, { ...checkInDelta, telegramId: "999999999" })).rejects.toThrow(/different points transaction/i);
    await expect(apply(pool, {
      ...checkInDelta,
      entryType: "admin_adjustment",
      delta: -51,
      idempotencyKey: "debit:too-large",
    })).rejects.toThrow(/negative/i);

    expect(pool.ledger).toHaveLength(1);
    await expect(getPointsBalance(pool, "999999999")).resolves.toBe(0);
  });

  it("serializes concurrent claims so only one matching idempotency key is recorded", async () => {
    const pool = createMemoryPool(["123456789"]);
    const results = await Promise.all(Array.from({ length: 8 }, () => apply(pool)));

    expect(results.filter((result) => result.applied)).toHaveLength(1);
    expect(pool.ledger).toHaveLength(1);
    await expect(getPointsBalance(pool, "123456789")).resolves.toBe(50);
  });

  it("rejects a points transaction for an account that does not exist", async () => {
    const pool = createMemoryPool([]);
    await expect(apply(pool)).rejects.toThrow(/account does not exist/i);
    expect(pool.ledger).toHaveLength(0);
  });

  it("rolls back a ledger insert if the authoritative balance cannot be confirmed", async () => {
    const pool = createMemoryPool(["123456789"]);
    pool.failNextBalanceQuery();

    await expect(apply(pool)).rejects.toThrow(/injected balance-read failure/i);
    expect(pool.ledger).toHaveLength(0);
    await expect(getPointsBalance(pool, "123456789")).resolves.toBe(0);
  });
});
