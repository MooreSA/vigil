import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user_profile')
    .addColumn('id', 'integer', (col) => col.primaryKey().defaultTo(1))
    .addColumn('content', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .execute();

  // Enforce single-row constraint
  await sql`
    ALTER TABLE user_profile ADD CONSTRAINT chk_user_profile_singleton
    CHECK (id = 1)
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_user_profile_updated_at
    BEFORE UPDATE ON user_profile
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // Seed the single row
  await sql`INSERT INTO user_profile (id, content) VALUES (1, '')`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_profile').ifExists().execute();
}
