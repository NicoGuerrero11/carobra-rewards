import { createDatabase } from '../../database/connection.js';
import { prepareAffiliateEventSchema } from './affiliate-schema.js';
const database = createDatabase(process.env.DATABASE_URL ?? '');
try {
  const client = await database.connect();
  try { console.log(JSON.stringify(await prepareAffiliateEventSchema(client, process.argv.includes('--apply')))); }
  finally { client.release(); }
} catch { console.error('AFFILIATION_SCHEMA_PREPARATION_FAILED'); process.exitCode = 1; }
finally { await database.end(); }
