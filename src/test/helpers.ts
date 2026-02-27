import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';
export { createDb as createTestDb } from '../db/client.js';

const TABLES_IN_DELETE_ORDER = [
  'job_runs',
  'jobs',
  'memory_entries',
  'messages',
  'threads',
] as const;

export async function truncateAll(db: Kysely<DB>): Promise<void> {
  await sql`TRUNCATE ${sql.join(
    TABLES_IN_DELETE_ORDER.map((t) => sql.table(t)),
    sql`, `
  )} CASCADE`.execute(db);
}
