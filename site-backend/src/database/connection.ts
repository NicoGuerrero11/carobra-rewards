import { Pool, type PoolClient } from "pg";

export interface Database {
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}

export function createDatabase(databaseUrl: string): Pool {
  if (!databaseUrl.trim()) throw new Error("DATABASE_URL cannot be empty");
  return new Pool({ connectionString: databaseUrl, max: 5 });
}
