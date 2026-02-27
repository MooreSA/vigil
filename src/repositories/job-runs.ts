import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.js';

export class JobRunRepository {
  constructor(private db: Kysely<DB>) {}

  async createIdempotent(jobId: string, scheduledFor: Date | string): Promise<boolean> {
    const ts = scheduledFor instanceof Date ? scheduledFor.toISOString() : scheduledFor;
    const result = await sql`
      INSERT INTO job_runs (job_id, scheduled_for)
      SELECT ${jobId}, ${ts}::timestamptz
      WHERE NOT EXISTS (
        SELECT 1 FROM job_runs
        WHERE job_id = ${jobId} AND status = 'running'
      )
      ON CONFLICT (job_id, scheduled_for) DO NOTHING
    `.execute(this.db);
    return (result.numAffectedRows ?? 0n) > 0n;
  }

  async claimPending() {
    const rows = await sql<{
      id: string;
      job_id: string;
      scheduled_for: Date;
      status: string;
      retry_count: number;
    }>`
      UPDATE job_runs
      SET status = 'running',
          locked_until = NOW() + INTERVAL '5 minutes',
          started_at = NOW()
      WHERE id = (
        SELECT id FROM job_runs
        WHERE status = 'pending'
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `.execute(this.db);
    return rows.rows[0] ?? null;
  }

  async refreshLock(id: string) {
    await sql`
      UPDATE job_runs
      SET locked_until = NOW() + INTERVAL '5 minutes'
      WHERE id = ${id} AND status = 'running'
    `.execute(this.db);
  }

  async complete(id: string, threadId: string | null) {
    await sql`
      UPDATE job_runs
      SET status = 'completed',
          completed_at = NOW(),
          thread_id = ${threadId},
          locked_until = NULL
      WHERE id = ${id}
    `.execute(this.db);
  }

  async fail(id: string, error: string) {
    await sql`
      UPDATE job_runs
      SET status = 'failed',
          retry_count = retry_count + 1,
          error = ${error},
          locked_until = NULL
      WHERE id = ${id}
    `.execute(this.db);
  }

  async resetAbandoned() {
    const result = await sql`
      UPDATE job_runs
      SET status = 'pending',
          locked_until = NULL
      WHERE status = 'running'
        AND locked_until < NOW()
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0n);
  }

  async findByJobId(jobId: string) {
    return this.db
      .selectFrom('job_runs')
      .selectAll()
      .where('job_id', '=', jobId)
      .orderBy('id', 'desc')
      .execute();
  }
}
