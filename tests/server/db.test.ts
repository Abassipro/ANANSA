import { describe, expect, it, vi } from "vitest";
import { inTransaction, type Database, type DatabaseClient } from "../../server/src/db.js";

function fakeDatabase(client: DatabaseClient): Database {
  return {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Database;
}

function fakeClient(query: ReturnType<typeof vi.fn>) {
  const release = vi.fn();
  const client = { query, release } as unknown as DatabaseClient;
  return { client, release };
}

describe("database transaction cleanup", () => {
  it("does not issue ROLLBACK when BEGIN itself fails", async () => {
    const beginError = new Error("begin failed");
    const query = vi.fn().mockRejectedValue(beginError);
    const { client, release } = fakeClient(query);

    await expect(inTransaction(fakeDatabase(client), async () => undefined)).rejects.toBe(beginError);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("BEGIN");
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("rolls back operation failures and preserves the original error", async () => {
    const operationError = new Error("operation failed");
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const { client, release } = fakeClient(query);

    await expect(
      inTransaction(fakeDatabase(client), async () => {
        throw operationError;
      }),
    ).rejects.toBe(operationError);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("discards a client when rollback fails instead of returning it to the pool", async () => {
    const operationError = new Error("operation failed");
    const rollbackError = new Error("rollback failed");
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockRejectedValueOnce(rollbackError);
    const { client, release } = fakeClient(query);

    await expect(
      inTransaction(fakeDatabase(client), async () => {
        throw operationError;
      }),
    ).rejects.toMatchObject({
      name: "AggregateError",
      errors: [operationError, rollbackError],
    });
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(rollbackError);
  });
});
