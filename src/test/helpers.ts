import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { DB } from '../db/types.js';

export function createTestDb(connectionString: string): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString }),
    }),
  });
}

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
