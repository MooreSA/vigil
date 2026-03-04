import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('user_profile')
    .addColumn('timezone', 'text', (col) => col.notNull().defaultTo('UTC'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('user_profile')
    .dropColumn('timezone')
    .execute();
}
