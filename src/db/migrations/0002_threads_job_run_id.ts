import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('threads')
    .addColumn('job_run_id', 'bigint', (col) => col.references('job_runs.id'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('threads')
    .dropColumn('job_run_id')
    .execute();
}
