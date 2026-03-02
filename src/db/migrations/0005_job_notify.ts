import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('jobs')
    .addColumn('notify', 'boolean', (col) => col.notNull().defaultTo(true))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('jobs')
    .dropColumn('notify')
    .execute();
}
