import assert from "node:assert/strict";
import test from "node:test";

import { databasePoolConfig } from "../src/database/connection.js";

test("normalizes the Python asyncpg URL used by the local API", () => {
  assert.deepEqual(
    databasePoolConfig("postgresql+asyncpg://user:secret@db.example.test/rewards?ssl=require"),
    {
      connectionString: "postgresql://user:secret@db.example.test/rewards",
      max: 5,
      ssl: { rejectUnauthorized: false },
    },
  );
});

test("preserves strict verification and explicit local SSL disablement", () => {
  assert.deepEqual(
    databasePoolConfig("postgresql://user:secret@db.example.test/rewards?sslmode=verify-full"),
    {
      connectionString: "postgresql://user:secret@db.example.test/rewards",
      max: 5,
      ssl: { rejectUnauthorized: true },
    },
  );
  assert.deepEqual(
    databasePoolConfig("postgresql://user:secret@127.0.0.1/rewards?sslmode=disable"),
    {
      connectionString: "postgresql://user:secret@127.0.0.1/rewards",
      max: 5,
      ssl: false,
    },
  );
});

test("rejects unsupported database protocols and SSL modes", () => {
  assert.throws(
    () => databasePoolConfig("mysql://user:secret@db.example.test/rewards"),
    /must use postgres/,
  );
  assert.throws(
    () => databasePoolConfig("postgresql://user:secret@db.example.test/rewards?ssl=prefer"),
    /unsupported SSL mode/,
  );
});
