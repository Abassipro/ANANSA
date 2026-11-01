import pg from "pg";
import type { AppConfig } from "./config.js";

export type Database = pg.Pool;
export type DatabaseClient = pg.PoolClient;

import fs from "node:fs";

export async function inTransaction<T>(
  database: Database,
  operation: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();
  let transactionStarted = false;
  let discardClient: Error | undefined;

  try {
    await client.query("BEGIN");
    transactionStarted = true;
    try {
      const result = await operation(client);
      await client.query("COMMIT");
      transactionStarted = false;
      return result;
    } catch (error: unknown) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
          transactionStarted = false;
        } catch (rollbackError: unknown) {
          discardClient = rollbackError instanceof Error
            ? rollbackError
            : new Error("The database transaction rollback failed.");
          throw new AggregateError(
            [error, rollbackError],
            "The database transaction failed and could not be rolled back.",
          );
        }
      }
      throw error;
    }
  } finally {
    client.release(discardClient);
  }
}

export function createDatabase(config: AppConfig): Database | null {
  if (!config.DATABASE_URL) return null;

  const sslSettings = config.DATABASE_SSL
    ? {
        rejectUnauthorized: true,
        ...(config.DATABASE_CA_CERT_PATH
          ? { ca: fs.readFileSync(config.DATABASE_CA_CERT_PATH, "utf8") }
          : {}),
      }
    : false;

  return new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: sslSettings,
    application_name: "abassi-telegram-mini-app",
  });
}
