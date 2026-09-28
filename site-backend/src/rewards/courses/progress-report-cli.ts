import {createDatabase} from '../../database/connection.js';
import {progressCsv,reportOptions} from './progress-report.js';

async function main() {
  const options=reportOptions(process.argv.slice(2));
  if(!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
  const db=createDatabase(process.env.DATABASE_URL);
  try {
    const client=await db.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const rows=await client.query(`SELECT customer_id,course_id,chapter_id,duration_seconds,watched_seconds,
        manual_completed_at,playback_completed_at,updated_at FROM rewards_course_video_progress
        WHERE ($1::integer IS NULL OR course_id=$1) AND ($2::uuid IS NULL OR customer_id=$2)
        ORDER BY customer_id,course_id,chapter_id LIMIT $3 OFFSET $4`,
        [options.courseId,options.customerId,options.limit,options.offset]);
      await client.query('COMMIT');
      process.stdout.write(progressCsv(rows.rows));
      process.stderr.write(`Rows: ${rows.rows.length}. Offset: ${options.offset}. Limit: ${options.limit}. Playback is not proof of attention.\n`);
    } finally {client.release();}
  } finally {await db.end();}
}
main().catch(()=>{console.error('Progress report failed. Check database access and report options; no credentials were printed.');process.exitCode=1;});
