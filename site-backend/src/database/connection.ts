import { isIP } from "node:net";
import { checkServerIdentity } from "node:tls";
import { Pool, type PoolClient, type PoolConfig } from "pg";

export interface Database {
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

type DatabasePoolConfig = PoolConfig & { enableChannelBinding: boolean };

export function createDatabase(databaseUrl: string): Pool {
  return new Pool(databasePoolConfig(databaseUrl));
}

export function databasePoolConfig(databaseUrl: string): DatabasePoolConfig {
  if (!databaseUrl.trim()) throw new Error("DATABASE_URL cannot be empty");
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // URL errors otherwise include the original credentials.
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (url.protocol === "postgresql+asyncpg:") url.protocol = "postgresql:";
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use postgres, postgresql, or postgresql+asyncpg");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || (!isIP(host) && !/^[a-zA-Z0-9.-]+$/.test(host)) || url.hash) {
    throw new Error("DATABASE_URL must contain an explicit DNS hostname or IP address and no fragment");
  }

  const params = url.searchParams;
  const allowed = new Set([
    "sslmode", "ssl", "channel_binding", "application_name", "options",
    "client_encoding", "statement_timeout", "lock_timeout",
    "idle_in_transaction_session_timeout", "connect_timeout",
  ]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) {
      throw new Error("DATABASE_URL contains unsupported or duplicate connection parameters");
    }
  }
  if (params.has("sslmode") && params.has("ssl")) {
    throw new Error("DATABASE_URL must specify only one SSL mode");
  }
  const mode = (params.get("sslmode") ?? params.get("ssl"))?.trim().toLowerCase();
  const plaintext = mode === "disable" || mode === "false" || mode === "0";
  if (plaintext && host !== "127.0.0.1" && host !== "::1") {
    throw new Error("SSL disablement is allowed only for explicit loopback IP connections");
  }
  if (!plaintext && mode !== undefined && !["require", "verify-full", "verify-ca", "true", "1"].includes(mode)) {
    throw new Error("DATABASE_URL contains an unsupported or insecure SSL mode");
  }
  const binding = params.get("channel_binding")?.trim().toLowerCase();
  if (binding === "require") {
    throw new Error("pg cannot enforce channel_binding=require; use verified TLS with channel_binding=prefer or a client that enforces binding");
  }
  if (binding !== undefined && binding !== "prefer" && binding !== "disable") {
    throw new Error("DATABASE_URL contains an unsupported channel_binding mode");
  }

  // Do not pass connectionString: pg's second URL parse overrides explicit TLS
  // settings. Only these validated fields may reach the driver.
  let config: DatabasePoolConfig;
  try {
    config = {
      host,
      port: url.port ? Number(url.port) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      max: 5,
      enableChannelBinding: !plaintext && binding !== "disable",
      ssl: plaintext ? false : {
        rejectUnauthorized: true,
        // Verify the destination even when pg omits SNI for an IP address.
        checkServerIdentity: (_hostname, certificate) => checkServerIdentity(host, certificate),
      },
    };
  } catch {
    throw new Error("DATABASE_URL contains invalid encoded connection fields");
  }
  for (const key of ["application_name", "options", "client_encoding"] as const) {
    if (params.has(key)) config[key] = params.get(key)!;
  }
  for (const key of ["statement_timeout", "lock_timeout", "idle_in_transaction_session_timeout", "connect_timeout"] as const) {
    if (!params.has(key)) continue;
    const value = params.get(key)!;
    const milliseconds = Number(value) * (key === "connect_timeout" ? 1000 : 1);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(milliseconds) || milliseconds > 2_147_483_647) {
      throw new Error("DATABASE_URL contains an invalid timeout");
    }
    if (key === "connect_timeout") config.connectionTimeoutMillis = milliseconds;
    else config[key] = milliseconds;
  }
  return config;
}
