import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Client } from "pg";

import { databasePoolConfig } from "../src/database/connection.js";

const base = "postgresql://user:secret@db.example.test/rewards";

for (const mode of ["", "?ssl=require", "?sslmode=verify-full", "?sslmode=verify-ca", "?ssl=true", "?ssl=1"]) {
  test(`requires certificate and destination verification: ${mode || "default"}`, () => {
    const config = databasePoolConfig(base + mode);
    assert.equal(config.connectionString, undefined);
    const client = new Client(config);
    assert.equal(client.host, "db.example.test");
    assert.equal(typeof client.ssl, "object");
    assert.equal(typeof config.ssl, "object");
    if (typeof config.ssl !== "object") throw new Error("TLS missing");
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(typeof config.ssl.checkServerIdentity, "function");
    assert.equal(config.enableChannelBinding, true);
  });
}

test("preserves encoded credentials, asyncpg scheme, and supported application settings", () => {
  // Generated only for this parser test; never used to open a database connection.
  const user = `test@${randomUUID()}`;
  const password = `${randomUUID()}:/%@`;
  const config = databasePoolConfig(`postgresql+asyncpg://${encodeURIComponent(user)}:${encodeURIComponent(password)}@db.example.test:5433/rewards?application_name=test&connect_timeout=2&statement_timeout=50`);
  assert.equal(config.user, user);
  assert.equal(config.password, password);
  assert.equal(config.port, 5433);
  assert.equal(config.application_name, "test");
  assert.equal(config.connectionTimeoutMillis, 2000);
  assert.equal(config.statement_timeout, 50);
});

for (const host of ["127.0.0.1", "[::1]"]) {
  test(`permits explicit plaintext only at literal loopback: ${host}`, () => {
    const config = databasePoolConfig(`postgres://user:secret@${host}/rewards?sslmode=disable`);
    assert.equal(config.ssl, false);
    assert.equal(config.enableChannelBinding, false);
    assert.equal(new Client(config).host, host.replace(/^\[|\]$/g, ""));
  });
}

for (const query of [
  "sslmode=no-verify", "ssl=prefer", "sslmode=allow", "sslmode=disable", "ssl=false", "ssl=0", "sslmode=",
  "sslmode=require&sslmode=no-verify", "sslmode=require&ssl=0", "sslmode=require&sslrootcert=/tmp/ca",
  "sslcert=/tmp/client", "sslkey=/tmp/key", "sslnegotiation=direct", "uselibpqcompat=true",
  "host=127.0.0.1", "hostaddr=127.0.0.1", "port=5432", "connectionString=anything",
  "SSLMode=disable", "%73slmode=disable", "channel_binding=unknown", "channel_binding=prefer&channel_binding=disable",
]) {
  test(`rejects insecure/ambiguous/override parameters: ${query}`, () => {
    assert.throws(() => databasePoolConfig(`${base}?${query}`));
  });
}

test("rejects unsupported required channel binding instead of silently downgrading", () => {
  assert.throws(() => databasePoolConfig(`${base}?sslmode=require&channel_binding=require`), /cannot enforce channel_binding=require/);
  assert.equal(databasePoolConfig(`${base}?channel_binding=prefer`).enableChannelBinding, true);
  assert.equal(databasePoolConfig(`${base}?channel_binding=disable`).enableChannelBinding, false);
});

test("cannot redirect a plaintext loopback exception through another destination", () => {
  for (const url of [
    "postgres://user:secret@127.0.0.1/db?sslmode=disable&host=remote.example",
    "postgres://user:secret@/db?sslmode=disable",
    "postgres://user:secret@%2ftmp/db?sslmode=disable",
    "postgres://user:secret@localhost/db?sslmode=disable",
    "postgres://user:secret@127.0.0.1.example/db?sslmode=disable",
  ]) assert.throws(() => databasePoolConfig(url));
});

test("does not allow environment SSL mode to weaken the explicit policy", () => {
  const previous = process.env.PGSSLMODE;
  try {
    process.env.PGSSLMODE = "no-verify";
    const client = new Client(databasePoolConfig(base));
    assert.equal((client as unknown as { ssl: { rejectUnauthorized: boolean } }).ssl.rejectUnauthorized, true);
  } finally {
    if (previous === undefined) delete process.env.PGSSLMODE;
    else process.env.PGSSLMODE = previous;
  }
});

test("rejects invalid URLs without echoing their credentials", () => {
  for (const url of ["postgresql://user:secret@[]/db", "mysql://user:secret@host/db", `${base}?connect_timeout=-1`]) {
    assert.throws(() => databasePoolConfig(url), (error: unknown) => error instanceof Error && !error.message.includes("secret"));
  }
});
