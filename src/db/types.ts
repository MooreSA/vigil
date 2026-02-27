import type { ColumnType, Generated, JSONColumnType } from 'kysely';

export interface ThreadsTable {
  id: Generated<string>;
  title: string | null;
  source: 'user' | 'wake';
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, never>;
}

export interface MessagesTable {
  id: Generated<string>;
  thread_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  model: string | null;
  content: JSONColumnType<Record<string, unknown>>;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, never, never>;
}

export interface MemoryEntriesTable {
  id: Generated<string>;
  content: string;
  embedding: string; // pgvector stored as string
  source: 'agent' | 'user';
  thread_id: string | null;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, never>;
}

export interface JobsTable {
  id: Generated<string>;
  name: string;
  schedule: string;
  prompt: string;
  enabled: Generated<boolean>;
  max_retries: Generated<number>;
  next_run_at: ColumnType<Date, Date | string, Date | string>;
  last_run_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  deleted_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, never>;
}

export interface JobRunsTable {
  id: Generated<string>;
  job_id: string;
  scheduled_for: ColumnType<Date, Date | string, Date | string>;
  locked_until: ColumnType<Date | null, Date | string | null, Date | string | null>;
  status: Generated<'pending' | 'running' | 'completed' | 'failed'>;
  retry_count: Generated<number>;
  thread_id: string | null;
  error: string | null;
  started_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  completed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: ColumnType<Date, never, never>;
}

export interface DB {
  threads: ThreadsTable;
  messages: MessagesTable;
  memory_entries: MemoryEntriesTable;
  jobs: JobsTable;
  job_runs: JobRunsTable;
}
