import { createDatabase } from "./connection.js";
import { migrate, rollbackLatest } from "./migration.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const database = createDatabase(databaseUrl);
const client = await database.connect();
try {
  if (process.argv[2] === "up") await migrate(client);
  else if (process.argv[2] === "down") await rollbackLatest(client);
  else throw new Error("Expected migration direction: up or down");
} finally {
  client.release();
  await database.end();
}
