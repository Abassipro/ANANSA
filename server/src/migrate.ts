import { readdir, readFile } from "node:fs/promises";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { loadConfig } from "./config.js";

const config = loadConfig();
if (!config.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to apply PostgreSQL migrations.");
}

const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_SSL
    ? {
        rejectUnauthorized: true,
        ...(config.DATABASE_CA_CERT_PATH
          ? { ca: fs.readFileSync(config.DATABASE_CA_CERT_PATH, "utf8") }
          : {}),
      }
    : false,
  application_name: "abassi-telegram-migrations",
});

const migrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const applicationTables = [
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

try {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [716284301]);

    const migrations = (await readdir(migrationsDirectory))
      .filter((filename) => /^\d+_[a-z0-9_]+\.sql$/.test(filename))
      .sort((left, right) => left.localeCompare(right));
    const identity = await client.query<{ database: string }>(
      "SELECT current_database() AS database",
    );
    const serverIdentity = identity.rows[0];
    if (!serverIdentity) throw new Error("Could not identify the connected PostgreSQL database.");
    const databaseHost = new URL(config.DATABASE_URL).hostname;
    console.info(`Connected to PostgreSQL database "${serverIdentity.database}" at host "${databaseHost}".`);

    const trackingTable = await client.query<{ table_name: string | null }>(
      "SELECT to_regclass('schema_migrations')::text AS table_name",
    );
    const trackingExists = Boolean(trackingTable.rows[0]?.table_name);
    if (trackingExists) {
      const rows = await client.query<{ filename: string }>(
        "SELECT filename FROM schema_migrations ORDER BY filename",
      );
      const applied = new Set(rows.rows.map(({ filename }) => filename));
      const unknownMigrations = [...applied].filter((filename) => !migrations.includes(filename));
      if (unknownMigrations.length > 0) {
        throw new Error(
          `Migration history contains files missing from this project (${unknownMigrations.join(", ")}). ` +
          "No migration was applied; restore or review the missing migration files first.",
        );
      }
      let missingSeen = false;
      for (const filename of migrations) {
        if (applied.has(filename) && missingSeen) {
          throw new Error(
            `Migration history is out of order: ${filename} is applied while an earlier migration is missing. ` +
            "No migration was applied.",
          );
        }
        if (!applied.has(filename)) missingSeen = true;
      }

      if (migrations.every((filename) => !applied.has(filename))) {
        const existingTables = await client.query<{ table_name: string; exists: boolean }>(
          `SELECT t.name AS table_name,
                  to_regclass('public.' || quote_ident(t.name)) IS NOT NULL AS exists
           FROM unnest($1::text[]) AS t(name)`,
          [applicationTables],
        );
        const existingAppTables = existingTables.rows
          .filter((table) => table.exists)
          .map((table) => table.table_name);
        if (existingAppTables.length > 0) {
          throw new Error(
            `Found existing ABASSI tables without migration history (${existingAppTables.join(", ")}). ` +
            "No migration was applied; inspect the schema and migration history before proceeding.",
          );
        }
        const functionCollision = await client.query<{ exists: boolean }>(
          "SELECT to_regprocedure('reject_ledger_mutation()') IS NOT NULL AS exists",
        );
        if (functionCollision.rows[0]?.exists) {
          throw new Error(
            "A database function named reject_ledger_mutation() already exists. " +
            "No migration was applied; review the existing function before proceeding.",
          );
        }
      }
    } else {
      const existingTables = await client.query<{ table_name: string; exists: boolean }>(
        `SELECT t.name AS table_name,
                to_regclass('public.' || quote_ident(t.name)) IS NOT NULL AS exists
         FROM unnest($1::text[]) AS t(name)`,
        [applicationTables],
      );
      const existingAppTables = existingTables.rows
        .filter((table) => table.exists)
        .map((table) => table.table_name);
      if (existingAppTables.length > 0) {
        throw new Error(
          `Found existing ABASSI tables without migration history (${existingAppTables.join(", ")}). ` +
          "No migration was applied; inspect the schema and migration history before proceeding.",
        );
      }
      const functionCollision = await client.query<{ exists: boolean }>(
        "SELECT to_regprocedure('reject_ledger_mutation()') IS NOT NULL AS exists",
      );
      if (functionCollision.rows[0]?.exists) {
        throw new Error(
          "A database function named reject_ledger_mutation() already exists. " +
          "No migration was applied; review the existing function before proceeding.",
        );
      }

      await client.query(`
        CREATE TABLE schema_migrations (
          filename TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
    }

    const appliedMigrations = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations ORDER BY filename",
    );
    const applied = new Set(appliedMigrations.rows.map(({ filename }) => filename));

    for (const filename of migrations) {
      if (applied.has(filename)) continue;

      const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        console.info(`Applied migration ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    await client.query("SELECT pg_advisory_unlock($1)", [716284301]);
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
