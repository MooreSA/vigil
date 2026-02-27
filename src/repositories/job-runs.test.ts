import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { inject } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../db/types.js';
import { createTestDb, truncateAll } from '../test/helpers.js';
import { JobRepository } from './jobs.js';
import { JobRunRepository } from './job-runs.js';
import { ThreadRepository } from './threads.js';

let db: Kysely<DB>;
let jobRepo: JobRepository;
let runRepo: JobRunRepository;
let threadRepo: ThreadRepository;

beforeAll(() => {
  const url = inject('testDatabaseUrl');
  db = createTestDb(url);
  jobRepo = new JobRepository(db);
  runRepo = new JobRunRepository(db);
  threadRepo = new ThreadRepository(db);
});

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.destroy();
});

async function createJob() {
  return jobRepo.create({
    name: 'Test job',
    schedule: '0 8 * * *',
    prompt: 'Do something',
    next_run_at: new Date('2026-03-01T08:00:00Z'),
  });
}

describe('JobRunRepository', () => {
  describe('createIdempotent', () => {
    it('creates a run and returns true', async () => {
      const job = await createJob();
      const inserted = await runRepo.createIdempotent(job.id, job.next_run_at);

      expect(inserted).toBe(true);
    });

    it('returns false on duplicate (job_id, scheduled_for)', async () => {
      const job = await createJob();
      await runRepo.createIdempotent(job.id, job.next_run_at);
      const dup = await runRepo.createIdempotent(job.id, job.next_run_at);

      expect(dup).toBe(false);
    });

    it('allows different scheduled_for for same job', async () => {
      const job = await createJob();
      const first = await runRepo.createIdempotent(job.id, new Date('2026-03-01T08:00:00Z'));
      const second = await runRepo.createIdempotent(job.id, new Date('2026-03-02T08:00:00Z'));

      expect(first).toBe(true);
      expect(second).toBe(true);
    });
  });

  describe('claimPending', () => {
    it('claims a pending run and sets status to running', async () => {
      const job = await createJob();
      await runRepo.createIdempotent(job.id, job.next_run_at);

      const claimed = await runRepo.claimPending();

      expect(claimed).not.toBeNull();
      expect(claimed!.job_id).toBe(job.id);
      expect(claimed!.status).toBe('running');
    });

    it('returns null when no pending runs', async () => {
      const claimed = await runRepo.claimPending();
      expect(claimed).toBeNull();
    });

    it('does not claim an already-running run', async () => {
      const job = await createJob();
      await runRepo.createIdempotent(job.id, job.next_run_at);
      await runRepo.claimPending(); // first claim

      const second = await runRepo.claimPending();
      expect(second).toBeNull();
    });
  });

  describe('complete', () => {
    it('marks a run as completed with thread_id', async () => {
      const job = await createJob();
      const thread = await threadRepo.create({ source: 'wake' });
      await runRepo.createIdempotent(job.id, job.next_run_at);
      const claimed = await runRepo.claimPending();

      await runRepo.complete(claimed!.id, thread.id);

      const runs = await runRepo.findByJobId(job.id);
      expect(runs[0].status).toBe('completed');
      expect(runs[0].thread_id).toBe(thread.id);
      expect(runs[0].completed_at).toBeInstanceOf(Date);
    });
  });

  describe('fail', () => {
    it('marks a run as failed with error and increments retry_count', async () => {
      const job = await createJob();
      await runRepo.createIdempotent(job.id, job.next_run_at);
      const claimed = await runRepo.claimPending();

      await runRepo.fail(claimed!.id, 'Something broke');

      const runs = await runRepo.findByJobId(job.id);
      expect(runs[0].status).toBe('failed');
      expect(runs[0].error).toBe('Something broke');
      expect(runs[0].retry_count).toBe(1);
    });
  });

  describe('resetAbandoned', () => {
    it('resets running runs with expired locks to pending', async () => {
      const job = await createJob();
      await runRepo.createIdempotent(job.id, job.next_run_at);
      const claimed = await runRepo.claimPending();

      // Manually expire the lock
      await db
        .updateTable('job_runs')
        .set({ locked_until: new Date('2020-01-01T00:00:00Z') })
        .where('id', '=', claimed!.id)
        .execute();

      const count = await runRepo.resetAbandoned();
      expect(count).toBe(1);

      // Should be claimable again
      const reclaimed = await runRepo.claimPending();
      expect(reclaimed).not.toBeNull();
    });

    it('does not reset runs with valid locks', async () => {
      const job = await createJob();
      await runRepo.createIdempotent(job.id, job.next_run_at);
      await runRepo.claimPending(); // sets locked_until to 5min from now

      const count = await runRepo.resetAbandoned();
      expect(count).toBe(0);
    });
  });

  describe('findByJobId', () => {
    it('returns runs ordered by id desc', async () => {
      const job = await createJob();
      await runRepo.createIdempotent(job.id, new Date('2026-03-01T08:00:00Z'));
      await runRepo.createIdempotent(job.id, new Date('2026-03-02T08:00:00Z'));

      const runs = await runRepo.findByJobId(job.id);
      expect(runs).toHaveLength(2);
      expect(BigInt(runs[0].id)).toBeGreaterThan(BigInt(runs[1].id));
    });

    it('returns empty array for unknown job', async () => {
      const runs = await runRepo.findByJobId('999999');
      expect(runs).toHaveLength(0);
    });
  });
});
