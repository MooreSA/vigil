import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Enable pgvector
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);

  // Trigger function for updated_at
  await sql`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  // Threads
  await db.schema
    .createTable('threads')
    .addColumn('id', sql`bigserial`, (col) => col.primaryKey())
    .addColumn('title', 'text')
    .addColumn('source', 'text', (col) => col.notNull().defaultTo('user'))
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .execute();

  await sql`
    ALTER TABLE threads ADD CONSTRAINT chk_threads_source
    CHECK (source IN ('user', 'wake'))
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_threads_updated_at
    BEFORE UPDATE ON threads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // Messages
  await db.schema
    .createTable('messages')
    .addColumn('id', sql`bigserial`, (col) => col.primaryKey())
    .addColumn('thread_id', 'bigint', (col) =>
      col.notNull().references('threads.id')
    )
    .addColumn('role', 'text', (col) => col.notNull())
    .addColumn('model', 'text')
    .addColumn('content', 'jsonb', (col) => col.notNull())
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .execute();

  await sql`
    ALTER TABLE messages ADD CONSTRAINT chk_messages_role
    CHECK (role IN ('system', 'user', 'assistant', 'tool'))
  `.execute(db);

  await sql`
    CREATE INDEX idx_messages_thread ON messages(thread_id, id)
    WHERE deleted_at IS NULL
  `.execute(db);

  // Memory entries
  await db.schema
    .createTable('memory_entries')
    .addColumn('id', sql`bigserial`, (col) => col.primaryKey())
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('embedding', sql`vector(1536)`, (col) => col.notNull())
    .addColumn('source', 'text', (col) => col.notNull().defaultTo('agent'))
    .addColumn('thread_id', 'bigint', (col) => col.references('threads.id'))
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .execute();

  await sql`
    ALTER TABLE memory_entries ADD CONSTRAINT chk_memory_source
    CHECK (source IN ('agent', 'user'))
  `.execute(db);

  await sql`
    CREATE INDEX idx_memory_embedding ON memory_entries
    USING hnsw (embedding vector_cosine_ops)
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_memory_entries_updated_at
    BEFORE UPDATE ON memory_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // Jobs
  await db.schema
    .createTable('jobs')
    .addColumn('id', sql`bigserial`, (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('schedule', 'text', (col) => col.notNull())
    .addColumn('prompt', 'text', (col) => col.notNull())
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('max_retries', 'integer', (col) => col.notNull().defaultTo(3))
    .addColumn('next_run_at', 'timestamptz', (col) => col.notNull())
    .addColumn('last_run_at', 'timestamptz')
    .addColumn('deleted_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .execute();

  await sql`
    CREATE INDEX idx_jobs_next_run ON jobs(next_run_at)
    WHERE enabled = TRUE AND deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db);

  // Job runs
  await db.schema
    .createTable('job_runs')
    .addColumn('id', sql`bigserial`, (col) => col.primaryKey())
    .addColumn('job_id', 'bigint', (col) =>
      col.notNull().references('jobs.id')
    )
    .addColumn('scheduled_for', 'timestamptz', (col) => col.notNull())
    .addColumn('locked_until', 'timestamptz')
    .addColumn('status', 'text', (col) =>
      col.notNull().defaultTo('pending')
    )
    .addColumn('retry_count', 'integer', (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn('thread_id', 'bigint', (col) => col.references('threads.id'))
    .addColumn('error', 'text')
    .addColumn('started_at', 'timestamptz')
    .addColumn('completed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .execute();

  await sql`
    ALTER TABLE job_runs ADD CONSTRAINT chk_job_runs_status
    CHECK (status IN ('pending', 'running', 'completed', 'failed'))
  `.execute(db);

  await sql`
    ALTER TABLE job_runs ADD CONSTRAINT uq_job_runs_job_scheduled
    UNIQUE (job_id, scheduled_for)
  `.execute(db);

  await sql`
    CREATE INDEX idx_job_runs_job ON job_runs(job_id)
  `.execute(db);

  await sql`
    CREATE INDEX idx_job_runs_status ON job_runs(status, locked_until)
    WHERE status IN ('pending', 'running')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('job_runs').ifExists().execute();
  await db.schema.dropTable('jobs').ifExists().execute();
  await db.schema.dropTable('memory_entries').ifExists().execute();
  await db.schema.dropTable('messages').ifExists().execute();
  await db.schema.dropTable('threads').ifExists().execute();
  await sql`DROP FUNCTION IF EXISTS set_updated_at()`.execute(db);
  await sql`DROP EXTENSION IF EXISTS vector`.execute(db);
}
