import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('jobs')
    .addColumn('skill_name', 'text')
    .execute();

  await db.schema
    .alterTable('jobs')
    .addColumn('skill_config', 'jsonb')
    .execute();

  await db.schema
    .alterTable('jobs')
    .alterColumn('prompt', (col) => col.dropNotNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`UPDATE jobs SET prompt = '' WHERE prompt IS NULL`.execute(db);

  await db.schema
    .alterTable('jobs')
    .alterColumn('prompt', (col) => col.setNotNull())
    .execute();

  await db.schema
    .alterTable('jobs')
    .dropColumn('skill_config')
    .execute();

  await db.schema
    .alterTable('jobs')
    .dropColumn('skill_name')
    .execute();
}
