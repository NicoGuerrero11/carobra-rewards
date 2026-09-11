import { Pool, type PoolClient, type PoolConfig } from "pg";

export interface Database {
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

export function createDatabase(databaseUrl: string): Pool {
  return new Pool(databasePoolConfig(databaseUrl));
}

export function databasePoolConfig(databaseUrl: string): PoolConfig {
  if (!databaseUrl.trim()) throw new Error("DATABASE_URL cannot be empty");

  const url = new URL(databaseUrl);
  if (url.protocol === "postgresql+asyncpg:") url.protocol = "postgresql:";
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use postgres, postgresql, or postgresql+asyncpg");
  }

  const sslMode = (url.searchParams.get("sslmode") ?? url.searchParams.get("ssl"))
    ?.trim()
    .toLowerCase();
  url.searchParams.delete("sslmode");
  url.searchParams.delete("ssl");

  const config: PoolConfig = { connectionString: url.toString(), max: 5 };
  if (!sslMode) return config;
  if (sslMode === "disable" || sslMode === "false" || sslMode === "0") {
    config.ssl = false;
    return config;
  }
  if (sslMode === "require" || sslMode === "no-verify" || sslMode === "true" || sslMode === "1") {
    config.ssl = { rejectUnauthorized: false };
    return config;
  }
  if (sslMode === "verify-ca" || sslMode === "verify-full") {
    config.ssl = { rejectUnauthorized: true };
    return config;
  }
  throw new Error(`DATABASE_URL contains unsupported SSL mode: ${sslMode}`);
}
