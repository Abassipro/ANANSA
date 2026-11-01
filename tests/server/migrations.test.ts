import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rlsMigration = readFileSync(
  new URL("../../server/migrations/003_enable_public_rls.sql", import.meta.url),
  "utf8",
);

describe("public schema RLS migration", () => {
  it("enables row-level security on every application and migration table", () => {
    const tables = [...rlsMigration.matchAll(/^\s*ALTER TABLE public\.([a-z_]+) ENABLE ROW LEVEL SECURITY;\s*$/gim)]
      .map((match) => match[1])
      .sort();

    expect(tables).toEqual([
      "admin_audit_events",
      "daily_check_ins",
      "point_ledger",
      "provider_reward_events",
      "referrals",
      "reward_allocations",
      "reward_cycles",
      "schema_migrations",
      "task_completions",
      "users",
      "withdrawal_requests",
      "withdrawal_status_history",
    ]);
  });

  it("does not grant client policies or perform destructive data operations", () => {
    expect(rlsMigration).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(rlsMigration).not.toMatch(/\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b/i);
    expect(rlsMigration).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i);
  });
});
