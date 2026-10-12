import { loadConfig } from '../../config.js';
import { createDatabase } from '../../database/connection.js';
import { createBondaPointsRuntime } from './points-application.js';
const mode = option('--mode') ?? 'process';
if (!process.argv.includes('--apply')) {
  process.stdout.write(JSON.stringify({mode,status:'DRY_RUN'})+'\n');
} else {
  const config = loadConfig();
  if (!config.bonda || !config.databaseUrl) throw Error('Points configuration required');
  if (mode === 'process' && !config.bonda.points?.sendEnabled) process.stdout.write(JSON.stringify({mode,status:'DISABLED'})+'\n');
  else {
    const database = createDatabase(config.databaseUrl);
    try {
      const app = createBondaPointsRuntime(database, config.bonda);
      let result: unknown;
      if (mode === 'process') result = await app.processDue(new Date(), Number(option('--limit') ?? 25), 'bonda-points-cli');
      else if (mode === 'enqueue-existing') {
        if (!process.argv.includes('--acknowledge-uncredited')) throw Error('Confirm historic points have not been credited externally');
        result = await app.store.enqueueExisting(Number(option('--limit') ?? 25), option('--after-entry-id') ?? null);
      } else if (mode === 'inspect') {
        const row = await app.store.read(required('--entry-id'));
        result = {state:row?.state ?? 'NOT_QUEUED',operationId:row?.operation_id ?? null,movementId:row?.movement_id ?? null};
      } else if (mode === 'reconcile') {
        const outcome = required('--outcome'); if (outcome !== 'APPLIED' && outcome !== 'NOT_APPLIED') throw Error('Invalid outcome');
        const movementId = option('--movement-id');
        result = await app.reconcile({ entryId:required('--entry-id'),operationId:required('--operation-id'),outcome,
          reviewerId:required('--reviewer-id'),evidenceReference:required('--evidence-ref'),...(movementId ? {movementId} : {}) }, true);
      } else throw Error('Invalid mode');
      process.stdout.write(JSON.stringify({mode,result})+'\n');
    } catch { process.stderr.write('Points operation did not complete. Review its durable state through authorized operations.\n'); process.exitCode = 1; }
    finally { await database.end(); }
  }
}
function option(key: string) { const index = process.argv.indexOf(key); return index < 0 ? undefined : process.argv[index+1]; }
function required(key: string) { const value = option(key); if (!value || value.startsWith('--')) throw Error('Missing operation argument'); return value; }
